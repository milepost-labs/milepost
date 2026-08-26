#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token::{StellarAssetClient, TokenClient},
    vec, Env, String,
};

/// A stand-in for the spend policy. The programme only asks whether a policy is
/// installed for a wallet, so the test double implements exactly that.
mod policy {
    use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

    #[contracttype]
    pub enum Key {
        Installed(Address),
    }

    #[contract]
    pub struct FakePolicy;

    #[contractimpl]
    impl FakePolicy {
        pub fn install(env: Env, wallet: Address) {
            env.storage()
                .persistent()
                .set(&Key::Installed(wallet), &true);
        }
        pub fn is_installed(env: Env, wallet: Address) -> bool {
            env.storage().persistent().has(&Key::Installed(wallet))
        }
    }
}

const APPLY_DEADLINE: u64 = 10_000;
const REVIEW_DEADLINE: u64 = 20_000;
const RELEASE_DEADLINE: u64 = 30_000;
const SWEEP_DEADLINE: u64 = 40_000;
const FEE_BPS: u32 = 1_000; // 10%

struct Fixture {
    env: Env,
    client: ProgrammeClient<'static>,
    token: TokenClient<'static>,
    mint: StellarAssetClient<'static>,
    attest: milepost_attest::AttestClient<'static>,
    policy: policy::FakePolicyClient<'static>,
    record: milepost_record::RecordClient<'static>,
    schema: BytesN<32>,
    creator: Address,
    treasury: Address,
    reviewers: Vec<Address>,
    verifier: Address,
}

fn setup(quorum: u32, reviewer_count: u32) -> Fixture {
    setup_with(quorum, reviewer_count, 3)
}

fn setup_with(quorum: u32, reviewer_count: u32, tranches: u32) -> Fixture {
    let env = Env::default();
    env.mock_all_auths();

    let issuer = Address::generate(&env);
    let asset = env.register_stellar_asset_contract_v2(issuer);
    let token = TokenClient::new(&env, &asset.address());
    let mint = StellarAssetClient::new(&env, &asset.address());

    let creator = Address::generate(&env);
    let treasury = Address::generate(&env);
    let verifier = Address::generate(&env);

    let attest_id = env.register(milepost_attest::Attest, ());
    let attest = milepost_attest::AttestClient::new(&env, &attest_id);
    // Restricted so only this verifier can make the claim at all — belt and
    // braces alongside the programme's own trusted-verifier check.
    let schema = attest.register_schema(
        &verifier,
        &String::from_str(&env, "milestone-met:v1"),
        &true,
        &true,
    );

    let policy_id = env.register(policy::FakePolicy, ());
    let policy = policy::FakePolicyClient::new(&env, &policy_id);

    let record_id = env.register(milepost_record::Record, (creator.clone(),));
    let record = milepost_record::RecordClient::new(&env, &record_id);

    let mut reviewers = Vec::new(&env);
    for _ in 0..reviewer_count {
        reviewers.push_back(Address::generate(&env));
    }

    let id = env.register(
        Programme,
        (
            ProgrammeConfig {
                creator: creator.clone(),
                token: asset.address(),
                treasury: treasury.clone(),
                attest: attest_id,
                record: record_id,
                policy: policy_id,
                schema: schema.clone(),
                fee_bps: FEE_BPS,
                apply_deadline: APPLY_DEADLINE,
                review_deadline: REVIEW_DEADLINE,
                release_deadline: RELEASE_DEADLINE,
                sweep_deadline: SWEEP_DEADLINE,
                quorum,
                tranches,
                metadata_hash: BytesN::from_array(&env, &[7u8; 32]),
            },
            reviewers.clone(),
            vec![&env, verifier.clone()],
        ),
    );
    // The programme credits standing, so it has to be an authorised writer.
    record.add_writer(&id);

    let client = ProgrammeClient::new(&env, &id);
    Fixture {
        env: env.clone(),
        client,
        token,
        mint,
        attest,
        policy,
        record,
        schema,
        creator,
        treasury,
        reviewers,
        verifier,
    }
}

fn funded_donor(f: &Fixture, amount: i128) -> Address {
    let donor = Address::generate(&f.env);
    f.mint.mint(&donor, &amount);
    donor
}

fn hash(env: &Env, byte: u8) -> BytesN<32> {
    BytesN::from_array(env, &[byte; 32])
}

fn to_review(f: &Fixture) {
    f.env.ledger().set_timestamp(APPLY_DEADLINE + 1);
}

/// An attestation from the programme's trusted verifier that `recipient` met a
/// milestone. `n` just keeps repeat proofs distinct.
fn proof(f: &Fixture, recipient: &Address, n: u8) -> BytesN<32> {
    f.attest
        .attest(&f.verifier, &f.schema, recipient, &hash(&f.env, n), &None)
}

// ---- construction ----

#[test]
fn constructor_stores_config_and_reviewers() {
    let f = setup(3, 5);
    let c = f.client.get_config();
    assert_eq!(c.creator, f.creator);
    assert_eq!(c.treasury, f.treasury);
    assert_eq!(c.quorum, 3);
    assert_eq!(c.tranches, 3);
    assert_eq!(f.client.get_phase(), Phase::Open);
    for r in f.reviewers.iter() {
        assert!(f.client.is_reviewer(&r));
    }
}

/// Constructing with a quorum above the reviewer count would make every
/// application permanently unfinalisable, so it is refused outright.
#[test]
#[should_panic]
fn quorum_above_reviewer_count_is_rejected() {
    construct_with(5, 3, APPLY_DEADLINE, REVIEW_DEADLINE, FEE_BPS);
}

#[test]
#[should_panic]
fn review_deadline_before_apply_deadline_is_rejected() {
    construct_with(1, 3, REVIEW_DEADLINE, APPLY_DEADLINE, FEE_BPS);
}

#[test]
#[should_panic]
fn a_fee_above_the_ceiling_is_rejected() {
    construct_with(1, 3, APPLY_DEADLINE, REVIEW_DEADLINE, MAX_FEE_BPS + 1);
}

#[test]
#[should_panic]
fn zero_quorum_is_rejected() {
    construct_with(0, 3, APPLY_DEADLINE, REVIEW_DEADLINE, FEE_BPS);
}

fn construct_with(quorum: u32, reviewer_count: u32, apply: u64, review: u64, fee_bps: u32) {
    let env = Env::default();
    env.mock_all_auths();
    let issuer = Address::generate(&env);
    let asset = env.register_stellar_asset_contract_v2(issuer);
    let mut reviewers = Vec::new(&env);
    for _ in 0..reviewer_count {
        reviewers.push_back(Address::generate(&env));
    }
    let verifier = Address::generate(&env);

    env.register(
        Programme,
        (
            ProgrammeConfig {
                creator: Address::generate(&env),
                token: asset.address(),
                treasury: Address::generate(&env),
                attest: Address::generate(&env),
                record: Address::generate(&env),
                policy: Address::generate(&env),
                schema: BytesN::from_array(&env, &[1u8; 32]),
                fee_bps,
                apply_deadline: apply,
                review_deadline: review,
                release_deadline: RELEASE_DEADLINE,
                sweep_deadline: SWEEP_DEADLINE,
                quorum,
                tranches: 3,
                metadata_hash: BytesN::from_array(&env, &[7u8; 32]),
            },
            reviewers,
            vec![&env, verifier],
        ),
    );
}

// ---- contributions ----

#[test]
fn contributions_accumulate_and_move_tokens() {
    let f = setup(2, 3);
    let a = funded_donor(&f, 1_000);
    let b = funded_donor(&f, 500);

    f.client.contribute(&a, &1_000);
    f.client.contribute(&b, &500);

    assert_eq!(f.client.total_contributed(), 1_500);
    assert_eq!(f.client.contributed_by(&a), 1_000);
    assert_eq!(f.client.contributed_by(&b), 500);
    assert_eq!(f.token.balance(&f.client.address), 1_500);
    assert_eq!(f.token.balance(&a), 0);
}

#[test]
fn a_donor_can_top_up() {
    let f = setup(2, 3);
    let a = funded_donor(&f, 1_000);
    f.client.contribute(&a, &400);
    f.client.contribute(&a, &600);
    assert_eq!(f.client.contributed_by(&a), 1_000);
}

#[test]
fn budget_is_contributions_less_fee() {
    let f = setup(2, 3);
    let a = funded_donor(&f, 1_000);
    f.client.contribute(&a, &1_000);

    assert_eq!(f.client.fee(), 100); // 10%
    assert_eq!(f.client.budget(), 900);
}

#[test]
fn contributions_close_with_applications() {
    // The budget must be fixed before anyone reviews against it.
    let f = setup(2, 3);
    let a = funded_donor(&f, 1_000);
    to_review(&f);
    assert_eq!(
        f.client.try_contribute(&a, &1_000),
        Err(Ok(Error::WrongPhase))
    );
}

#[test]
fn non_positive_contributions_are_rejected() {
    let f = setup(2, 3);
    let a = funded_donor(&f, 1_000);
    assert_eq!(
        f.client.try_contribute(&a, &0),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        f.client.try_contribute(&a, &-100),
        Err(Ok(Error::InvalidAmount))
    );
}

// ---- applications ----

#[test]
fn applicants_state_what_they_need() {
    let f = setup(2, 3);
    let applicant = Address::generate(&f.env);
    f.env.ledger().set_timestamp(500);

    f.client.apply(&applicant, &5_000, &hash(&f.env, 1));

    let a = f.client.get_application(&applicant);
    assert_eq!(a.requested, 5_000);
    assert_eq!(a.submitted_at, 500);
    assert_eq!(a.votes.len(), 0);
    assert!(!a.finalized);
}

#[test]
fn one_application_per_applicant() {
    let f = setup(2, 3);
    let applicant = Address::generate(&f.env);
    f.client.apply(&applicant, &5_000, &hash(&f.env, 1));
    assert_eq!(
        f.client.try_apply(&applicant, &1_000, &hash(&f.env, 2)),
        Err(Ok(Error::AlreadyApplied))
    );
}

#[test]
fn applications_close_on_deadline() {
    let f = setup(2, 3);
    let applicant = Address::generate(&f.env);
    to_review(&f);
    assert_eq!(
        f.client.try_apply(&applicant, &5_000, &hash(&f.env, 1)),
        Err(Ok(Error::WrongPhase))
    );
}

// ---- review ----

#[test]
fn reviewers_approve_up_to_the_requested_amount() {
    let f = setup(2, 3);
    let applicant = Address::generate(&f.env);
    f.client.apply(&applicant, &5_000, &hash(&f.env, 1));
    to_review(&f);

    f.client
        .review(&f.reviewers.get(0).unwrap(), &applicant, &3_000);
    assert_eq!(f.client.get_application(&applicant).votes.len(), 1);

    assert_eq!(
        f.client
            .try_review(&f.reviewers.get(1).unwrap(), &applicant, &5_001),
        Err(Ok(Error::ExceedsRequested))
    );
}

#[test]
fn only_registered_reviewers_may_review() {
    let f = setup(2, 3);
    let applicant = Address::generate(&f.env);
    f.client.apply(&applicant, &5_000, &hash(&f.env, 1));
    to_review(&f);

    let stranger = Address::generate(&f.env);
    assert_eq!(
        f.client.try_review(&stranger, &applicant, &1_000),
        Err(Ok(Error::NotAuthorized))
    );
}

#[test]
fn a_reviewer_votes_once_per_applicant() {
    let f = setup(2, 3);
    let applicant = Address::generate(&f.env);
    f.client.apply(&applicant, &5_000, &hash(&f.env, 1));
    to_review(&f);

    let r = f.reviewers.get(0).unwrap();
    f.client.review(&r, &applicant, &3_000);
    assert_eq!(
        f.client.try_review(&r, &applicant, &4_000),
        Err(Ok(Error::AlreadyReviewed))
    );
}

#[test]
fn votes_are_kept_sorted_regardless_of_arrival_order() {
    let f = setup(3, 3);
    let applicant = Address::generate(&f.env);
    f.client.apply(&applicant, &5_000, &hash(&f.env, 1));
    to_review(&f);

    f.client
        .review(&f.reviewers.get(0).unwrap(), &applicant, &3_000);
    f.client
        .review(&f.reviewers.get(1).unwrap(), &applicant, &1_000);
    f.client
        .review(&f.reviewers.get(2).unwrap(), &applicant, &2_000);

    let votes = f.client.get_application(&applicant).votes;
    assert_eq!(votes, vec![&f.env, 1_000, 2_000, 3_000]);
}

#[test]
fn review_is_closed_outside_the_review_window() {
    let f = setup(2, 3);
    let applicant = Address::generate(&f.env);
    f.client.apply(&applicant, &5_000, &hash(&f.env, 1));
    let r = f.reviewers.get(0).unwrap();

    // Too early.
    assert_eq!(
        f.client.try_review(&r, &applicant, &1_000),
        Err(Ok(Error::WrongPhase))
    );
    // Too late.
    f.env.ledger().set_timestamp(REVIEW_DEADLINE + 1);
    assert_eq!(
        f.client.try_review(&r, &applicant, &1_000),
        Err(Ok(Error::WrongPhase))
    );
}

// ---- finalisation and partial funding ----

fn awarded(f: &Fixture, applicant: &Address, requested: i128, votes: &[i128]) -> Award {
    let donor = funded_donor(f, 100_000);
    f.client.contribute(&donor, &100_000);
    f.client.apply(applicant, &requested, &hash(&f.env, 1));
    to_review(f);
    for (i, v) in votes.iter().enumerate() {
        f.client
            .review(&f.reviewers.get(i as u32).unwrap(), applicant, v);
    }
    let payee = Address::generate(&f.env);
    f.client.allow_payee(&payee);
    f.client.finalize(applicant, &payee, &Mode::Direct)
}

#[test]
fn award_is_the_median_of_reviewer_votes() {
    let f = setup(3, 5);
    let applicant = Address::generate(&f.env);
    // A committee that mostly agrees, with one cautious outlier: the median
    // holds at 1_000 rather than being dragged to 200 by the minimum.
    let award = awarded(&f, &applicant, 2_000, &[1_000, 200, 1_000]);
    assert_eq!(award.granted, 1_000);
}

#[test]
fn a_single_generous_reviewer_cannot_inflate_the_award() {
    let f = setup(3, 5);
    let applicant = Address::generate(&f.env);
    let award = awarded(&f, &applicant, 9_000, &[500, 9_000, 600]);
    assert_eq!(award.granted, 600);
}

#[test]
fn partial_funding_awards_less_than_requested() {
    let f = setup(2, 3);
    let applicant = Address::generate(&f.env);
    let award = awarded(&f, &applicant, 5_000, &[2_000, 3_000]);
    assert!(award.granted < 5_000);
    assert_eq!(award.granted, 2_000, "even count takes the lower middle");
}

#[test]
fn full_funding_is_possible_when_reviewers_agree() {
    let f = setup(2, 3);
    let applicant = Address::generate(&f.env);
    let award = awarded(&f, &applicant, 1_000, &[1_000, 1_000]);
    assert_eq!(award.granted, 1_000);
}

#[test]
fn different_applicants_get_different_amounts() {
    // The whole point of partial funding over an equal split.
    let f = setup(2, 3);
    let donor = funded_donor(&f, 100_000);
    f.client.contribute(&donor, &100_000);

    let small = Address::generate(&f.env);
    let large = Address::generate(&f.env);
    f.client.apply(&small, &200, &hash(&f.env, 1));
    f.client.apply(&large, &5_000, &hash(&f.env, 2));
    to_review(&f);

    for i in 0..2u32 {
        let r = f.reviewers.get(i).unwrap();
        f.client.review(&r, &small, &200);
        f.client.review(&r, &large, &5_000);
    }

    let payee = Address::generate(&f.env);
    f.client.allow_payee(&payee);
    let a = f.client.finalize(&small, &payee, &Mode::Direct);
    let b = f.client.finalize(&large, &payee, &Mode::Direct);
    assert_eq!(a.granted, 200);
    assert_eq!(b.granted, 5_000);
}

#[test]
fn finalize_requires_quorum() {
    let f = setup(3, 5);
    let applicant = Address::generate(&f.env);
    let donor = funded_donor(&f, 10_000);
    f.client.contribute(&donor, &10_000);
    f.client.apply(&applicant, &1_000, &hash(&f.env, 1));
    to_review(&f);

    f.client
        .review(&f.reviewers.get(0).unwrap(), &applicant, &1_000);
    f.client
        .review(&f.reviewers.get(1).unwrap(), &applicant, &1_000);

    assert_eq!(
        f.client
            .try_finalize(&applicant, &Address::generate(&f.env), &Mode::Direct),
        Err(Ok(Error::QuorumNotReached))
    );
}

#[test]
fn finalize_is_idempotent_by_rejection() {
    let f = setup(2, 3);
    let applicant = Address::generate(&f.env);
    awarded(&f, &applicant, 1_000, &[1_000, 1_000]);
    let payee = Address::generate(&f.env);
    f.client.allow_payee(&payee);
    assert_eq!(
        f.client.try_finalize(&applicant, &payee, &Mode::Direct),
        Err(Ok(Error::AlreadyFinalized))
    );
}

#[test]
fn awards_cannot_exceed_the_budget() {
    let f = setup(2, 3);
    let donor = funded_donor(&f, 1_000);
    f.client.contribute(&donor, &1_000); // budget is 900 after the 10% fee

    let a = Address::generate(&f.env);
    let b = Address::generate(&f.env);
    f.client.apply(&a, &800, &hash(&f.env, 1));
    f.client.apply(&b, &800, &hash(&f.env, 2));
    to_review(&f);
    for i in 0..2u32 {
        let r = f.reviewers.get(i).unwrap();
        f.client.review(&r, &a, &800);
        f.client.review(&r, &b, &800);
    }

    let payee = Address::generate(&f.env);
    f.client.allow_payee(&payee);
    assert_eq!(f.client.finalize(&a, &payee, &Mode::Direct).granted, 800);
    // 800 + 800 > 900: the second is refused rather than over-committing.
    assert_eq!(
        f.client.try_finalize(&b, &payee, &Mode::Direct),
        Err(Ok(Error::InsufficientBudget))
    );
    assert_eq!(f.client.total_granted(), 800);
}

#[test]
fn finalize_carries_the_payee_and_mode() {
    let f = setup(2, 3);
    let applicant = Address::generate(&f.env);
    let donor = funded_donor(&f, 10_000);
    f.client.contribute(&donor, &10_000);
    f.client.apply(&applicant, &1_000, &hash(&f.env, 1));
    to_review(&f);
    for i in 0..2u32 {
        f.client
            .review(&f.reviewers.get(i).unwrap(), &applicant, &1_000);
    }

    let school = Address::generate(&f.env);
    f.client.allow_payee(&school);
    let award = f.client.finalize(&applicant, &school, &Mode::Direct);

    assert_eq!(
        award.payee, school,
        "Direct pays the institution, not the recipient"
    );
    assert_eq!(award.mode, Mode::Direct);
    assert_eq!(award.tranches, 3);
    assert_eq!(award.tranches_released, 0);
    assert_eq!(award.released, 0);
}

#[test]
fn finalize_still_works_after_the_review_deadline() {
    // The outcome is determined by the votes; a missed deadline must not strand
    // an applicant whose quorum was already reached.
    let f = setup(2, 3);
    let applicant = Address::generate(&f.env);
    let donor = funded_donor(&f, 10_000);
    f.client.contribute(&donor, &10_000);
    f.client.apply(&applicant, &1_000, &hash(&f.env, 1));
    to_review(&f);
    for i in 0..2u32 {
        f.client
            .review(&f.reviewers.get(i).unwrap(), &applicant, &1_000);
    }

    f.env.ledger().set_timestamp(REVIEW_DEADLINE + 1);
    assert_eq!(f.client.get_phase(), Phase::Settled);
    let payee = Address::generate(&f.env);
    f.client.allow_payee(&payee);
    assert_eq!(
        f.client.finalize(&applicant, &payee, &Mode::Direct).granted,
        1_000
    );
}

#[test]
fn unknown_applicants_cannot_be_finalized() {
    let f = setup(2, 3);
    to_review(&f);
    assert_eq!(
        f.client.try_finalize(
            &Address::generate(&f.env),
            &Address::generate(&f.env),
            &Mode::Direct
        ),
        Err(Ok(Error::ApplicationNotFound))
    );
}

// ---- cancellation ----

#[test]
fn an_empty_programme_can_be_cancelled() {
    let f = setup(2, 3);
    f.client.cancel();
    assert_eq!(f.client.get_phase(), Phase::Cancelled);

    let applicant = Address::generate(&f.env);
    assert_eq!(
        f.client.try_apply(&applicant, &100, &hash(&f.env, 1)),
        Err(Ok(Error::Cancelled))
    );
}

#[test]
fn a_funded_programme_cannot_be_cancelled() {
    // Cancelling must never be able to strand someone else's money.
    let f = setup(2, 3);
    let donor = funded_donor(&f, 1_000);
    f.client.contribute(&donor, &1_000);
    assert_eq!(f.client.try_cancel(), Err(Ok(Error::NotCancellable)));
}

#[test]
fn cancelling_twice_is_rejected() {
    let f = setup(2, 3);
    f.client.cancel();
    assert_eq!(f.client.try_cancel(), Err(Ok(Error::Cancelled)));
}

// ---- release ----

/// Drive a programme to the point where `recipient` holds an award paid to
/// `payee`, then advance into the release window.
fn award_to(f: &Fixture, recipient: &Address, payee: &Address, granted: &i128) {
    let donor = funded_donor(f, 100_000);
    f.client.contribute(&donor, &100_000);
    f.client.apply(recipient, granted, &hash(&f.env, 1));
    to_review(f);
    for i in 0..f.client.get_config().quorum {
        f.client
            .review(&f.reviewers.get(i).unwrap(), recipient, granted);
    }
    f.client.allow_payee(payee);
    f.client.finalize(recipient, payee, &Mode::Direct);
}

#[test]
fn a_tranche_releases_to_the_payee_against_a_valid_proof() {
    let f = setup(2, 3);
    let recipient = Address::generate(&f.env);
    let school = Address::generate(&f.env);
    award_to(&f, &recipient, &school, &900);

    let amount = f
        .client
        .release(&recipient, &proof(&f, &recipient, 1), &f.verifier);

    assert_eq!(amount, 300, "900 over 3 tranches");
    assert_eq!(f.token.balance(&school), 300);
    assert_eq!(
        f.token.balance(&recipient),
        0,
        "Direct mode never puts funds in the recipient's hands"
    );
    assert_eq!(f.client.total_released(), 300);

    let award = f.client.get_award(&recipient);
    assert_eq!(award.tranches_released, 1);
    assert_eq!(award.released, 300);
}

#[test]
fn releasing_credits_standing() {
    let f = setup(2, 3);
    let recipient = Address::generate(&f.env);
    let school = Address::generate(&f.env);
    award_to(&f, &recipient, &school, &900);

    f.client
        .release(&recipient, &proof(&f, &recipient, 1), &f.verifier);

    let standing = f.record.get(&recipient);
    assert_eq!(standing.total_received, 300);
    assert_eq!(standing.tranches, 1);
    assert_eq!(standing.programmes, 1);
}

#[test]
fn one_proof_unlocks_exactly_one_tranche() {
    let f = setup(2, 3);
    let recipient = Address::generate(&f.env);
    let school = Address::generate(&f.env);
    award_to(&f, &recipient, &school, &900);

    let uid = proof(&f, &recipient, 1);
    f.client.release(&recipient, &uid, &f.verifier);
    assert!(f.client.is_spent(&uid));

    assert_eq!(
        f.client.try_release(&recipient, &uid, &f.verifier),
        Err(Ok(Error::AttestationAlreadyUsed))
    );
    assert_eq!(f.token.balance(&school), 300);
}

#[test]
fn the_final_tranche_takes_the_remainder() {
    // 1000 over 3 is 333, 333, 334 — integer division must not strand dust.
    let f = setup(2, 3);
    let recipient = Address::generate(&f.env);
    let school = Address::generate(&f.env);
    award_to(&f, &recipient, &school, &1_000);

    let a = f
        .client
        .release(&recipient, &proof(&f, &recipient, 1), &f.verifier);
    let b = f
        .client
        .release(&recipient, &proof(&f, &recipient, 2), &f.verifier);
    let c = f
        .client
        .release(&recipient, &proof(&f, &recipient, 3), &f.verifier);

    assert_eq!((a, b, c), (333, 333, 334));
    assert_eq!(a + b + c, 1_000);
    assert_eq!(f.token.balance(&school), 1_000);
}

#[test]
fn an_award_cannot_over_release() {
    let f = setup_with(2, 3, 1);
    let recipient = Address::generate(&f.env);
    let school = Address::generate(&f.env);
    award_to(&f, &recipient, &school, &900);

    f.client
        .release(&recipient, &proof(&f, &recipient, 1), &f.verifier);
    assert_eq!(
        f.client
            .try_release(&recipient, &proof(&f, &recipient, 2), &f.verifier),
        Err(Ok(Error::AwardFullyReleased))
    );
}

#[test]
fn an_untrusted_attester_cannot_release() {
    let f = setup(2, 3);
    let recipient = Address::generate(&f.env);
    let school = Address::generate(&f.env);
    award_to(&f, &recipient, &school, &900);

    let impostor = Address::generate(&f.env);
    assert_eq!(
        f.client
            .try_release(&recipient, &proof(&f, &recipient, 1), &impostor),
        Err(Ok(Error::NotAuthorized))
    );
    assert_eq!(f.token.balance(&school), 0);
}

#[test]
fn a_proof_about_someone_else_cannot_release() {
    // The exact trap `is_valid` alone would fall into: a perfectly valid
    // attestation, by the right verifier, about the wrong person.
    let f = setup(2, 3);
    let recipient = Address::generate(&f.env);
    let school = Address::generate(&f.env);
    award_to(&f, &recipient, &school, &900);

    let someone_else = Address::generate(&f.env);
    let wrong = proof(&f, &someone_else, 1);
    assert_eq!(
        f.client.try_release(&recipient, &wrong, &f.verifier),
        Err(Ok(Error::AttestationInvalid))
    );
    assert_eq!(f.token.balance(&school), 0);
}

#[test]
fn a_revoked_proof_cannot_release() {
    let f = setup(2, 3);
    let recipient = Address::generate(&f.env);
    let school = Address::generate(&f.env);
    award_to(&f, &recipient, &school, &900);

    let uid = proof(&f, &recipient, 1);
    f.attest.revoke(&f.verifier, &uid);

    assert_eq!(
        f.client.try_release(&recipient, &uid, &f.verifier),
        Err(Ok(Error::AttestationInvalid))
    );
}

#[test]
fn releasing_without_an_award_is_rejected() {
    let f = setup(2, 3);
    let stranger = Address::generate(&f.env);
    to_review(&f);
    assert_eq!(
        f.client
            .try_release(&stranger, &proof(&f, &stranger, 1), &f.verifier),
        Err(Ok(Error::AwardNotFound))
    );
}

#[test]
fn the_release_window_closes() {
    let f = setup(2, 3);
    let recipient = Address::generate(&f.env);
    let school = Address::generate(&f.env);
    award_to(&f, &recipient, &school, &900);

    f.env.ledger().set_timestamp(RELEASE_DEADLINE);
    assert_eq!(
        f.client
            .try_release(&recipient, &proof(&f, &recipient, 1), &f.verifier),
        Err(Ok(Error::ReleaseWindowClosed))
    );
}

// ---- protocol fee ----

#[test]
fn the_fee_sweeps_to_the_treasury_once() {
    let f = setup(2, 3);
    let donor = funded_donor(&f, 10_000);
    f.client.contribute(&donor, &10_000);
    to_review(&f);

    assert_eq!(f.client.sweep_fee(), 1_000); // 10%
    assert_eq!(f.token.balance(&f.treasury), 1_000);
    assert_eq!(f.client.try_sweep_fee(), Err(Ok(Error::FeeAlreadySwept)));
    assert_eq!(f.token.balance(&f.treasury), 1_000);
}

#[test]
fn the_fee_cannot_be_swept_while_contributions_are_open() {
    // The amount would still be moving.
    let f = setup(2, 3);
    let donor = funded_donor(&f, 10_000);
    f.client.contribute(&donor, &10_000);
    assert_eq!(f.client.try_sweep_fee(), Err(Ok(Error::WrongPhase)));
}

#[test]
fn sweeping_the_fee_leaves_the_awardable_budget_intact() {
    let f = setup(2, 3);
    let recipient = Address::generate(&f.env);
    let school = Address::generate(&f.env);
    award_to(&f, &recipient, &school, &900);

    f.client.sweep_fee();
    f.client
        .release(&recipient, &proof(&f, &recipient, 1), &f.verifier);

    assert_eq!(f.token.balance(&f.treasury), 10_000); // 10% of 100_000
    assert_eq!(f.token.balance(&school), 300);
}

// ---- refunds ----

#[test]
fn unawarded_money_refunds_proportionally() {
    let f = setup(2, 3);
    let a = funded_donor(&f, 6_000);
    let b = funded_donor(&f, 4_000);
    f.client.contribute(&a, &6_000);
    f.client.contribute(&b, &4_000);

    // Nothing is ever awarded; budget is 9_000 after the 10% fee.
    f.env.ledger().set_timestamp(RELEASE_DEADLINE);

    assert_eq!(f.client.refund(&a), 5_400); // 60% of 9_000
    assert_eq!(f.client.refund(&b), 3_600); // 40% of 9_000
    assert_eq!(f.token.balance(&a), 5_400);
    assert_eq!(f.token.balance(&b), 3_600);
}

#[test]
fn tranches_never_released_go_back_to_donors() {
    // A recipient who never produces a proof leaves their money in the pool
    // rather than stranding it.
    let f = setup(2, 3);
    let recipient = Address::generate(&f.env);
    let school = Address::generate(&f.env);
    let donor = funded_donor(&f, 100_000);
    f.client.contribute(&donor, &100_000);
    f.client.apply(&recipient, &900, &hash(&f.env, 1));
    to_review(&f);
    for i in 0..2u32 {
        f.client
            .review(&f.reviewers.get(i).unwrap(), &recipient, &900);
    }
    f.client.allow_payee(&school);
    f.client.finalize(&recipient, &school, &Mode::Direct);

    // Only one of three tranches is ever claimed.
    f.client
        .release(&recipient, &proof(&f, &recipient, 1), &f.verifier);
    f.env.ledger().set_timestamp(RELEASE_DEADLINE);

    // Budget 90_000, released 300, so 89_700 comes back.
    assert_eq!(f.client.refund(&donor), 89_700);
}

#[test]
fn refunds_are_closed_until_the_release_window_ends() {
    let f = setup(2, 3);
    let donor = funded_donor(&f, 1_000);
    f.client.contribute(&donor, &1_000);
    to_review(&f);
    assert_eq!(f.client.try_refund(&donor), Err(Ok(Error::RefundsNotOpen)));
}

#[test]
fn a_donor_cannot_refund_twice() {
    let f = setup(2, 3);
    let donor = funded_donor(&f, 1_000);
    f.client.contribute(&donor, &1_000);
    f.env.ledger().set_timestamp(RELEASE_DEADLINE);

    f.client.refund(&donor);
    assert_eq!(f.client.try_refund(&donor), Err(Ok(Error::AlreadyRefunded)));
    assert_eq!(f.token.balance(&donor), 900);
}

#[test]
fn non_donors_have_nothing_to_refund() {
    let f = setup(2, 3);
    let donor = funded_donor(&f, 1_000);
    f.client.contribute(&donor, &1_000);
    f.env.ledger().set_timestamp(RELEASE_DEADLINE);

    let stranger = Address::generate(&f.env);
    assert_eq!(
        f.client.try_refund(&stranger),
        Err(Ok(Error::NothingToRefund))
    );
}

#[test]
fn cancelling_opens_refunds_immediately() {
    let f = setup(2, 3);
    f.client.cancel();
    // Nothing was contributed, so there is nothing to claim — but the window is
    // open rather than waiting on a deadline that no longer means anything.
    let stranger = Address::generate(&f.env);
    assert_eq!(
        f.client.try_refund(&stranger),
        Err(Ok(Error::NothingToRefund))
    );
}

#[test]
fn refunds_never_exceed_what_is_left() {
    let f = setup(2, 3);
    let a = funded_donor(&f, 3_333);
    let b = funded_donor(&f, 3_333);
    let c = funded_donor(&f, 3_334);
    for (d, amt) in [(&a, 3_333i128), (&b, 3_333), (&c, 3_334)] {
        f.client.contribute(d, &amt);
    }
    f.env.ledger().set_timestamp(RELEASE_DEADLINE);

    let total: i128 = [&a, &b, &c].iter().map(|d| f.client.refund(d)).sum();
    assert!(
        total <= f.client.budget(),
        "rounding must never let refunds exceed the pool"
    );
}

// ---- unclaimed refunds ----

#[test]
fn unclaimed_refunds_sweep_to_the_treasury() {
    // Small donors will not sign a transaction to recover pocket change. Without
    // this the remainder sits in the contract forever.
    let f = setup(2, 3);
    let donor = funded_donor(&f, 10_000);
    f.client.contribute(&donor, &10_000);

    f.env.ledger().set_timestamp(SWEEP_DEADLINE);
    let swept = f.client.sweep_unclaimed();

    assert_eq!(swept, 10_000, "fee and unclaimed refunds both end up here");
    assert_eq!(f.token.balance(&f.treasury), 10_000);
    assert_eq!(f.token.balance(&f.client.address), 0);
}

#[test]
fn sweeping_waits_for_the_grace_period() {
    let f = setup(2, 3);
    let donor = funded_donor(&f, 10_000);
    f.client.contribute(&donor, &10_000);

    f.env.ledger().set_timestamp(RELEASE_DEADLINE);
    assert_eq!(f.client.try_sweep_unclaimed(), Err(Ok(Error::SweepNotOpen)));

    f.env.ledger().set_timestamp(SWEEP_DEADLINE - 1);
    assert_eq!(f.client.try_sweep_unclaimed(), Err(Ok(Error::SweepNotOpen)));
}

#[test]
fn a_donor_who_claims_in_time_keeps_their_refund() {
    let f = setup(2, 3);
    let quick = funded_donor(&f, 5_000);
    let slow = funded_donor(&f, 5_000);
    f.client.contribute(&quick, &5_000);
    f.client.contribute(&slow, &5_000);

    f.env.ledger().set_timestamp(RELEASE_DEADLINE);
    f.client.refund(&quick);
    assert_eq!(f.token.balance(&quick), 4_500);

    f.env.ledger().set_timestamp(SWEEP_DEADLINE);
    f.client.sweep_unclaimed();

    // The one who showed up kept theirs; only what nobody claimed moved on.
    assert_eq!(f.token.balance(&quick), 4_500);
    assert_eq!(f.token.balance(&slow), 0);
    assert_eq!(f.token.balance(&f.treasury), 5_500);
}

#[test]
fn sweeping_an_empty_programme_is_rejected() {
    let f = setup(2, 3);
    f.env.ledger().set_timestamp(SWEEP_DEADLINE);
    assert_eq!(
        f.client.try_sweep_unclaimed(),
        Err(Ok(Error::NothingToSweep))
    );
}

#[test]
fn a_sweep_deadline_before_the_release_deadline_is_rejected() {
    let f = setup(2, 3);
    let c = f.client.get_config();
    assert!(
        c.sweep_deadline > c.release_deadline,
        "donors must get a grace period after releases end"
    );
}

// ---- allocated mode ----

/// Award `granted` in `Allocated` mode and release the first tranche, so the
/// recipient has escrow to direct.
fn allocated_to(f: &Fixture, recipient: &Address, granted: &i128) -> i128 {
    let donor = funded_donor(f, 100_000);
    f.client.contribute(&donor, &100_000);
    f.client.apply(recipient, granted, &hash(&f.env, 1));
    to_review(f);
    for i in 0..f.client.get_config().quorum {
        f.client
            .review(&f.reviewers.get(i).unwrap(), recipient, granted);
    }
    // In Allocated mode the payee is chosen later, by the recipient.
    f.client.finalize(recipient, recipient, &Mode::Allocated);
    f.client
        .release(recipient, &proof(f, recipient, 1), &f.verifier)
}

#[test]
fn an_allocated_release_stays_in_escrow() {
    let f = setup(2, 3);
    let recipient = Address::generate(&f.env);
    let amount = allocated_to(&f, &recipient, &900);

    assert_eq!(amount, 300);
    assert_eq!(f.client.allocation_of(&recipient), 300);
    assert_eq!(
        f.token.balance(&recipient),
        0,
        "the recipient directs the money without ever holding it"
    );
    assert_eq!(f.token.balance(&f.client.address), 100_000);
}

#[test]
fn a_recipient_directs_their_allocation_to_a_verified_payee() {
    let f = setup(2, 3);
    let recipient = Address::generate(&f.env);
    allocated_to(&f, &recipient, &900);

    let school = Address::generate(&f.env);
    f.client.allow_payee(&school);

    let remaining = f.client.spend(&recipient, &school, &200);
    assert_eq!(remaining, 100);
    assert_eq!(f.token.balance(&school), 200);
    assert_eq!(f.client.allocation_of(&recipient), 100);
}

#[test]
fn a_recipient_chooses_between_verified_payees() {
    // The agency that Direct mode denies them: same money, their choice.
    let f = setup(2, 3);
    let recipient = Address::generate(&f.env);
    allocated_to(&f, &recipient, &900);

    let bookshop = Address::generate(&f.env);
    let landlord = Address::generate(&f.env);
    f.client.allow_payee(&bookshop);
    f.client.allow_payee(&landlord);

    f.client.spend(&recipient, &bookshop, &120);
    f.client.spend(&recipient, &landlord, &180);

    assert_eq!(f.token.balance(&bookshop), 120);
    assert_eq!(f.token.balance(&landlord), 180);
    assert_eq!(f.client.allocation_of(&recipient), 0);
}

#[test]
fn an_allocation_cannot_reach_anyone_unverified() {
    // The guarantee Restricted mode cannot make: there is no wallet to
    // misconfigure, so the money simply has nowhere else to go.
    let f = setup(2, 3);
    let recipient = Address::generate(&f.env);
    allocated_to(&f, &recipient, &900);

    let casino = Address::generate(&f.env);
    assert_eq!(
        f.client.try_spend(&recipient, &casino, &100),
        Err(Ok(Error::PayeeNotVerified))
    );
    assert_eq!(f.client.allocation_of(&recipient), 300);
    assert_eq!(f.token.balance(&casino), 0);
}

#[test]
fn a_recipient_cannot_pay_themselves() {
    let f = setup(2, 3);
    let recipient = Address::generate(&f.env);
    allocated_to(&f, &recipient, &900);

    assert_eq!(
        f.client.try_spend(&recipient, &recipient, &100),
        Err(Ok(Error::PayeeNotVerified))
    );
}

#[test]
fn spending_beyond_the_allocation_is_rejected() {
    let f = setup(2, 3);
    let recipient = Address::generate(&f.env);
    allocated_to(&f, &recipient, &900);

    let school = Address::generate(&f.env);
    f.client.allow_payee(&school);
    assert_eq!(
        f.client.try_spend(&recipient, &school, &301),
        Err(Ok(Error::InsufficientAllocation))
    );
}

#[test]
fn allocations_do_not_leak_between_recipients() {
    let f = setup(2, 3);
    let a = Address::generate(&f.env);
    let b = Address::generate(&f.env);
    allocated_to(&f, &a, &900);

    let school = Address::generate(&f.env);
    f.client.allow_payee(&school);
    assert_eq!(
        f.client.try_spend(&b, &school, &100),
        Err(Ok(Error::InsufficientAllocation))
    );
}

#[test]
fn denying_a_payee_stops_future_spending() {
    let f = setup(2, 3);
    let recipient = Address::generate(&f.env);
    allocated_to(&f, &recipient, &900);

    let school = Address::generate(&f.env);
    f.client.allow_payee(&school);
    f.client.spend(&recipient, &school, &100);

    f.client.deny_payee(&school);
    assert_eq!(
        f.client.try_spend(&recipient, &school, &100),
        Err(Ok(Error::PayeeNotVerified))
    );
    // Already-directed money is not clawed back.
    assert_eq!(f.token.balance(&school), 100);
}

#[test]
fn allocations_stop_being_directable_once_the_sweep_opens() {
    let f = setup(2, 3);
    let recipient = Address::generate(&f.env);
    allocated_to(&f, &recipient, &900);

    let school = Address::generate(&f.env);
    f.client.allow_payee(&school);

    f.env.ledger().set_timestamp(SWEEP_DEADLINE);
    assert_eq!(
        f.client.try_spend(&recipient, &school, &100),
        Err(Ok(Error::SpendWindowClosed))
    );
}

// ---- restricted mode guards ----

#[test]
fn a_restricted_release_needs_the_policy_installed() {
    // A restricted award paid into a wallet with no policy is an unrestricted
    // payment wearing the wrong label.
    let f = setup(2, 3);
    let recipient = Address::generate(&f.env);
    let wallet = Address::generate(&f.env);
    let donor = funded_donor(&f, 100_000);
    f.client.contribute(&donor, &100_000);
    f.client.apply(&recipient, &900, &hash(&f.env, 1));
    to_review(&f);
    for i in 0..2u32 {
        f.client
            .review(&f.reviewers.get(i).unwrap(), &recipient, &900);
    }
    f.client.finalize(&recipient, &wallet, &Mode::Restricted);

    assert_eq!(
        f.client
            .try_release(&recipient, &proof(&f, &recipient, 1), &f.verifier),
        Err(Ok(Error::PolicyNotInstalled))
    );
    assert_eq!(f.token.balance(&wallet), 0);

    // Once installed the same release goes through.
    f.policy.install(&wallet);
    assert_eq!(
        f.client
            .release(&recipient, &proof(&f, &recipient, 2), &f.verifier),
        300
    );
    assert_eq!(f.token.balance(&wallet), 300);
}

// ---- payee registry ----

#[test]
fn a_direct_award_must_name_a_verified_payee() {
    let f = setup(2, 3);
    let recipient = Address::generate(&f.env);
    let donor = funded_donor(&f, 100_000);
    f.client.contribute(&donor, &100_000);
    f.client.apply(&recipient, &900, &hash(&f.env, 1));
    to_review(&f);
    for i in 0..2u32 {
        f.client
            .review(&f.reviewers.get(i).unwrap(), &recipient, &900);
    }

    let unknown = Address::generate(&f.env);
    assert_eq!(
        f.client.try_finalize(&recipient, &unknown, &Mode::Direct),
        Err(Ok(Error::PayeeNotVerified))
    );
}

#[test]
fn the_payee_registry_rejects_duplicates_and_unknowns() {
    let f = setup(2, 3);
    let school = Address::generate(&f.env);

    f.client.allow_payee(&school);
    assert!(f.client.is_payee(&school));
    assert_eq!(
        f.client.try_allow_payee(&school),
        Err(Ok(Error::AlreadyPayee))
    );

    f.client.deny_payee(&school);
    assert_eq!(f.client.try_deny_payee(&school), Err(Ok(Error::NotPayee)));
}

// ---- property tests for the median award mechanism ----

mod proptests {
    use super::*;
    use proptest::prelude::*;

    fn run_award(f: &Fixture, requested: i128, votes: &[i128]) -> i128 {
        let applicant = Address::generate(&f.env);
        let donor = funded_donor(f, 100_000);
        f.client.contribute(&donor, &100_000);
        f.client.apply(&applicant, &requested, &hash(&f.env, 1));
        to_review(f);
        for (i, v) in votes.iter().enumerate() {
            f.client
                .review(&f.reviewers.get(i as u32).unwrap(), &applicant, v);
        }
        let payee = Address::generate(&f.env);
        f.client.allow_payee(&payee);
        f.client.finalize(&applicant, &payee, &Mode::Direct).granted
    }

    proptest! {
        #[test]
        fn award_in_bounding_box(
            mut votes in prop::collection::vec(1i128..=10_000i128, 3..=16),
        ) {
            votes.sort();
            let requested = *votes.last().unwrap();
            let f = setup(votes.len() as u32, votes.len() as u32);
            let granted = run_award(&f, requested, &votes);
            prop_assert!(
                granted >= *votes.first().unwrap() && granted <= *votes.last().unwrap(),
            );
        }
    }

    proptest! {
        #[test]
        fn award_never_exceeds_requested(
            votes in prop::collection::vec(1i128..=10_000i128, 3..=16),
            requested in 10_000i128..=100_000i128,
        ) {
            let f = setup(votes.len() as u32, votes.len() as u32);
            let granted = run_award(&f, requested, &votes);
            prop_assert!(granted <= requested);
        }
    }

    proptest! {
        #[test]
        fn median_more_robust_than_mean(
            base_votes in prop::collection::vec(100i128..=9_000i128, 3..=15),
            extreme in prop_oneof![Just(1i128), Just(10_000i128)],
        ) {
            prop_assume!(base_votes.len() < MAX_QUORUM as usize);

            let mut sorted = base_votes.clone();
            sorted.sort();
            let requested = *sorted.last().unwrap().max(&extreme);

            let f_base = setup(sorted.len() as u32, sorted.len() as u32);
            let median_before = run_award(&f_base, requested, &sorted);

            let mut with_extreme = sorted.clone();
            with_extreme.push(extreme);
            with_extreme.sort();
            let f_ext = setup(with_extreme.len() as u32, with_extreme.len() as u32);
            let median_after = run_award(&f_ext, requested, &with_extreme);

            let median_shift = (median_after - median_before).unsigned_abs();

            // The median's influence from a single vote is bounded by the gap
            // between the two order statistics it can jump between.  This is the
            // core robustness property the issue asks for: no single vote can
            // move the median by more than one "step" in the sorted list,
            // whereas the mean is pulled proportionally to the outlier's
            // distance from the centre.
            let max_gap = sorted.windows(2)
                .map(|w| (w[1] - w[0]).unsigned_abs())
                .max()
                .unwrap_or(0);
            prop_assert!(
                median_shift <= max_gap,
                "median shift {median_shift} must be bounded by max gap {max_gap}",
            );
        }
    }

    proptest! {
        #[test]
        fn order_independent(
            votes in prop::collection::vec(1i128..=10_000i128, 3..=16),
        ) {
            let requested = *votes.iter().max().unwrap();
            let n = votes.len() as u32;

            let f1 = setup(n, n);
            let g1 = run_award(&f1, requested, &votes);

            let mut reversed = votes.clone();
            reversed.reverse();
            let f2 = setup(n, n);
            let g2 = run_award(&f2, requested, &reversed);

            prop_assert_eq!(g1, g2);
        }
    }

    proptest! {
        #[test]
        fn identical_votes_yields_that_value(
            value in 1i128..=10_000i128,
            n in 3u32..=16u32,
        ) {
            let f = setup(n, n);
            // Build a stack-allocated slice to avoid soroban_sdk::Vec aliasing.
            let mut buf = [0i128; 16];
            for slot in buf.iter_mut().take(n as usize) {
                *slot = value;
            }
            let granted = run_award(&f, value, &buf[..n as usize]);
            prop_assert_eq!(granted, value);
        }
    }
}
