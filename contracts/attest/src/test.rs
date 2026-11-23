#![cfg(test)]

use super::*;
use milepost_test_utils::{assert_events, hash};
use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, Env, Event as _};

struct Fixture {
    env: Env,
    client: AttestClient<'static>,
    authority: Address,
    subject: Address,
}

fn setup() -> Fixture {
    let env = milepost_test_utils::new_test_env();
    let id = env.register(Attest, ());
    let client = AttestClient::new(&env, &id);
    let authority = Address::generate(&env);
    let subject = Address::generate(&env);
    Fixture {
        env,
        client,
        authority,
        subject,
    }
}

fn open_schema(f: &Fixture) -> BytesN<32> {
    f.client.register_schema(
        &f.authority,
        &String::from_str(&f.env, "enrolment:v1"),
        &true,
        &false,
        &None,
    )
}

#[test]
fn registers_a_schema_and_reads_it_back() {
    let f = setup();
    let uid = open_schema(&f);

    let schema = f.client.get_schema(&uid);
    assert_eq!(schema.uid, uid);
    assert_eq!(schema.authority, f.authority);
    assert!(schema.revocable);
    assert!(!schema.restricted);
}

#[test]
fn identical_schemas_collide_rather_than_duplicate() {
    let f = setup();
    open_schema(&f);
    assert_eq!(
        f.client.try_register_schema(
            &f.authority,
            &String::from_str(&f.env, "enrolment:v1"),
            &true,
            &false,
            &None,
        ),
        Err(Ok(Error::SchemaAlreadyExists))
    );
}

#[test]
fn a_schema_cannot_predecessor_itself() {
    let f = setup();
    let first = open_schema(&f);

    assert_eq!(
        f.client.try_register_schema(
            &f.authority,
            &String::from_str(&f.env, "enrolment:v1"),
            &true,
            &false,
            &Some(first),
        ),
        Err(Ok(Error::CycleDetected))
    );
}

#[test]
fn an_indirect_schema_cycle_is_rejected() {
    let f = setup();
    let first = open_schema(&f);
    let second = f.client.register_schema(
        &f.authority,
        &String::from_str(&f.env, "enrolment:v2"),
        &true,
        &false,
        &Some(first.clone()),
    );

    assert_eq!(
        f.client.try_register_schema(
            &f.authority,
            &String::from_str(&f.env, "enrolment:v1"),
            &true,
            &false,
            &Some(second),
        ),
        Err(Ok(Error::CycleDetected))
    );
}

#[test]
fn a_valid_predecessor_chain_registers() {
    let f = setup();
    let first = open_schema(&f);
    let second = f.client.register_schema(
        &f.authority,
        &String::from_str(&f.env, "enrolment:v2"),
        &true,
        &false,
        &Some(first),
    );
    let third = f.client.register_schema(
        &f.authority,
        &String::from_str(&f.env, "enrolment:v3"),
        &true,
        &false,
        &Some(second.clone()),
    );

    assert_eq!(f.client.get_schema(&third).predecessor, Some(second));
}

#[test]
fn same_definition_from_a_different_authority_is_a_different_schema() {
    let f = setup();
    let first = open_schema(&f);
    let other = Address::generate(&f.env);
    let second = f.client.register_schema(
        &other,
        &String::from_str(&f.env, "enrolment:v1"),
        &true,
        &false,
        &None,
    );
    assert_ne!(first, second);
}

#[test]
fn attests_and_validates() {
    let f = setup();
    let schema = open_schema(&f);

    let uid = f
        .client
        .attest(&f.authority, &schema, &f.subject, &hash(&f.env, 1), &None);

    assert!(f.client.is_valid(&uid));
    let a = f.client.get(&uid);
    assert_eq!(a.subject, f.subject);
    assert_eq!(a.attester, f.authority);
    assert_eq!(a.schema, schema);
    assert_eq!(a.revoked_at, None);
}

#[test]
fn repeated_identical_claims_get_distinct_ids() {
    let f = setup();
    let schema = open_schema(&f);

    let first = f
        .client
        .attest(&f.authority, &schema, &f.subject, &hash(&f.env, 1), &None);
    let second = f
        .client
        .attest(&f.authority, &schema, &f.subject, &hash(&f.env, 1), &None);

    assert_ne!(first, second, "nonce must keep repeat claims distinct");
    assert!(f.client.is_valid(&first));
    assert!(f.client.is_valid(&second));
}

#[test]
fn expiry_invalidates_without_touching_storage() {
    let f = setup();
    let schema = open_schema(&f);
    let expires_at = f.env.ledger().timestamp() + 1_000;

    let uid = f.client.attest(
        &f.authority,
        &schema,
        &f.subject,
        &hash(&f.env, 1),
        &Some(expires_at),
    );
    assert!(f.client.is_valid(&uid));

    f.env.ledger().set_timestamp(expires_at + 1);
    assert!(!f.client.is_valid(&uid));
    // The record survives so the history stays auditable after expiry.
    assert_eq!(f.client.get(&uid).uid, uid);
}

#[test]
fn expiry_already_in_the_past_is_rejected() {
    let f = setup();
    let schema = open_schema(&f);
    f.env.ledger().set_timestamp(5_000);

    assert_eq!(
        f.client.try_attest(
            &f.authority,
            &schema,
            &f.subject,
            &hash(&f.env, 1),
            &Some(4_999)
        ),
        Err(Ok(Error::ExpiryInPast))
    );
}

#[test]
fn revocation_invalidates_and_is_recorded() {
    let f = setup();
    let schema = open_schema(&f);
    let uid = f
        .client
        .attest(&f.authority, &schema, &f.subject, &hash(&f.env, 1), &None);

    f.env.ledger().set_timestamp(9_000);
    f.client.revoke(&f.authority, &uid);

    assert!(!f.client.is_valid(&uid));
    assert_eq!(f.client.get(&uid).revoked_at, Some(9_000));
}

#[test]
fn only_the_original_attester_may_revoke() {
    let f = setup();
    let schema = open_schema(&f);
    let uid = f
        .client
        .attest(&f.authority, &schema, &f.subject, &hash(&f.env, 1), &None);

    let stranger = Address::generate(&f.env);
    assert_eq!(
        f.client.try_revoke(&stranger, &uid),
        Err(Ok(Error::NotAttester))
    );
    assert!(f.client.is_valid(&uid));
}

#[test]
fn double_revocation_is_rejected() {
    let f = setup();
    let schema = open_schema(&f);
    let uid = f
        .client
        .attest(&f.authority, &schema, &f.subject, &hash(&f.env, 1), &None);

    f.client.revoke(&f.authority, &uid);
    assert_eq!(
        f.client.try_revoke(&f.authority, &uid),
        Err(Ok(Error::AlreadyRevoked))
    );
}

#[test]
fn irrevocable_schemas_reject_revocation() {
    let f = setup();
    let schema = f.client.register_schema(
        &f.authority,
        &String::from_str(&f.env, "completion:v1"),
        &false,
        &false,
        &None,
    );
    let uid = f
        .client
        .attest(&f.authority, &schema, &f.subject, &hash(&f.env, 1), &None);

    assert_eq!(
        f.client.try_revoke(&f.authority, &uid),
        Err(Ok(Error::NotRevocable))
    );
    assert!(f.client.is_valid(&uid));
}

#[test]
fn restricted_schemas_admit_only_their_authority() {
    let f = setup();
    let schema = f.client.register_schema(
        &f.authority,
        &String::from_str(&f.env, "shifts-worked:v1"),
        &true,
        &true,
        &None,
    );

    let stranger = Address::generate(&f.env);
    assert_eq!(
        f.client
            .try_attest(&stranger, &schema, &f.subject, &hash(&f.env, 1), &None),
        Err(Ok(Error::AttesterNotAuthorized))
    );

    let uid = f
        .client
        .attest(&f.authority, &schema, &f.subject, &hash(&f.env, 1), &None);
    assert!(f.client.is_valid(&uid));
}

#[test]
fn open_schemas_admit_anyone_and_record_who() {
    let f = setup();
    let schema = open_schema(&f);
    let stranger = Address::generate(&f.env);

    let uid = f
        .client
        .attest(&stranger, &schema, &f.subject, &hash(&f.env, 1), &None);

    // Valid, but the consumer is the one who has to care that `attester` is not
    // the authority. This is the trap `is_valid` alone cannot protect against.
    assert!(f.client.is_valid(&uid));
    assert_eq!(f.client.get(&uid).attester, stranger);
}

#[test]
fn unknown_ids_are_invalid_rather_than_fatal() {
    let f = setup();
    assert!(!f.client.is_valid(&hash(&f.env, 9)));
    assert_eq!(
        f.client.try_get(&hash(&f.env, 9)),
        Err(Ok(Error::AttestationNotFound))
    );
}

#[test]
fn attesting_under_an_unknown_schema_is_rejected() {
    let f = setup();
    assert_eq!(
        f.client.try_attest(
            &f.authority,
            &hash(&f.env, 7),
            &f.subject,
            &hash(&f.env, 1),
            &None
        ),
        Err(Ok(Error::SchemaNotFound))
    );
}

#[test]
fn keepalive_is_permissionless_but_needs_a_real_id() {
    let f = setup();
    let schema = open_schema(&f);
    let uid = f
        .client
        .attest(&f.authority, &schema, &f.subject, &hash(&f.env, 1), &None);

    // Anyone may pay to keep someone else's proof alive.
    f.client.keepalive(&uid);

    assert_eq!(
        f.client.try_keepalive(&hash(&f.env, 9)),
        Err(Ok(Error::AttestationNotFound))
    );
}

#[test]
fn verify_requires_subject_schema_and_attester_to_all_match() {
    let f = setup();
    let schema = open_schema(&f);
    let uid = f
        .client
        .attest(&f.authority, &schema, &f.subject, &hash(&f.env, 1), &None);

    assert!(f.client.verify(&uid, &f.subject, &schema, &f.authority));

    let other = Address::generate(&f.env);
    let other_schema = f.client.register_schema(
        &f.authority,
        &String::from_str(&f.env, "unrelated:v1"),
        &true,
        &false,
        &None,
    );

    // Each of the three is independently sufficient to reject.
    assert!(!f.client.verify(&uid, &other, &schema, &f.authority));
    assert!(!f
        .client
        .verify(&uid, &f.subject, &other_schema, &f.authority));
    assert!(!f.client.verify(&uid, &f.subject, &schema, &other));
}

#[test]
fn verify_rejects_revoked_and_expired_claims() {
    let f = setup();
    let schema = open_schema(&f);
    let expires_at = 5_000;
    let live = f.client.attest(
        &f.authority,
        &schema,
        &f.subject,
        &hash(&f.env, 1),
        &Some(expires_at),
    );
    let revoked = f
        .client
        .attest(&f.authority, &schema, &f.subject, &hash(&f.env, 2), &None);

    f.client.revoke(&f.authority, &revoked);
    assert!(!f.client.verify(&revoked, &f.subject, &schema, &f.authority));

    assert!(f.client.verify(&live, &f.subject, &schema, &f.authority));
    f.env.ledger().set_timestamp(expires_at + 1);
    assert!(!f.client.verify(&live, &f.subject, &schema, &f.authority));
}

#[test]
fn verify_rejects_an_unknown_id() {
    let f = setup();
    let schema = open_schema(&f);
    assert!(!f
        .client
        .verify(&hash(&f.env, 9), &f.subject, &schema, &f.authority));
}

mod proptests {

    use super::*;
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn verify_is_true_exactly_for_matching_live_attestations(
            subject_matches in any::<bool>(),
            schema_matches in any::<bool>(),
            attester_matches in any::<bool>(),
            revoked in any::<bool>(),
            expired in any::<bool>(),
        ) {
            let f = setup();
            let schema = open_schema(&f);
            let other_subject = Address::generate(&f.env);
            let other_attester = Address::generate(&f.env);
            let other_schema = f.client.register_schema(
                &f.authority,
                &String::from_str(&f.env, "other:v1"),
                &true,
                &false,
                &None,
            );
            let uid = f.client.attest(
                &f.authority,
                &schema,
                &f.subject,
                &hash(&f.env, 1),
                &Some(1),
            );

            if revoked {
                f.client.revoke(&f.authority, &uid);
            }
            if expired {
                f.env.ledger().set_timestamp(2);
            }

            let expected = subject_matches
                && schema_matches
                && attester_matches
                && !revoked
                && !expired;
            assert_eq!(
                f.client.verify(
                    &uid,
                    if subject_matches { &f.subject } else { &other_subject },
                    if schema_matches { &schema } else { &other_schema },
                    if attester_matches { &f.authority } else { &other_attester },
                ),
                expected,
            );
            assert_eq!(f.client.is_valid(&uid), !revoked && !expired);
        }
    }
}

// ---- archival simulation ----
//
// Attestations and schemas are persistent entries with a TTL. Since protocol 23
// an archived persistent entry is automatically restored on access. These tests
// advance past the bump window and assert that all fields survive.

#[test]
fn schema_survives_archival() {
    let f = setup();
    let uid = open_schema(&f);

    let seq = f.env.ledger().sequence();
    f.env.ledger().set_sequence_number(seq + BUMP_LEDGERS + 10);

    let s = f.client.get_schema(&uid);
    assert_eq!(s.uid, uid);
    assert_eq!(s.authority, f.authority);
    assert!(s.revocable);
    assert!(!s.restricted);
}

#[test]
fn attestation_survives_archival_and_preserves_all_fields() {
    let f = setup();
    let schema = open_schema(&f);
    let uid = f
        .client
        .attest(&f.authority, &schema, &f.subject, &hash(&f.env, 1), &None);

    let seq = f.env.ledger().sequence();
    f.env.ledger().set_sequence_number(seq + BUMP_LEDGERS + 10);

    let a = f.client.get(&uid);
    assert_eq!(a.uid, uid);
    assert_eq!(a.schema, schema);
    assert_eq!(a.attester, f.authority);
    assert_eq!(a.subject, f.subject);
    assert_eq!(a.revoked_at, None);
    assert!(f.client.is_valid(&uid));
}

#[test]
fn revoked_attestation_stays_revoked_after_archival() {
    let f = setup();
    let schema = open_schema(&f);
    let uid = f
        .client
        .attest(&f.authority, &schema, &f.subject, &hash(&f.env, 1), &None);

    f.env.ledger().set_timestamp(9_000);
    f.client.revoke(&f.authority, &uid);
    assert!(!f.client.is_valid(&uid));

    let seq = f.env.ledger().sequence();
    f.env.ledger().set_sequence_number(seq + BUMP_LEDGERS + 10);

    assert!(!f.client.is_valid(&uid), "revocation must survive archival");
    assert_eq!(f.client.get(&uid).revoked_at, Some(9_000));
}

#[test]
fn expired_attestation_stays_invalid_after_archival() {
    let f = setup();
    let schema = open_schema(&f);
    let expires_at = f.env.ledger().timestamp() + 1_000;
    let uid = f.client.attest(
        &f.authority,
        &schema,
        &f.subject,
        &hash(&f.env, 1),
        &Some(expires_at),
    );

    f.env.ledger().set_timestamp(expires_at + 1);
    assert!(!f.client.is_valid(&uid));

    let seq = f.env.ledger().sequence();
    f.env.ledger().set_sequence_number(seq + BUMP_LEDGERS + 10);

    assert!(!f.client.is_valid(&uid), "expiry must survive archival");
    // The record still exists so history stays auditable.
    assert_eq!(f.client.get(&uid).uid, uid);
}

#[test]
fn keepalive_extends_attestation_ttl() {
    let f = setup();
    let schema = open_schema(&f);
    let uid = f
        .client
        .attest(&f.authority, &schema, &f.subject, &hash(&f.env, 1), &None);

    let seq_before = f.env.ledger().sequence();
    f.client.keepalive(&uid);

    // After keepalive, the attestation must survive BUMP_LEDGERS more ledgers.
    f.env
        .ledger()
        .set_sequence_number(seq_before + BUMP_LEDGERS + 5);
    assert!(f.client.is_valid(&uid));
    assert_eq!(f.client.get(&uid).uid, uid);
}

#[test]
fn schema_survives_archival_without_keepalive() {
    let f = setup();
    let uid = open_schema(&f);

    let seq_before = f.env.ledger().sequence();
    // `keepalive` only accepts attestation UIDs, not schema UIDs, so schemas
    // rely on automatic restoration on read. Verify that works.
    f.env
        .ledger()
        .set_sequence_number(seq_before + BUMP_LEDGERS + 5);
    let s = f.client.get_schema(&uid);
    assert_eq!(s.uid, uid);
}

// ---- events ----
//
// The registry keeps no lists on-chain, so these events *are* the record an
// indexer builds "every attestation for this subject" from. Asserting them
// field by field is what stops a topic being renamed or a field silently
// dropped in a way only an off-chain consumer would notice.

#[test]
fn registering_a_schema_publishes_it() {
    let f = setup();
    let definition = String::from_str(&f.env, "enrolment:v1");
    let uid = f
        .client
        .register_schema(&f.authority, &definition, &true, &false, &None);

    let schema = Schema {
        uid: uid.clone(),
        authority: f.authority.clone(),
        definition,
        revocable: true,
        restricted: false,
        predecessor: None,
    };
    assert_events(
        &f.env,
        &f.client.address,
        &[SchemaRegistered { uid, schema }.to_xdr(&f.env, &f.client.address)],
    );
}

#[test]
fn attesting_publishes_the_whole_attestation() {
    // An indexer cannot call `get` for every attestation it hears about, so the
    // event has to carry the fields a consumer filters on: who, about whom,
    // under which schema, and when.
    let f = setup();
    f.env.ledger().set_timestamp(1_000);
    let schema = open_schema(&f);
    let data = hash(&f.env, 7);

    let uid = f
        .client
        .attest(&f.authority, &schema, &f.subject, &data, &Some(9_000));

    let attestation = Attestation {
        uid: uid.clone(),
        schema,
        attester: f.authority.clone(),
        subject: f.subject.clone(),
        data_hash: data,
        created_at: 1_000,
        expires_at: Some(9_000),
        revoked_at: None,
    };
    assert_events(
        &f.env,
        &f.client.address,
        &[Attested {
            subject: f.subject.clone(),
            uid: uid.clone(),
            attestation,
        }
        .to_xdr(&f.env, &f.client.address)],
    );
}

#[test]
fn revoking_publishes_the_time_it_took_effect() {
    let f = setup();
    let schema = open_schema(&f);
    let uid = f
        .client
        .attest(&f.authority, &schema, &f.subject, &hash(&f.env, 1), &None);
    f.env.ledger().set_timestamp(4_242);

    f.client.revoke(&f.authority, &uid);

    assert_events(
        &f.env,
        &f.client.address,
        &[Revoked {
            uid,
            revoked_at: 4_242,
        }
        .to_xdr(&f.env, &f.client.address)],
    );
}

#[test]
fn a_failed_call_publishes_nothing() {
    // Otherwise an indexer replaying events would record a claim that was
    // rolled back.
    let f = setup();
    open_schema(&f);
    let repeat = f.client.try_register_schema(
        &f.authority,
        &String::from_str(&f.env, "enrolment:v1"),
        &true,
        &false,
        &None,
    );
    assert_eq!(repeat, Err(Ok(Error::SchemaAlreadyExists)));
    assert_events(&f.env, &f.client.address, &[]);
}

// ---- cost of a long predecessor chain ----

extern crate std;

/// Register `versions` schema versions, each naming the previous one as its
/// predecessor, and check the cost of registering version `n` for every `n` in
/// `checked`. Registering version `n` walks the `n - 1` schemas already behind
/// it, so `n - 1` is the chain depth that registration pays for.
fn register_chain_checking(f: &Fixture, versions: u32, checked: &[u32]) {
    f.env.cost_estimate().disable_resource_limits();
    let mut predecessor: Option<BytesN<32>> = None;
    for n in 1..=versions {
        // Distinct definitions give each version its own uid.
        let name = String::from_str(&f.env, &version_name(n));
        f.env.cost_estimate().budget().reset_unlimited();
        let uid = f
            .client
            .register_schema(&f.authority, &name, &true, &false, &predecessor);
        if checked.contains(&n) {
            milepost_test_utils::assert_within_network_limits!(&chain_label(n - 1), f.env);
        }
        predecessor = Some(uid);
    }
}

fn version_name(n: u32) -> std::string::String {
    std::format!("enrolment:v{n}")
}

fn chain_label(depth: u32) -> std::string::String {
    std::format!("register_schema behind a chain of {depth}")
}

/// How the cost of `register_schema` grows with the length of the predecessor
/// chain behind it, at depths from 0 to past the walk's own cap.
///
/// Run with `--nocapture` to see the table. The cycle check stops after 64
/// links (`check_cycle`), so cost climbs with depth up to 64 and is flat after
/// that. Every depth printed here is asserted under 80% of the network limits.
#[test]
fn schema_registration_cost_by_chain_depth() {
    let f = setup();
    // Version n sits behind a chain of n - 1 predecessors.
    register_chain_checking(&f, 101, &[1, 2, 5, 9, 17, 33, 65, 66, 101]);
}

/// The depth this contract is pinned to as safe: 64 links, the longest chain
/// `check_cycle` ever walks. Registering behind a chain this long stays under
/// 80% of every network limit, and the number of ledger entries it touches is
/// pinned so a change that makes the walk read more than the chain itself shows
/// up here.
#[test]
fn registering_behind_a_chain_of_the_safe_depth_stays_within_network_limits() {
    const SAFE_DEPTH: u32 = 64;
    let f = setup();
    f.env.cost_estimate().disable_resource_limits();

    let mut predecessor: Option<BytesN<32>> = None;
    for n in 0..=SAFE_DEPTH {
        let name = String::from_str(&f.env, &version_name(n + 1));
        f.env.cost_estimate().budget().reset_unlimited();
        predecessor =
            Some(
                f.client
                    .register_schema(&f.authority, &name, &true, &false, &predecessor),
            );
    }
    // `register_schema` for version SAFE_DEPTH + 1 above was the last call, so
    // its resources are the ones the environment holds.
    milepost_test_utils::assert_within_network_limits!(&chain_label(SAFE_DEPTH), f.env);
    let r = f.env.cost_estimate().resources();
    // One entry per link walked plus the instance and the new schema; never
    // more than the chain plus a small constant.
    let entries = r.disk_read_entries + r.memory_read_entries + r.write_entries;
    assert!(
        entries <= SAFE_DEPTH + 8,
        "touched {entries} entries for a chain of {SAFE_DEPTH}"
    );
    // Pinned: the walk is read-only, so registering writes only what a
    // registration without a predecessor writes.
    assert_eq!(r.write_entries, 2);
// ---- TTL policy (#671) ----

#[test]
fn register_schema_bumps_schema_and_predecessor_ttl() {
    use soroban_sdk::testutils::storage::Persistent as _;

    let f = setup();
    let ttl = |key: &Key| {
        f.env.as_contract(&f.client.address, || {
            f.env.storage().persistent().get_ttl(key)
        })
    };

    let s1 = open_schema(&f);
    assert!(ttl(&Key::Schema(s1.clone())) >= BUMP_LEDGERS - 1);

    // Advance past the 60-day bump threshold (90 - 40 = 50 days remaining).
    f.env
        .ledger()
        .with_mut(|l| l.sequence_number += 40 * DAY_IN_LEDGERS);
    assert!(ttl(&Key::Schema(s1.clone())) < BUMP_THRESHOLD);

    // Registering a successor reads and bumps the predecessor schema too.
    let s2 = f.client.register_schema(
        &f.authority,
        &String::from_str(&f.env, "enrolment:v2"),
        &true,
        &false,
        &Some(s1.clone()),
    );
    assert!(ttl(&Key::Schema(s2)) >= BUMP_LEDGERS - 1);
    assert!(ttl(&Key::Schema(s1)) >= BUMP_LEDGERS - 1);
}

#[test]
fn attest_bumps_attestation_and_schema_but_not_instance() {
    use soroban_sdk::testutils::storage::{Instance as _, Persistent as _};

    let f = setup();
    let persistent_ttl = |key: &Key| {
        f.env.as_contract(&f.client.address, || {
            f.env.storage().persistent().get_ttl(key)
        })
    };
    let instance_ttl = || {
        f.env
            .as_contract(&f.client.address, || f.env.storage().instance().get_ttl())
    };

    let schema = open_schema(&f);
    let a1 = f
        .client
        .attest(&f.authority, &schema, &f.subject, &hash(&f.env, 1), &None);

    assert!(persistent_ttl(&Key::Attestation(a1.clone())) >= BUMP_LEDGERS - 1);
    assert!(persistent_ttl(&Key::Schema(schema.clone())) >= BUMP_LEDGERS - 1);
    // `Nonce` lives in instance storage and is not bumped on `attest`.
    assert!(instance_ttl() < BUMP_THRESHOLD);

    f.env
        .ledger()
        .with_mut(|l| l.sequence_number += 40 * DAY_IN_LEDGERS);
    assert!(persistent_ttl(&Key::Schema(schema.clone())) < BUMP_THRESHOLD);

    let a2 = f
        .client
        .attest(&f.authority, &schema, &f.subject, &hash(&f.env, 2), &None);
    assert!(persistent_ttl(&Key::Attestation(a2)) >= BUMP_LEDGERS - 1);
    assert!(persistent_ttl(&Key::Schema(schema)) >= BUMP_LEDGERS - 1);
    // An unrelated attestation is not bumped when a new one is created.
    assert!(persistent_ttl(&Key::Attestation(a1)) < BUMP_THRESHOLD);
}

#[test]
fn revoke_bumps_attestation_and_schema_ttl() {
    use soroban_sdk::testutils::storage::Persistent as _;

    let f = setup();
    let ttl = |key: &Key| {
        f.env.as_contract(&f.client.address, || {
            f.env.storage().persistent().get_ttl(key)
        })
    };

    let schema = open_schema(&f);
    let uid = f
        .client
        .attest(&f.authority, &schema, &f.subject, &hash(&f.env, 1), &None);
    assert!(ttl(&Key::Attestation(uid.clone())) >= BUMP_LEDGERS - 1);

    f.env
        .ledger()
        .with_mut(|l| l.sequence_number += 40 * DAY_IN_LEDGERS);
    assert!(ttl(&Key::Attestation(uid.clone())) < BUMP_THRESHOLD);
    assert!(ttl(&Key::Schema(schema.clone())) < BUMP_THRESHOLD);

    f.client.revoke(&f.authority, &uid);
    assert!(ttl(&Key::Attestation(uid)) >= BUMP_LEDGERS - 1);
    assert!(ttl(&Key::Schema(schema)) >= BUMP_LEDGERS - 1);
}

#[test]
fn keepalive_bumps_attestation_but_not_schema_ttl() {
    use soroban_sdk::testutils::storage::Persistent as _;

    let f = setup();
    let ttl = |key: &Key| {
        f.env.as_contract(&f.client.address, || {
            f.env.storage().persistent().get_ttl(key)
        })
    };

    let schema = open_schema(&f);
    let uid = f
        .client
        .attest(&f.authority, &schema, &f.subject, &hash(&f.env, 1), &None);

    f.env
        .ledger()
        .with_mut(|l| l.sequence_number += 40 * DAY_IN_LEDGERS);
    assert!(ttl(&Key::Attestation(uid.clone())) < BUMP_THRESHOLD);
    assert!(ttl(&Key::Schema(schema.clone())) < BUMP_THRESHOLD);

    f.client.keepalive(&uid);
    assert!(ttl(&Key::Attestation(uid)) >= BUMP_LEDGERS - 1);
    // `keepalive` targets a single attestation and leaves its schema untouched.
    assert!(ttl(&Key::Schema(schema)) < BUMP_THRESHOLD);
}
