#![cfg(test)]

use super::*;
use milepost_test_utils::schedule::*;
use soroban_sdk::{testutils::Address as _, vec, Env};

// Requires the programme wasm to exist, so `cargo build --target wasm32v1-none
// --release` must run before this crate's tests. CI builds wasm before testing
// for exactly this reason.
mod programme {
    soroban_sdk::contractimport!(file = "../../target/wasm32v1-none/release/milepost_program.wasm");
}

struct Fixture {
    env: Env,
    client: RegistryClient<'static>,
    record: milepost_record::RecordClient<'static>,
    admin: Address,
    treasury: Address,
    token: Address,
    schema: BytesN<32>,
    verifier: Address,
}

fn setup() -> Fixture {
    let env = milepost_test_utils::new_test_env();

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let policy = Address::generate(&env);

    // Deploy the real attest contract and register a schema so the programme
    // constructor can call `get_schema` successfully.
    let attest_id = env.register(milepost_attest::Attest, ());
    let attest = milepost_attest::AttestClient::new(&env, &attest_id);
    let verifier = Address::generate(&env);
    let schema = attest.register_schema(
        &verifier,
        &String::from_str(&env, "milestone-met:v1"),
        &true,
        &true,
    );

    // `record` is deployed with the deployer as admin, then handed to the
    // registry — the registry's address does not exist until it is deployed.
    let record_id = env.register(milepost_record::Record, (admin.clone(),));
    let record = milepost_record::RecordClient::new(&env, &record_id);

    let wasm = env.deployer().upload_contract_wasm(programme::WASM);
    let id = env.register(
        Registry,
        (
            admin.clone(),
            treasury.clone(),
            attest_id,
            record_id,
            policy,
            FEE_BPS,
            wasm,
        ),
    );
    record.set_admin(&id);

    let token = milepost_test_utils::register_token(&env);

    let client = RegistryClient::new(&env, &id);
    Fixture {
        env: env.clone(),
        client,
        record,
        admin,
        treasury,
        token,
        schema,
        verifier,
    }
}

fn create(f: &Fixture, creator: &Address) -> Address {
    f.client.create(
        creator,
        &f.token,
        &f.schema,
        &APPLY_DEADLINE,
        &REVIEW_DEADLINE,
        &RELEASE_DEADLINE,
        &SWEEP_DEADLINE,
        &2u32,
        &3u32,
        &BytesN::from_array(&f.env, &[7u8; 32]),
        &vec![
            &f.env,
            Address::generate(&f.env),
            Address::generate(&f.env),
            Address::generate(&f.env),
        ],
        &vec![&f.env, f.verifier.clone()],
        &String::from_str(&f.env, "Health worker stipend 2026"),
        &0i128,
    )
}

#[test]
fn constructor_stores_config() {
    let f = setup();
    let c = f.client.get_config();
    assert_eq!(c.admin, f.admin);
    assert_eq!(c.treasury, f.treasury);
    assert_eq!(c.fee_bps, FEE_BPS);
}

#[test]
#[should_panic]
fn a_fee_above_the_ceiling_is_rejected_at_construction() {
    let env = Env::default();
    env.mock_all_auths();
    env.register(
        Registry,
        (
            Address::generate(&env),
            Address::generate(&env),
            Address::generate(&env),
            Address::generate(&env),
            Address::generate(&env),
            MAX_FEE_BPS + 1,
            BytesN::from_array(&env, &[0u8; 32]),
        ),
    );
}

#[test]
fn create_deploys_a_programme_and_records_it() {
    let f = setup();
    let creator = Address::generate(&f.env);
    let programme = create(&f, &creator);

    assert!(f.client.is_programme(&programme));
    assert!(!f.client.is_programme(&Address::generate(&f.env)));

    let config = programme::Client::new(&f.env, &programme).get_config();
    assert_eq!(config.creator, creator);
    assert_eq!(config.quorum, 2);
    assert_eq!(config.tranches, 3);
}

#[test]
fn deployed_programmes_may_write_standing() {
    // The entire trust chain: a programme can credit standing because the
    // registry deployed it, never because it asked.
    let f = setup();
    let programme = create(&f, &Address::generate(&f.env));
    assert!(f.record.is_writer(&programme));
}

#[test]
fn a_programme_deployed_outside_the_registry_cannot_write_standing() {
    let f = setup();
    let impostor = Address::generate(&f.env);
    assert!(!f.record.is_writer(&impostor));
    assert!(!f.client.is_programme(&impostor));
}

#[test]
fn treasury_and_fee_come_from_protocol_config_not_the_creator() {
    // Otherwise a creator could route the fee to themselves, or skip it.
    let f = setup();
    let programme = create(&f, &Address::generate(&f.env));
    let config = programme::Client::new(&f.env, &programme).get_config();

    assert_eq!(config.treasury, f.treasury);
    assert_eq!(config.fee_bps, FEE_BPS);
}

#[test]
fn each_creation_gets_a_distinct_address() {
    let f = setup();
    let creator = Address::generate(&f.env);
    let first = create(&f, &creator);
    let second = create(&f, &creator);
    assert_ne!(
        first, second,
        "same creator, same ledger, distinct programmes"
    );
    assert!(f.client.is_programme(&first));
    assert!(f.client.is_programme(&second));
}

#[test]
fn admin_can_retune_protocol_config() {
    let f = setup();
    let new_treasury = Address::generate(&f.env);

    f.client.set_fee(&250);
    f.client.set_treasury(&new_treasury);

    let programme = create(&f, &Address::generate(&f.env));
    let config = programme::Client::new(&f.env, &programme).get_config();
    assert_eq!(config.fee_bps, 250);
    assert_eq!(config.treasury, new_treasury);
}

#[test]
fn fee_changes_are_still_capped() {
    let f = setup();
    assert_eq!(
        f.client.try_set_fee(&(MAX_FEE_BPS + 1)),
        Err(Ok(Error::FeeTooHigh))
    );
    assert_eq!(f.client.get_config().fee_bps, FEE_BPS);
}

#[test]
fn admin_can_be_handed_over() {
    let f = setup();
    let new_admin = Address::generate(&f.env);
    f.client.set_admin(&new_admin);
    assert_eq!(f.client.get_config().admin, new_admin);
}

#[test]
fn changing_the_wasm_does_not_disturb_existing_programmes() {
    // Programmes are deployed, not proxied: existing ones keep the code they
    // were created with.
    let f = setup();
    let before = create(&f, &Address::generate(&f.env));
    let before_config = programme::Client::new(&f.env, &before).get_config();

    f.client
        .set_program_wasm(&BytesN::from_array(&f.env, &[9u8; 32]));

    assert_eq!(
        programme::Client::new(&f.env, &before).get_config(),
        before_config
    );
}

#[test]
fn nonce_starts_at_zero_and_increments() {
    let f = setup();
    assert_eq!(f.client.nonce(), 0);
    create(&f, &Address::generate(&f.env));
    assert_eq!(f.client.nonce(), 1);
    create(&f, &Address::generate(&f.env));
    assert_eq!(f.client.nonce(), 2);
}

#[test]
fn programme_address_matches_actual_deployment() {
    let f = setup();
    let creator = Address::generate(&f.env);

    let first = create(&f, &creator);
    let second = create(&f, &creator);

    assert_eq!(f.client.programme_address(&0), first);
    assert_eq!(f.client.programme_address(&1), second);
}

#[test]
fn programme_address_is_deterministic() {
    let f = setup();
    assert_eq!(
        f.client.programme_address(&0),
        f.client.programme_address(&0)
    );
}

#[test]
fn create_passes_minimum_award_to_programme() {
    let f = setup();
    let creator = Address::generate(&f.env);
    let programme_addr = f.client.create(
        &creator,
        &f.token,
        &f.schema,
        &APPLY_DEADLINE,
        &REVIEW_DEADLINE,
        &RELEASE_DEADLINE,
        &SWEEP_DEADLINE,
        &2u32,
        &3u32,
        &BytesN::from_array(&f.env, &[7u8; 32]),
        &vec![
            &f.env,
            Address::generate(&f.env),
            Address::generate(&f.env),
            Address::generate(&f.env),
        ],
        &vec![&f.env, f.verifier.clone()],
        &String::from_str(&f.env, "Health worker stipend 2026"),
        &500i128,
    );
    let config = programme::Client::new(&f.env, &programme_addr).get_config();
    assert_eq!(config.minimum_award, 500);
}

#[test]
fn create_defaults_minimum_award_to_zero() {
    let f = setup();
    let programme = create(&f, &Address::generate(&f.env));
    let config = programme::Client::new(&f.env, &programme).get_config();
    assert_eq!(config.minimum_award, 0);
}
