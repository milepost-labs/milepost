#![cfg(test)]

use super::*;
use milepost_test_utils::hash;
use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, Env};

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
        ),
        Err(Ok(Error::SchemaAlreadyExists))
    );
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
