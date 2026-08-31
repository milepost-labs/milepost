#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Env, String};

struct Fixture {
    env: Env,
    attest_id: soroban_sdk::Address,
    gated_id: soroban_sdk::Address,
    authority: Address,
    subject: Address,
}

fn setup() -> Fixture {
    let env = Env::default();
    env.mock_all_auths();

    let attest_id = env.register(milepost_attest::Attest, ());
    let gated_id = env.register(GatedAction, ());

    let authority = Address::generate(&env);
    let subject = Address::generate(&env);

    Fixture {
        env,
        attest_id,
        gated_id,
        authority,
        subject,
    }
}

fn hash(env: &Env, byte: u8) -> BytesN<32> {
    BytesN::from_array(env, &[byte; 32])
}

fn register_schema(f: &Fixture) -> BytesN<32> {
    let client = milepost_attest::AttestClient::new(&f.env, &f.attest_id);
    client.register_schema(
        &f.authority,
        &String::from_str(&f.env, "milestone-met:v1"),
        &true,  // revocable
        &false, // not restricted — anyone may attest
        &None,  // no predecessor: this schema supersedes nothing
    )
}

fn make_attestation(f: &Fixture, schema: &BytesN<32>) -> BytesN<32> {
    let client = milepost_attest::AttestClient::new(&f.env, &f.attest_id);
    client.attest(&f.authority, schema, &f.subject, &hash(&f.env, 42), &None)
}

fn gated(f: &Fixture, uid: &BytesN<32>, schema: &BytesN<32>, attester: &Address) -> bool {
    let client = GatedActionClient::new(&f.env, &f.gated_id);
    client
        .try_gated_action(&f.attest_id, uid, &f.subject, schema, attester)
        .is_ok()
}

// ---- acceptance ----

#[test]
fn valid_attestation_passes() {
    let f = setup();
    let schema = register_schema(&f);
    let uid = make_attestation(&f, &schema);
    assert!(gated(&f, &uid, &schema, &f.authority));
}

// ---- rejection ----

#[test]
fn wrong_attester_is_rejected() {
    let f = setup();
    let schema = register_schema(&f);
    let uid = make_attestation(&f, &schema);
    let stranger = Address::generate(&f.env);
    assert!(!gated(&f, &uid, &schema, &stranger));
}

#[test]
fn wrong_subject_is_rejected() {
    let f = setup();
    let schema = register_schema(&f);
    let uid = make_attestation(&f, &schema);

    let client = GatedActionClient::new(&f.env, &f.gated_id);
    let other_subject = Address::generate(&f.env);
    assert!(client
        .try_gated_action(&f.attest_id, &uid, &other_subject, &schema, &f.authority)
        .is_err());
}

#[test]
fn non_existent_attestation_is_rejected() {
    let f = setup();
    let schema = register_schema(&f);
    let fake_uid = hash(&f.env, 0xff);
    assert!(!gated(&f, &fake_uid, &schema, &f.authority));
}

#[test]
fn revoked_attestation_is_rejected() {
    let f = setup();
    let schema = register_schema(&f);
    let uid = make_attestation(&f, &schema);

    let attest_client = milepost_attest::AttestClient::new(&f.env, &f.attest_id);
    attest_client.revoke(&f.authority, &uid);

    assert!(!gated(&f, &uid, &schema, &f.authority));
}
