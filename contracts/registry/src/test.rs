#![cfg(test)]

use super::*;
use milepost_test_utils::schedule::*;
use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, vec, Env};

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
        &None,
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
fn test_full_cross_contract_integration() {
    let env = Env::default();
    env.mock_all_auths();

    // Protocol participant accounts
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let policy = Address::generate(&env);
    let creator = Address::generate(&env);
    let donor = Address::generate(&env);
    let applicant = Address::generate(&env);
    let reviewer1 = Address::generate(&env);
    let reviewer2 = Address::generate(&env);
    let reviewer3 = Address::generate(&env);
    let verifier = Address::generate(&env);
    let payee = Address::generate(&env);

    // 1. Deploy Attestation Registry
    let attest_id = env.register(milepost_attest::Attest, ());
    let attest_client = milepost_attest::AttestClient::new(&env, &attest_id);

    // Register schema for milestone attestations
    let schema_uid = attest_client.register_schema(
        &verifier,
        &String::from_str(&env, "Milestone Completion Schema"),
        &true,
        &false,
        &None,
    );

    // 2. Deploy Record Contract (Standing)
    let record_id = env.register(milepost_record::Record, (admin.clone(),));
    let record_client = milepost_record::RecordClient::new(&env, &record_id);

    // 3. Deploy Registry Contract
    let program_wasm = env.deployer().upload_contract_wasm(programme::WASM);
    let fee_bps = 1_000u32; // 10% fee
    let registry_id = env.register(
        Registry,
        (
            admin.clone(),
            treasury.clone(),
            attest_id.clone(),
            record_id.clone(),
            policy.clone(),
            fee_bps,
            program_wasm,
        ),
    );
    let registry_client = RegistryClient::new(&env, &registry_id);

    // Hand admin of Record contract over to Registry
    record_client.set_admin(&registry_id);
    assert_eq!(record_client.get_admin(), registry_id);

    // 4. Acceptance Criterion Assertion: A programme deployed outside registry cannot write standing
    let impostor = Address::generate(&env);
    assert!(!record_client.is_writer(&impostor));
    assert!(!registry_client.is_programme(&impostor));

    // 5. Deploy Stellar Asset Token & Mint to Donor
    let token_admin = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract_v2(token_admin);
    let token_address = token_contract.address();
    let token_asset_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    let token_client = soroban_sdk::token::Client::new(&env, &token_address);

    let contribution_amount = 100_000i128;
    token_asset_client.mint(&donor, &contribution_amount);
    assert_eq!(token_client.balance(&donor), contribution_amount);

    // 6. Registry deploys Programme
    let apply_deadline = 10_000u64;
    let review_deadline = 20_000u64;
    let release_deadline = 30_000u64;
    let sweep_deadline = 40_000u64;
    let quorum = 2u32;
    let tranches = 2u32;
    let metadata_hash = BytesN::from_array(&env, &[1u8; 32]);
    let reviewers = vec![
        &env,
        reviewer1.clone(),
        reviewer2.clone(),
        reviewer3.clone(),
    ];
    let verifiers = vec![&env, verifier.clone()];
    let prog_name = String::from_str(&env, "Community Health Grant 2026");

    let prog_address = registry_client.create(
        &creator,
        &token_address,
        &schema_uid,
        &apply_deadline,
        &review_deadline,
        &release_deadline,
        &sweep_deadline,
        &quorum,
        &tranches,
        &metadata_hash,
        &reviewers,
        &verifiers,
        &prog_name,
        &0i128, // no minimum award
    );

    // Assert registry deployment trust chain: Programme is recognized by Registry and authorized in Record
    assert!(registry_client.is_programme(&prog_address));
    assert!(record_client.is_writer(&prog_address));

    let prog_client = programme::Client::new(&env, &prog_address);

    // 7. Donors contribute to the Programme
    prog_client.contribute(&donor, &contribution_amount);
    assert_eq!(token_client.balance(&donor), 0);
    assert_eq!(token_client.balance(&prog_address), contribution_amount);

    // 8. Applicant applies
    let requested_amount = 50_000i128;
    prog_client.apply(&applicant, &requested_amount, &metadata_hash);

    // 9. Reviewers vote during review phase
    env.ledger().set_timestamp(15_000);
    prog_client.review(&reviewer1, &applicant, &40_000);
    prog_client.review(&reviewer2, &applicant, &50_000);

    // 10. Finalize application into Award (Permissionless settlement at median vote)
    prog_client.allow_payee(&payee);
    let award = prog_client.finalize(&applicant, &payee, &programme::Mode::Open);
    let granted_amount = 40_000i128; // Median of quorum 2 votes [40_000, 50_000]
    assert_eq!(award.granted, granted_amount);
    assert_eq!(award.tranches, 2);

    // 11. Tranche 1: Trusted verifier attests milestone & Programme releases funds
    let attestation1_data = BytesN::from_array(&env, &[10u8; 32]);
    let attestation1_uid = attest_client.attest(
        &verifier,
        &schema_uid,
        &applicant,
        &attestation1_data,
        &None,
    );
    assert!(attest_client.verify(&attestation1_uid, &applicant, &schema_uid, &verifier));

    let released1 = prog_client.release(&applicant, &attestation1_uid, &verifier);
    assert_eq!(released1, 20_000);
    assert_eq!(token_client.balance(&payee), 20_000);

    // Verify recipient standing credited in Record contract
    let standing1 = record_client.get(&applicant);
    assert_eq!(standing1.subject, applicant);
    assert_eq!(standing1.tranches, 1);
    assert_eq!(standing1.total_received, 20_000);

    // 12. Tranche 2: Second milestone attestation & release
    let attestation2_data = BytesN::from_array(&env, &[20u8; 32]);
    let attestation2_uid = attest_client.attest(
        &verifier,
        &schema_uid,
        &applicant,
        &attestation2_data,
        &None,
    );
    let released2 = prog_client.release(&applicant, &attestation2_uid, &verifier);
    assert_eq!(released2, 20_000);
    assert_eq!(token_client.balance(&payee), 40_000);

    // Verify recipient standing updated
    let standing2 = record_client.get(&applicant);
    assert_eq!(standing2.tranches, 2);
    assert_eq!(standing2.total_received, 40_000);

    // 13. Protocol Fee Sweep & Accounting Invariant Assertion
    env.ledger().set_timestamp(45_000);
    prog_client.sweep_fee();

    let expected_fee = 10_000i128; // 10% of 100_000
    assert_eq!(token_client.balance(&treasury), expected_fee);

    let payee_balance = token_client.balance(&payee);
    let treasury_balance = token_client.balance(&treasury);
    let remaining_contract_balance = token_client.balance(&prog_address);

    // Assert: Money in equals money out plus fees plus remaining unallocated balance
    assert_eq!(
        contribution_amount,
        payee_balance + treasury_balance + remaining_contract_balance,
        "Money in equals money out plus fees and remaining unallocated balance"
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
