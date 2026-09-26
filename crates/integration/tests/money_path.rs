//! The money path, end to end, through the real contracts.
//!
//! Each test here is a claim about the protocol that no single contract's suite
//! can make, because each of them only becomes true when the contracts are
//! arranged the way a deployment arranges them.

use milepost_integration::{Deployed, Mode, Phase, ProgrammeError, Protocol};
use milepost_test_utils::hash;
use milepost_test_utils::schedule::{RELEASE_DEADLINE, SWEEP_DEADLINE};
use smart_wallet_interface::types::SignerKey;
use soroban_sdk::auth::{Context, ContractContext};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{testutils::Ledger as _, vec, Address, BytesN, IntoVal, Symbol, Vec};

/// Take a programme as far as an approved application: applied for in the open
/// phase, then approved by the panel at the requested amount.
///
/// Leaves the timestamp in the review phase, which is where `finalize` belongs.
fn apply_and_award(p: &Protocol, programme: &Deployed, applicant: &Address, amount: i128) {
    p.env.ledger().set_timestamp(5_000);
    programme.client.apply(applicant, &amount, &hash(&p.env, 1));
    p.env.ledger().set_timestamp(15_000);
    programme.client.review(&p.reviewer, applicant, &amount);
}

/// A proof from the trusted verifier, which is what `release` checks.
fn proof(p: &Protocol, subject: &Address, n: u8) -> BytesN<32> {
    p.attest
        .attest(&p.verifier, &p.schema, subject, &hash(&p.env, n), &None)
}

/// A token transfer as a smart wallet's policy signer would be handed it.
fn transfer_context(p: &Protocol, from: &Address, to: &Address, amount: i128) -> Vec<Context> {
    vec![
        &p.env,
        Context::Contract(ContractContext {
            contract: p.token_address.clone(),
            fn_name: Symbol::new(&p.env, "transfer"),
            args: vec![
                &p.env,
                from.into_val(&p.env),
                to.into_val(&p.env),
                amount.into_val(&p.env),
            ],
        }),
    ]
}

#[test]
fn money_contributed_by_two_donors_ends_up_where_everyone_agreed() {
    // The whole path in one test: contribute, apply, review, award, release,
    // direct, take the fee, refund one donor, sweep what nobody claimed, and
    // check that the contract is empty and the arithmetic adds up.
    let p = Protocol::deploy();
    let programme = p.create_programme(2);

    let donor_a = Address::generate(&p.env);
    let donor_b = Address::generate(&p.env);
    let recipient = Address::generate(&p.env);
    let school = Address::generate(&p.env);

    // Two donors rather than one, because every refund below is proportional and
    // a single donor makes each share equal to the whole.
    p.contribute(&programme, &donor_a, 60_000);
    p.contribute(&programme, &donor_b, 40_000);
    assert_eq!(programme.client.total_contributed(), 100_000);
    assert_eq!(p.token.balance(&programme.address), 100_000);

    apply_and_award(&p, &programme, &recipient, 30_000);
    programme.client.allow_payee(&school);
    let award = programme
        .client
        .finalize(&recipient, &school, &Mode::Allocated);
    assert_eq!(award.granted, 30_000);
    assert_eq!(award.tranches, 2);

    // Tranche one: the verifier attests, and anyone can present the proof.
    p.env.ledger().set_timestamp(20_000);
    assert_eq!(programme.client.get_phase(), Phase::Settled);
    assert_eq!(
        programme
            .client
            .release(&recipient, &proof(&p, &recipient, 2), &p.verifier),
        15_000
    );

    // `Allocated` escrows rather than paying, so the money is the recipient's to
    // direct — to an address the creator verified.
    assert_eq!(p.token.balance(&school), 0);
    assert_eq!(programme.client.allocation_of(&recipient), 15_000);
    p.env.ledger().set_timestamp(25_000);
    assert_eq!(programme.client.spend(&recipient, &school, &15_000), 0);
    assert_eq!(p.token.balance(&school), 15_000);

    // The release window closes, and the protocol takes its 10%. Anyone may
    // sweep it; the creator and the donors cannot.
    p.env.ledger().set_timestamp(RELEASE_DEADLINE + 1);
    assert_eq!(programme.client.sweep_fee(), 10_000);
    assert_eq!(p.token.balance(&p.treasury), 10_000);

    // One donor reclaims their share. `available` is what was contributed less
    // the fee, and the tranche already released is not theirs to reclaim, so
    // donor A's share is 60_000 x (90_000 - 15_000) / 100_000 = 45_000.
    assert_eq!(programme.client.refund(&donor_a), 45_000);
    assert_eq!(p.token.balance(&donor_a), 45_000);
    assert_eq!(programme.client.refunded_to(&donor_a), 45_000);
    // Claiming again is refused rather than quietly paying nothing.
    assert_eq!(
        programme.client.try_refund(&donor_a),
        Err(Ok(ProgrammeError::AlreadyRefunded))
    );

    // Donor B never claims. The money they are owed does not sit in the contract
    // for ever: after the sweep deadline anyone can send it to the treasury.
    p.env.ledger().set_timestamp(SWEEP_DEADLINE + 1);
    assert_eq!(programme.client.sweep_unclaimed(), 30_000);
    assert_eq!(p.token.balance(&programme.address), 0);
    assert_eq!(p.token.balance(&p.treasury), 40_000);
    assert_eq!(p.token.balance(&donor_b), 40_000);
    assert_eq!(p.token.balance(&school), 15_000);
    assert_eq!(p.token.balance(&recipient), 0);

    // The programme's own accounting agrees with the token balances:
    // 15_000 released + 45_000 refunded + 30_000 swept + 10_000 fee = 100_000
    // contributed, and nothing is left in the contract.
    assert_eq!(programme.client.total_released(), 15_000);
    assert_eq!(programme.client.total_refunded(), 45_000);
    assert_eq!(programme.client.total_swept(), 30_000);
    assert_eq!(programme.client.total_granted(), 30_000);
    assert_eq!(programme.client.allocation_of(&recipient), 0);
    assert_eq!(
        programme.client.budget(),
        90_000,
        "the fee is held back from the budget rather than from each tranche"
    );

    // And the recipient's standing says what actually reached them: the released
    // tranche, whether or not they have spent it.
    let standing = p.standing(&recipient).expect("a release credits standing");
    assert_eq!(standing.total_received, 15_000);
    assert_eq!(standing.tranches, 1);
    assert_eq!(standing.programmes, 1);
    assert_eq!(standing.first_seen, 20_000);
    assert_eq!(standing.last_seen, 20_000);
}

#[test]
fn a_restricted_award_needs_a_policy_and_then_the_policy_governs_the_wallet() {
    let p = Protocol::deploy();
    let programme = p.create_programme(1);

    let donor = Address::generate(&p.env);
    let recipient = Address::generate(&p.env);
    let wallet = Address::generate(&p.env);
    let steward = Address::generate(&p.env);
    let school = Address::generate(&p.env);
    let casino = Address::generate(&p.env);

    p.contribute(&programme, &donor, 100_000);
    apply_and_award(&p, &programme, &recipient, 10_000);
    programme
        .client
        .finalize(&recipient, &wallet, &Mode::Restricted);

    // No policy installed, so the tranche is refused rather than paid into a
    // wallet nothing governs.
    p.env.ledger().set_timestamp(20_000);
    let attestation = proof(&p, &recipient, 3);
    assert_eq!(
        programme
            .client
            .try_release(&recipient, &attestation, &p.verifier),
        Err(Ok(ProgrammeError::PolicyNotInstalled))
    );
    assert_eq!(p.token.balance(&wallet), 0);

    // The recipient's wallet agrees to the rules once; the steward sets them and
    // names the payees. The wallet cannot widen them afterwards.
    p.policy
        .configure(&steward, &wallet, &p.token_address, &1_000, &86_400);
    p.policy.allow_payee(&steward, &wallet, &school);
    p.policy.install(&wallet);

    assert_eq!(
        programme
            .client
            .release(&recipient, &attestation, &p.verifier),
        10_000
    );
    assert_eq!(p.token.balance(&wallet), 10_000);
    assert_eq!(p.standing(&recipient).unwrap().total_received, 10_000);

    // No smart wallet is deployed here, so the policy is asked directly — exactly
    // the call the wallet's signer makes, with the same arguments.
    let signer = SignerKey::Policy(p.policy.address.clone());

    // A payee the steward never verified.
    assert!(p
        .policy
        .try_policy__(
            &wallet,
            &signer,
            &transfer_context(&p, &wallet, &casino, 100)
        )
        .is_err());
    assert_eq!(p.policy.remaining(&wallet), 1_000);

    // A verified payee, inside the cap: 400 of 1_000.
    p.policy.policy__(
        &wallet,
        &signer,
        &transfer_context(&p, &wallet, &school, 400),
    );
    assert_eq!(p.policy.remaining(&wallet), 600);

    // Over the cap, so the rest of the allowance is not available either.
    assert!(p
        .policy
        .try_policy__(
            &wallet,
            &signer,
            &transfer_context(&p, &wallet, &school, 700)
        )
        .is_err());
    assert_eq!(p.policy.remaining(&wallet), 600);
}

#[test]
fn standing_accumulates_across_programmes_and_its_history_is_verifiable() {
    let p = Protocol::deploy();
    let first = p.create_programme(1);
    let second = p.create_programme(1);

    let donor = Address::generate(&p.env);
    let recipient = Address::generate(&p.env);
    let payee = Address::generate(&p.env);

    p.contribute(&first, &donor, 100_000);
    p.contribute(&second, &donor, 100_000);
    apply_and_award(&p, &first, &recipient, 10_000);
    apply_and_award(&p, &second, &recipient, 20_000);
    first.client.allow_payee(&payee);
    second.client.allow_payee(&payee);
    first.client.finalize(&recipient, &payee, &Mode::Direct);
    second.client.finalize(&recipient, &payee, &Mode::Direct);

    // One attestation is one fact about the recipient, and both programmes
    // trust this verifier under the same schema. Replay protection is per
    // programme: a proof cannot be spent twice in one programme, but nothing in
    // the attestation says which programme paid for it.
    let attestation = proof(&p, &recipient, 9);
    p.env.ledger().set_timestamp(20_000);
    assert_eq!(
        first.client.release(&recipient, &attestation, &p.verifier),
        10_000
    );
    p.env.ledger().set_timestamp(21_000);
    assert_eq!(
        second.client.release(&recipient, &attestation, &p.verifier),
        20_000
    );
    assert_eq!(p.token.balance(&payee), 30_000);

    // Within one programme it is refused the second time.
    assert!(first
        .client
        .try_release(&recipient, &attestation, &p.verifier)
        .is_err());

    let standing = p
        .standing(&recipient)
        .expect("standing is keyed by recipient");
    assert_eq!(standing.programmes, 2, "counted once per programme");
    assert_eq!(standing.tranches, 2);
    assert_eq!(standing.total_received, 30_000);
    assert_eq!(standing.first_seen, 20_000);
    assert_eq!(standing.last_seen, 21_000);

    // Anyone can check a claimed history against this root, without trusting
    // whoever indexed it: it is a fold over each credit in order.
    let genesis = BytesN::from_array(&p.env, &[0u8; 32]);
    let after_first = p
        .record
        .next_root(&genesis, &first.address, &10_000, &attestation, &20_000);
    let after_second = p.record.next_root(
        &after_first,
        &second.address,
        &20_000,
        &attestation,
        &21_000,
    );
    assert_eq!(standing.history_root, after_second);
}

#[test]
fn a_programme_the_registry_never_deployed_cannot_pay_itself_a_track_record() {
    let p = Protocol::deploy();
    let authorised = p.create_programme(1);
    let rogue = p.deploy_unauthorised_programme(1);

    // Same wasm, same token, same schema, same reviewer and verifier, and the
    // registry knows nothing about it.
    assert!(!p.registry.is_programme(&rogue.address));
    assert!(p.registry.is_programme(&authorised.address));

    let donor = Address::generate(&p.env);
    let recipient = Address::generate(&p.env);
    let payee = Address::generate(&p.env);

    // It collects money, and it settles an award, quite happily — its creator
    // does own it.
    p.contribute(&rogue, &donor, 100_000);
    apply_and_award(&p, &rogue, &recipient, 10_000);
    rogue.client.allow_payee(&payee);
    rogue.client.finalize(&recipient, &payee, &Mode::Direct);

    // The release fails, because standing is written through the record contract
    // and the record only accepts writers the registry introduced it to. The
    // reason, stated directly against the record:
    p.env.ledger().set_timestamp(20_000);
    let attestation = proof(&p, &recipient, 11);
    assert_eq!(
        p.record.try_credit(
            &rogue.address,
            &recipient,
            &rogue.address,
            &10_000,
            &attestation
        ),
        Err(Ok(milepost_record::Error::NotAuthorized))
    );

    // And so the payment does not happen either. The token transfer and the
    // credit are one call, so the refusal reverts the transfer with it: a
    // programme nobody authorised cannot pay out and leave the record untouched.
    assert!(rogue
        .client
        .try_release(&recipient, &attestation, &p.verifier)
        .is_err());
    assert_eq!(p.token.balance(&payee), 0);
    assert_eq!(p.token.balance(&rogue.address), 100_000);
    assert!(p.record.try_get(&recipient).is_err());
    assert!(p.standing(&recipient).is_none());
}

#[test]
fn an_open_award_pays_the_recipient_and_refuses_to_pay_anybody_else() {
    let p = Protocol::deploy();
    let programme = p.create_programme(1);

    let donor = Address::generate(&p.env);
    let recipient = Address::generate(&p.env);
    let stranger = Address::generate(&p.env);

    p.contribute(&programme, &donor, 100_000);
    apply_and_award(&p, &programme, &recipient, 10_000);

    // `Open` names the recipient as the destination, so a payee the creator
    // verified is not a way around that: this is the one check that stops `Open`
    // from being `Direct` with the verification attached.
    programme.client.allow_payee(&stranger);
    assert_eq!(
        programme
            .client
            .try_finalize(&recipient, &stranger, &Mode::Open),
        Err(Ok(ProgrammeError::OpenPayeeNotRecipient))
    );

    programme
        .client
        .finalize(&recipient, &recipient, &Mode::Open);
    p.env.ledger().set_timestamp(20_000);
    assert_eq!(
        programme
            .client
            .release(&recipient, &proof(&p, &recipient, 13), &p.verifier),
        10_000
    );

    assert_eq!(p.token.balance(&recipient), 10_000);
    assert_eq!(p.token.balance(&stranger), 0);
    assert_eq!(p.standing(&recipient).unwrap().total_received, 10_000);
}
