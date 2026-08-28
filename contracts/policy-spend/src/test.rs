#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    vec, IntoVal, Symbol,
};

const CAP: i128 = 1_000;
const PERIOD: u64 = 86_400; // one day

struct Fixture {
    env: Env,
    client: PolicySpendClient<'static>,
    steward: Address,
    wallet: Address,
    token: Address,
    school: Address,
}

fn setup() -> Fixture {
    let env = milepost_test_utils::new_test_env();

    let id = env.register(PolicySpend, ());
    let client = PolicySpendClient::new(&env, &id);

    let steward = Address::generate(&env);
    let wallet = Address::generate(&env);
    let token = milepost_test_utils::register_token(&env);
    let school = Address::generate(&env);

    client.configure(&steward, &wallet, &token, &CAP, &PERIOD);
    client.allow_payee(&steward, &wallet, &school);

    Fixture {
        env: env.clone(),
        client,
        steward,
        wallet,
        token,
        school,
    }
}

/// The authorisation context the wallet would present for a token transfer.
fn transfer_context(f: &Fixture, from: &Address, to: &Address, amount: i128) -> Vec<Context> {
    vec![
        &f.env,
        Context::Contract(ContractContext {
            contract: f.token.clone(),
            fn_name: Symbol::new(&f.env, "transfer"),
            args: vec![
                &f.env,
                from.into_val(&f.env),
                to.into_val(&f.env),
                amount.into_val(&f.env),
            ],
        }),
    ]
}

fn signer(f: &Fixture) -> SignerKey {
    SignerKey::Policy(f.client.address.clone())
}

/// `policy__` denies by panicking rather than returning an error — its
/// signature is fixed by `PolicyInterface` and returns `()`. So a rejection
/// arrives as a host `InvokeError` carrying the contract error code, not as
/// `Err(Ok(..))` the way the other contracts' fallible calls do.
fn assert_denied<T: core::fmt::Debug>(
    result: Result<T, Result<soroban_sdk::Error, soroban_sdk::InvokeError>>,
    expected: SpendError,
) {
    match result {
        Err(Ok(actual)) => assert_eq!(
            actual,
            soroban_sdk::Error::from_contract_error(expected as u32),
            "denied for the wrong reason"
        ),
        other => panic!("expected {expected:?}, got {other:?}"),
    }
}

// ---- configuration ----

#[test]
fn configure_stores_the_rules() {
    let f = setup();
    let p = f.client.get_policy(&f.wallet);
    assert_eq!(p.steward, f.steward);
    assert_eq!(p.cap, CAP);
    assert_eq!(p.period, PERIOD);
    assert_eq!(p.spent, 0);
}

#[test]
fn a_stranger_cannot_take_over_a_configured_wallet() {
    // Otherwise anyone could point an existing recipient's policy at payees of
    // their choosing.
    let f = setup();
    let stranger = Address::generate(&f.env);
    assert_eq!(
        f.client
            .try_configure(&stranger, &f.wallet, &f.token, &CAP, &PERIOD),
        Err(Ok(SpendError::NotSteward))
    );
}

#[test]
fn only_the_steward_edits_the_allowlist() {
    // The recipient controls the wallet, so if the wallet could add payees it
    // would add itself and the restriction would mean nothing.
    let f = setup();
    let shop = Address::generate(&f.env);

    assert_eq!(
        f.client.try_allow_payee(&f.wallet, &f.wallet, &shop),
        Err(Ok(SpendError::NotSteward))
    );
    assert!(!f.client.is_payee(&f.wallet, &shop));

    f.client.allow_payee(&f.steward, &f.wallet, &shop);
    assert!(f.client.is_payee(&f.wallet, &shop));
}

#[test]
fn a_denied_payee_stops_being_spendable() {
    let f = setup();
    f.client.deny_payee(&f.steward, &f.wallet, &f.school);
    assert!(!f.client.is_payee(&f.wallet, &f.school));

    assert_denied(
        f.client.try_policy__(
            &f.wallet,
            &signer(&f),
            &transfer_context(&f, &f.wallet, &f.school, 100),
        ),
        SpendError::PayeeNotAllowed,
    );
}

#[test]
fn a_zero_cap_is_rejected() {
    let f = setup();
    let other = Address::generate(&f.env);
    assert_eq!(
        f.client
            .try_configure(&f.steward, &other, &f.token, &0, &PERIOD),
        Err(Ok(SpendError::InvalidCap))
    );
}

// ---- authorisation ----

#[test]
fn a_verified_payee_within_cap_is_approved() {
    let f = setup();
    f.client.policy__(
        &f.wallet,
        &signer(&f),
        &transfer_context(&f, &f.wallet, &f.school, 400),
    );
    assert_eq!(f.client.get_policy(&f.wallet).spent, 400);
    assert_eq!(f.client.remaining(&f.wallet), 600);
}

#[test]
fn an_unverified_payee_is_rejected() {
    // The whole point: their wallet, their key, but no route to a casino.
    let f = setup();
    let casino = Address::generate(&f.env);
    assert_denied(
        f.client.try_policy__(
            &f.wallet,
            &signer(&f),
            &transfer_context(&f, &f.wallet, &casino, 100),
        ),
        SpendError::PayeeNotAllowed,
    );
    assert_eq!(f.client.get_policy(&f.wallet).spent, 0);
}

#[test]
fn a_different_asset_is_rejected() {
    let f = setup();
    let other_token = milepost_test_utils::register_token(&f.env);

    let contexts = vec![
        &f.env,
        Context::Contract(ContractContext {
            contract: other_token,
            fn_name: Symbol::new(&f.env, "transfer"),
            args: vec![
                &f.env,
                f.wallet.into_val(&f.env),
                f.school.into_val(&f.env),
                100i128.into_val(&f.env),
            ],
        }),
    ];
    assert_denied(
        f.client.try_policy__(&f.wallet, &signer(&f), &contexts),
        SpendError::ForbiddenCall,
    );
}

#[test]
fn a_non_transfer_call_is_rejected() {
    // `approve` would hand a third party open-ended spending authority and
    // sidestep every rule here.
    let f = setup();
    let contexts = vec![
        &f.env,
        Context::Contract(ContractContext {
            contract: f.token.clone(),
            fn_name: Symbol::new(&f.env, "approve"),
            args: vec![
                &f.env,
                f.wallet.into_val(&f.env),
                f.school.into_val(&f.env),
                100i128.into_val(&f.env),
            ],
        }),
    ];
    assert_denied(
        f.client.try_policy__(&f.wallet, &signer(&f), &contexts),
        SpendError::ForbiddenCall,
    );
}

#[test]
fn moving_someone_elses_funds_is_rejected() {
    let f = setup();
    let victim = Address::generate(&f.env);
    assert_denied(
        f.client.try_policy__(
            &f.wallet,
            &signer(&f),
            &transfer_context(&f, &victim, &f.school, 100),
        ),
        SpendError::ForbiddenTransfer,
    );
}

#[test]
fn the_cap_is_enforced_cumulatively() {
    let f = setup();
    f.client.policy__(
        &f.wallet,
        &signer(&f),
        &transfer_context(&f, &f.wallet, &f.school, 600),
    );
    f.client.policy__(
        &f.wallet,
        &signer(&f),
        &transfer_context(&f, &f.wallet, &f.school, 400),
    );
    assert_eq!(f.client.remaining(&f.wallet), 0);

    assert_denied(
        f.client.try_policy__(
            &f.wallet,
            &signer(&f),
            &transfer_context(&f, &f.wallet, &f.school, 1),
        ),
        SpendError::CapExceeded,
    );
}

#[test]
fn every_context_in_a_transaction_is_checked() {
    // A forbidden call must not ride along with a permitted one.
    let f = setup();
    let casino = Address::generate(&f.env);
    let contexts = vec![
        &f.env,
        Context::Contract(ContractContext {
            contract: f.token.clone(),
            fn_name: Symbol::new(&f.env, "transfer"),
            args: vec![
                &f.env,
                f.wallet.into_val(&f.env),
                f.school.into_val(&f.env),
                100i128.into_val(&f.env),
            ],
        }),
        Context::Contract(ContractContext {
            contract: f.token.clone(),
            fn_name: Symbol::new(&f.env, "transfer"),
            args: vec![
                &f.env,
                f.wallet.into_val(&f.env),
                casino.into_val(&f.env),
                100i128.into_val(&f.env),
            ],
        }),
    ];
    assert_denied(
        f.client.try_policy__(&f.wallet, &signer(&f), &contexts),
        SpendError::PayeeNotAllowed,
    );
    assert_eq!(
        f.client.get_policy(&f.wallet).spent,
        0,
        "a rejected batch must not bank the permitted leg"
    );
}

#[test]
fn the_allowance_resets_when_the_window_lapses() {
    let f = setup();
    f.client.policy__(
        &f.wallet,
        &signer(&f),
        &transfer_context(&f, &f.wallet, &f.school, CAP),
    );
    assert_eq!(f.client.remaining(&f.wallet), 0);

    f.env.ledger().set_timestamp(PERIOD + 1);
    assert_eq!(f.client.remaining(&f.wallet), CAP);
    f.client.policy__(
        &f.wallet,
        &signer(&f),
        &transfer_context(&f, &f.wallet, &f.school, 500),
    );
    assert_eq!(f.client.get_policy(&f.wallet).spent, 500);
}

#[test]
fn an_unconfigured_wallet_authorises_nothing() {
    let f = setup();
    let stranger = Address::generate(&f.env);
    assert_denied(
        f.client.try_policy__(
            &stranger,
            &signer(&f),
            &transfer_context(&f, &stranger, &f.school, 1),
        ),
        SpendError::NotConfigured,
    );
}

// ---- install lifecycle ----

#[test]
fn install_and_uninstall_track_the_wallet() {
    let f = setup();
    assert!(!f.client.is_installed(&f.wallet));

    f.client.install(&f.wallet);
    assert!(f.client.is_installed(&f.wallet));

    f.client.uninstall(&f.wallet);
    assert!(!f.client.is_installed(&f.wallet));
}

#[test]
fn uninstalling_does_not_reset_the_spend_window() {
    // Otherwise a wallet could clear its own allowance by removing and
    // re-adding the policy.
    let f = setup();
    f.client.install(&f.wallet);
    f.client.policy__(
        &f.wallet,
        &signer(&f),
        &transfer_context(&f, &f.wallet, &f.school, CAP),
    );

    f.client.uninstall(&f.wallet);
    f.client.install(&f.wallet);

    assert_eq!(f.client.remaining(&f.wallet), 0);
    assert_denied(
        f.client.try_policy__(
            &f.wallet,
            &signer(&f),
            &transfer_context(&f, &f.wallet, &f.school, 1),
        ),
        SpendError::CapExceeded,
    );
}

// ---- spend cap window boundaries ----

#[test]
fn a_transfer_exactly_equal_to_the_cap_succeeds() {
    let f = setup();
    f.client.policy__(
        &f.wallet,
        &signer(&f),
        &transfer_context(&f, &f.wallet, &f.school, CAP),
    );
    assert_eq!(f.client.remaining(&f.wallet), 0);
    assert_denied(
        f.client.try_policy__(
            &f.wallet,
            &signer(&f),
            &transfer_context(&f, &f.wallet, &f.school, 1),
        ),
        SpendError::CapExceeded,
    );
}

#[test]
fn remaining_agrees_with_what_the_next_transfer_will_accept() {
    let f = setup();
    f.client.policy__(
        &f.wallet,
        &signer(&f),
        &transfer_context(&f, &f.wallet, &f.school, 400),
    );
    assert_eq!(f.client.remaining(&f.wallet), 600);

    // A transfer exactly equal to what `remaining` reports is accepted.
    f.client.policy__(
        &f.wallet,
        &signer(&f),
        &transfer_context(&f, &f.wallet, &f.school, 600),
    );
    assert_eq!(f.client.remaining(&f.wallet), 0);

    // ... and one more than it is refused.
    assert_denied(
        f.client.try_policy__(
            &f.wallet,
            &signer(&f),
            &transfer_context(&f, &f.wallet, &f.school, 1),
        ),
        SpendError::CapExceeded,
    );
}

#[test]
fn the_window_flips_exactly_at_the_period() {
    let f = setup();
    f.client.policy__(
        &f.wallet,
        &signer(&f),
        &transfer_context(&f, &f.wallet, &f.school, CAP),
    );
    assert_eq!(f.client.remaining(&f.wallet), 0);

    // One ledger before the boundary: no rollover, nothing new available.
    f.env.ledger().set_timestamp(PERIOD - 1);
    assert_eq!(f.client.remaining(&f.wallet), 0);
    assert_denied(
        f.client.try_policy__(
            &f.wallet,
            &signer(&f),
            &transfer_context(&f, &f.wallet, &f.school, 1),
        ),
        SpendError::CapExceeded,
    );

    // Exactly at the boundary (elapsed when now - start >= period): the window
    // rolls over and the full cap is available again.
    f.env.ledger().set_timestamp(PERIOD);
    assert_eq!(f.client.remaining(&f.wallet), CAP);
    f.client.policy__(
        &f.wallet,
        &signer(&f),
        &transfer_context(&f, &f.wallet, &f.school, CAP),
    );
    assert_eq!(f.client.remaining(&f.wallet), 0);
}

// ---- property tests for spend cap windows ----

mod proptests {
    extern crate std;
    use super::*;
    use proptest::prelude::*;

    /// Run an arbitrary interleaving of time advances and transfers and check
    /// the invariants at every step:
    ///  - spent within the current window never exceeds the cap,
    ///  - the contract's persisted state matches the reference model exactly,
    ///  - `remaining` always agrees with the contract's window arithmetic.
    fn run_window_sequence(ops: &[(u64, i128)]) {
        let f = setup();
        let (mut now, mut window_start, mut spent) = (0u64, 0u64, 0i128);

        for &(delay, amount) in ops {
            now = now.saturating_add(delay);
            f.env.ledger().set_timestamp(now);

            let elapsed = now.saturating_sub(window_start) >= PERIOD;
            let prospective_start = if elapsed { now } else { window_start };
            let prospective_spent = if elapsed { 0 } else { spent };

            let contexts = transfer_context(&f, &f.wallet, &f.school, amount);
            if prospective_spent + amount > CAP {
                // A denial (including a window-lapsing call) persists nothing.
                assert_denied(
                    f.client.try_policy__(&f.wallet, &signer(&f), &contexts),
                    SpendError::CapExceeded,
                );
            } else {
                f.client.policy__(&f.wallet, &signer(&f), &contexts);
                spent = prospective_spent + amount;
                window_start = prospective_start;
            }

            let pol = f.client.get_policy(&f.wallet);
            assert_eq!(pol.spent, spent, "contract spent drifted from the model");
            assert_eq!(
                pol.window_start, window_start,
                "contract window drifted from the model"
            );
            // Total spent within the current window never exceeds the cap.
            assert!(spent <= CAP, "spent {spent} exceeded cap {CAP}");

            // `remaining` agrees with the contract's window arithmetic: it is
            // the full cap once the window elapses, otherwise cap minus spent.
            let remaining_model = if now.saturating_sub(window_start) >= PERIOD {
                CAP
            } else {
                CAP - spent
            };
            assert_eq!(
                f.client.remaining(&f.wallet),
                remaining_model,
                "remaining() disagreed with the window model"
            );
        }
    }

    proptest! {
        #[test]
        fn the_window_cap_holds_across_arbitrary_time_advances_and_transfers(
            ops in prop::collection::vec(
                (0u64..=(PERIOD + 3600), 1i128..=CAP),
                1..=12,
            ),
        ) {
            run_window_sequence(&ops);
        }
    }
}
