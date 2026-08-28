#![cfg(test)]

use super::*;
use milepost_test_utils::hash;
use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, Env};

struct Fixture {
    env: Env,
    client: RecordClient<'static>,
    admin: Address,
    writer: Address,
    subject: Address,
    programme: Address,
}

fn setup() -> Fixture {
    let env = milepost_test_utils::new_test_env();
    let admin = Address::generate(&env);
    let id = env.register(Record, (admin.clone(),));
    let client = RecordClient::new(&env, &id);

    let writer = Address::generate(&env);
    client.add_writer(&writer);

    Fixture {
        env: env.clone(),
        client,
        admin,
        writer,
        subject: Address::generate(&env),
        programme: Address::generate(&env),
    }
}

const GENESIS: [u8; 32] = [0u8; 32];

#[test]
fn constructor_sets_admin() {
    let f = setup();
    assert_eq!(f.client.get_admin(), f.admin);
}

#[test]
fn first_credit_creates_standing() {
    let f = setup();
    f.env.ledger().set_timestamp(1_000);

    let s = f
        .client
        .credit(&f.writer, &f.subject, &f.programme, &500, &hash(&f.env, 1));

    assert_eq!(s.subject, f.subject);
    assert_eq!(s.programmes, 1);
    assert_eq!(s.tranches, 1);
    assert_eq!(s.total_received, 500);
    assert_eq!(s.first_seen, 1_000);
    assert_eq!(s.last_seen, 1_000);
    assert_ne!(
        s.history_root,
        BytesN::from_array(&f.env, &GENESIS),
        "root must move off genesis on the first credit"
    );
}

#[test]
fn aggregates_accumulate_across_tranches() {
    let f = setup();

    f.client
        .credit(&f.writer, &f.subject, &f.programme, &500, &hash(&f.env, 1));
    f.env.ledger().set_timestamp(2_000);
    let s = f
        .client
        .credit(&f.writer, &f.subject, &f.programme, &250, &hash(&f.env, 2));

    assert_eq!(s.tranches, 2);
    assert_eq!(s.total_received, 750);
    assert_eq!(s.last_seen, 2_000);
    assert_eq!(s.first_seen, 0, "first_seen must not move");
}

#[test]
fn programmes_counts_distinct_programmes_only() {
    let f = setup();
    let other = Address::generate(&f.env);

    f.client
        .credit(&f.writer, &f.subject, &f.programme, &100, &hash(&f.env, 1));
    let s = f
        .client
        .credit(&f.writer, &f.subject, &f.programme, &100, &hash(&f.env, 2));
    assert_eq!(s.programmes, 1, "same programme must not count twice");

    let s = f
        .client
        .credit(&f.writer, &f.subject, &other, &100, &hash(&f.env, 3));
    assert_eq!(s.programmes, 2);
    assert_eq!(s.tranches, 3);
}

#[test]
fn standing_is_per_subject() {
    let f = setup();
    let other = Address::generate(&f.env);

    f.client
        .credit(&f.writer, &f.subject, &f.programme, &500, &hash(&f.env, 1));
    f.client
        .credit(&f.writer, &other, &f.programme, &100, &hash(&f.env, 2));

    assert_eq!(f.client.get(&f.subject).total_received, 500);
    assert_eq!(f.client.get(&other).total_received, 100);
}

#[test]
fn history_root_chains_and_is_reproducible_offchain() {
    let f = setup();
    f.env.ledger().set_timestamp(1_000);

    // An auditor holding only the off-chain event log can rebuild the chain from
    // genesis and confirm it matches what the contract stores.
    let mut expected = BytesN::from_array(&f.env, &GENESIS);
    expected = f
        .client
        .next_root(&expected, &f.programme, &500, &hash(&f.env, 1), &1_000);

    let s = f
        .client
        .credit(&f.writer, &f.subject, &f.programme, &500, &hash(&f.env, 1));
    assert_eq!(s.history_root, expected);

    f.env.ledger().set_timestamp(2_000);
    expected = f
        .client
        .next_root(&expected, &f.programme, &250, &hash(&f.env, 2), &2_000);
    let s = f
        .client
        .credit(&f.writer, &f.subject, &f.programme, &250, &hash(&f.env, 2));
    assert_eq!(s.history_root, expected);
}

#[test]
fn a_forged_history_produces_a_different_root() {
    let f = setup();
    f.env.ledger().set_timestamp(1_000);

    let real = f
        .client
        .credit(&f.writer, &f.subject, &f.programme, &500, &hash(&f.env, 1))
        .history_root;

    // Same release, but claiming a larger amount — the whole point of the chain.
    let genesis = BytesN::from_array(&f.env, &GENESIS);
    let inflated = f
        .client
        .next_root(&genesis, &f.programme, &5_000, &hash(&f.env, 1), &1_000);
    assert_ne!(real, inflated);

    // Same amount, but claiming different evidence backed it.
    let swapped = f
        .client
        .next_root(&genesis, &f.programme, &500, &hash(&f.env, 9), &1_000);
    assert_ne!(real, swapped);
}

#[test]
fn ordering_is_part_of_the_chain() {
    let f = setup();
    let genesis = BytesN::from_array(&f.env, &GENESIS);

    let a_then_b = f
        .client
        .next_root(&genesis, &f.programme, &100, &hash(&f.env, 1), &1);
    let a_then_b = f
        .client
        .next_root(&a_then_b, &f.programme, &200, &hash(&f.env, 2), &2);

    let b_then_a = f
        .client
        .next_root(&genesis, &f.programme, &200, &hash(&f.env, 2), &2);
    let b_then_a = f
        .client
        .next_root(&b_then_a, &f.programme, &100, &hash(&f.env, 1), &1);

    assert_ne!(a_then_b, b_then_a, "reordering must change the root");
}

#[test]
fn unauthorized_writers_cannot_manufacture_standing() {
    let f = setup();
    let stranger = Address::generate(&f.env);

    assert_eq!(
        f.client.try_credit(
            &stranger,
            &f.subject,
            &f.programme,
            &1_000_000,
            &hash(&f.env, 1)
        ),
        Err(Ok(Error::NotAuthorized))
    );
    assert_eq!(f.client.try_get(&f.subject), Err(Ok(Error::NotFound)));
}

#[test]
fn revoked_writers_cannot_credit_but_history_survives() {
    let f = setup();
    f.client
        .credit(&f.writer, &f.subject, &f.programme, &500, &hash(&f.env, 1));

    f.client.remove_writer(&f.writer);
    assert!(!f.client.is_writer(&f.writer));

    assert_eq!(
        f.client
            .try_credit(&f.writer, &f.subject, &f.programme, &100, &hash(&f.env, 2)),
        Err(Ok(Error::NotAuthorized))
    );
    // History is not rewritten because an issuer was later removed.
    assert_eq!(f.client.get(&f.subject).total_received, 500);
}

#[test]
fn writer_registration_is_idempotent_by_rejection() {
    let f = setup();
    assert_eq!(
        f.client.try_add_writer(&f.writer),
        Err(Ok(Error::AlreadyWriter))
    );
    let stranger = Address::generate(&f.env);
    assert_eq!(
        f.client.try_remove_writer(&stranger),
        Err(Ok(Error::NotWriter))
    );
}

#[test]
fn admin_can_be_handed_over() {
    let f = setup();
    let new_admin = Address::generate(&f.env);
    f.client.set_admin(&new_admin);
    assert_eq!(f.client.get_admin(), new_admin);

    // The new admin governs writers from here.
    let writer = Address::generate(&f.env);
    f.client.add_writer(&writer);
    assert!(f.client.is_writer(&writer));
}

#[test]
fn non_positive_credits_are_rejected() {
    let f = setup();
    for bad in [0i128, -1, -500] {
        assert_eq!(
            f.client
                .try_credit(&f.writer, &f.subject, &f.programme, &bad, &hash(&f.env, 1)),
            Err(Ok(Error::InvalidAmount)),
            "amount {bad} must be rejected"
        );
    }
}

#[test]
fn total_received_cannot_be_overflowed() {
    let f = setup();
    f.client.credit(
        &f.writer,
        &f.subject,
        &f.programme,
        &i128::MAX,
        &hash(&f.env, 1),
    );

    assert_eq!(
        f.client
            .try_credit(&f.writer, &f.subject, &f.programme, &1, &hash(&f.env, 2)),
        Err(Ok(Error::Overflow))
    );
    assert_eq!(f.client.get(&f.subject).total_received, i128::MAX);
}

#[test]
fn unknown_subjects_report_not_found() {
    let f = setup();
    let stranger = Address::generate(&f.env);
    assert_eq!(f.client.try_get(&stranger), Err(Ok(Error::NotFound)));
    assert_eq!(f.client.try_keepalive(&stranger), Err(Ok(Error::NotFound)));
}

#[test]
fn keepalive_is_permissionless() {
    let f = setup();
    f.client
        .credit(&f.writer, &f.subject, &f.programme, &500, &hash(&f.env, 1));

    // No auth argument at all: anyone may pay to keep someone's record alive.
    f.client.keepalive(&f.subject);
    assert_eq!(f.client.get(&f.subject).total_received, 500);
}

#[test]
fn there_is_no_way_to_move_standing_between_addresses() {
    // Guards the design claim rather than a code path: `Standing` has no owner
    // field to reassign and the contract exposes no transfer. If a future change
    // adds one, this test's name is the reminder that it was deliberate.
    let f = setup();
    let s = f
        .client
        .credit(&f.writer, &f.subject, &f.programme, &500, &hash(&f.env, 1));
    assert_eq!(s.subject, f.subject);
    assert_eq!(f.client.get(&f.subject).subject, f.subject);
}

#[test]
fn archived_markers_restore_rather_than_double_counting() {
    // The `Seen` marker is what keeps `programmes` accurate without storing a
    // list, so its behaviour after archival is load-bearing. Since protocol 23
    // an archived persistent entry is automatically restored on access, rather
    // than reading as absent — so a long-dormant recipient rejoining an old
    // programme is charged a restoration fee, not miscounted. Marker entries are
    // deliberately tiny, which is exactly what makes that fee negligible.
    let f = setup();
    f.client
        .credit(&f.writer, &f.subject, &f.programme, &500, &hash(&f.env, 1));
    assert_eq!(f.client.get(&f.subject).programmes, 1);

    let seq = f.env.ledger().sequence();
    f.env.ledger().set_sequence_number(seq + BUMP_LEDGERS + 10);

    let s = f
        .client
        .credit(&f.writer, &f.subject, &f.programme, &100, &hash(&f.env, 2));

    assert_eq!(s.programmes, 1, "an archived marker must not double-count");
    assert_eq!(s.tranches, 2);
    assert_eq!(s.total_received, 600);
}
