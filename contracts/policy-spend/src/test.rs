#![cfg(test)]

use super::*;
use milepost_test_utils::assert_events;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    vec, Event as _, IntoVal, Symbol,
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
fn the_steward_can_change_the_rules_later() {
    // `configure` doubles as the update path: after the first call only the
    // steward signs, so `AlreadyConfigured` is never raised for them.
    let f = setup();
    let cap = CAP + 1;
    let period = PERIOD + 1;

    f.client
        .configure(&f.steward, &f.wallet, &f.token, &cap, &period);

    let p = f.client.get_policy(&f.wallet);
    assert_eq!(p.cap, cap);
    assert_eq!(p.period, period);
    assert_eq!(p.steward, f.steward);
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

#[test]
fn a_zero_transfer_is_rejected_without_changing_spend() {
    let f = setup();
    assert_denied(
        f.client.try_policy__(
            &f.wallet,
            &signer(&f),
            &transfer_context(&f, &f.wallet, &f.school, 0),
        ),
        SpendError::InvalidAmount,
    );
    assert_eq!(f.client.get_policy(&f.wallet).spent, 0);
}

#[test]
fn allowing_an_existing_payee_is_rejected_without_changing_state() {
    let f = setup();
    assert_eq!(
        f.client.try_allow_payee(&f.steward, &f.wallet, &f.school),
        Err(Ok(SpendError::AlreadyPayee))
    );
    assert!(f.client.is_payee(&f.wallet, &f.school));
}

#[test]
fn denying_a_missing_payee_is_rejected_without_changing_state() {
    let f = setup();
    let missing = Address::generate(&f.env);
    assert_eq!(
        f.client.try_deny_payee(&f.steward, &f.wallet, &missing),
        Err(Ok(SpendError::NotPayee))
    );
    assert!(!f.client.is_payee(&f.wallet, &missing));
    assert!(f.client.is_payee(&f.wallet, &f.school));
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

// ---- events ----
//
// The allowlist is not readable off-chain in full — there is no "list every
// payee for this wallet" call, by design — so these events are how a recipient
// audits what their wallet's signer is actually allowed to do.

#[test]
fn configuring_publishes_the_rules_the_recipient_consented_to() {
    let f = setup();
    let other_wallet = Address::generate(&f.env);

    f.client
        .configure(&f.steward, &other_wallet, &f.token, &CAP, &PERIOD);

    let policy = Policy {
        steward: f.steward.clone(),
        token: f.token.clone(),
        cap: CAP,
        period: PERIOD,
        spent: 0,
        window_start: f.env.ledger().timestamp(),
    };
    assert_events(
        &f.env,
        &f.client.address,
        &[Configured {
            wallet: other_wallet,
            policy,
        }
        .to_xdr(&f.env, &f.client.address)],
    );
}

#[test]
fn allowing_and_denying_a_payee_both_publish() {
    let f = setup();
    let shop = Address::generate(&f.env);

    f.client.allow_payee(&f.steward, &f.wallet, &shop);
    assert_events(
        &f.env,
        &f.client.address,
        &[PayeeChanged {
            wallet: f.wallet.clone(),
            payee: shop.clone(),
            allowed: true,
        }
        .to_xdr(&f.env, &f.client.address)],
    );

    f.client.deny_payee(&f.steward, &f.wallet, &shop);
    assert_events(
        &f.env,
        &f.client.address,
        &[PayeeChanged {
            wallet: f.wallet.clone(),
            payee: shop,
            allowed: false,
        }
        .to_xdr(&f.env, &f.client.address)],
    );
}

#[test]
fn approving_a_transfer_publishes_what_is_left_of_the_cap() {
    // A consumer watching a grant-funded wallet needs the running total, not
    // just the fact that one transfer was allowed.
    let f = setup();
    f.client.policy__(
        &f.wallet,
        &signer(&f),
        &transfer_context(&f, &f.wallet, &f.school, 400),
    );

    assert_events(
        &f.env,
        &f.client.address,
        &[Spent {
            wallet: f.wallet.clone(),
            payee: f.school.clone(),
            amount: 400,
            remaining: 600,
        }
        .to_xdr(&f.env, &f.client.address)],
    );
}

#[test]
fn a_rejected_transfer_publishes_nothing() {
    // A `Spent` event for a transfer that was then rejected would overstate what
    // the wallet actually did.
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

    assert_events(&f.env, &f.client.address, &[]);
}

// ---- TTL policy (#674) ----

#[test]
fn configure_bumps_policy_ttl() {
    use soroban_sdk::testutils::storage::Persistent as _;

    let f = setup();
    let ttl = |key: &Key| {
        f.env.as_contract(&f.client.address, || {
            f.env.storage().persistent().get_ttl(key)
        })
    };

    assert!(ttl(&Key::Policy(f.wallet.clone())) >= BUMP_LEDGERS - 1);

    // Advance past the 60-day bump threshold (90 - 40 = 50 days remaining).
    f.env
        .ledger()
        .with_mut(|l| l.sequence_number += 40 * DAY_IN_LEDGERS);
    assert!(ttl(&Key::Policy(f.wallet.clone())) < BUMP_THRESHOLD);

    // Re-configuring as steward pushes the policy TTL back out.
    f.client
        .configure(&f.steward, &f.wallet, &f.token, &(CAP * 2), &PERIOD);
    assert!(ttl(&Key::Policy(f.wallet)) >= BUMP_LEDGERS - 1);
}

#[test]
fn allow_and_deny_payee_manage_payee_ttl() {
    use soroban_sdk::testutils::storage::Persistent as _;

    let f = setup();
    let ttl = |key: &Key| {
        f.env.as_contract(&f.client.address, || {
            f.env.storage().persistent().get_ttl(key)
        })
    };

    assert!(ttl(&Key::Payee(f.wallet.clone(), f.school.clone())) >= BUMP_LEDGERS - 1);

    f.env
        .ledger()
        .with_mut(|l| l.sequence_number += 40 * DAY_IN_LEDGERS);
    assert!(ttl(&Key::Policy(f.wallet.clone())) < BUMP_THRESHOLD);

    // Adding a new payee bumps that payee's entry; Policy itself is not bumped here.
    let shop = Address::generate(&f.env);
    f.client.allow_payee(&f.steward, &f.wallet, &shop);
    assert!(ttl(&Key::Payee(f.wallet.clone(), shop.clone())) >= BUMP_LEDGERS - 1);
    assert!(ttl(&Key::Policy(f.wallet.clone())) < BUMP_THRESHOLD);

    // Denying removes the payee entry; re-allowing creates and bumps it anew.
    f.client.deny_payee(&f.steward, &f.wallet, &shop);
    assert!(!f.client.is_payee(&f.wallet, &shop));

    f.env
        .ledger()
        .with_mut(|l| l.sequence_number += 40 * DAY_IN_LEDGERS);
    f.client.allow_payee(&f.steward, &f.wallet, &shop);
    assert!(ttl(&Key::Payee(f.wallet, shop)) >= BUMP_LEDGERS - 1);
}

#[test]
fn install_bumps_installed_ttl() {
    use soroban_sdk::testutils::storage::Persistent as _;

    let f = setup();
    let ttl = |key: &Key| {
        f.env.as_contract(&f.client.address, || {
            f.env.storage().persistent().get_ttl(key)
        })
    };

    f.client.install(&f.wallet);
    assert!(ttl(&Key::Installed(f.wallet.clone())) >= BUMP_LEDGERS - 1);

    f.env
        .ledger()
        .with_mut(|l| l.sequence_number += 40 * DAY_IN_LEDGERS);
    assert!(ttl(&Key::Installed(f.wallet.clone())) < BUMP_THRESHOLD);

    f.client.install(&f.wallet);
    assert!(ttl(&Key::Installed(f.wallet)) >= BUMP_LEDGERS - 1);
}

#[test]
fn policy_check_bumps_policy_but_not_payee_or_installed() {
    use soroban_sdk::testutils::storage::Persistent as _;

    let f = setup();
    let ttl = |key: &Key| {
        f.env.as_contract(&f.client.address, || {
            f.env.storage().persistent().get_ttl(key)
        })
    };

    f.client.install(&f.wallet);

    f.env
        .ledger()
        .with_mut(|l| l.sequence_number += 40 * DAY_IN_LEDGERS);
    assert!(ttl(&Key::Policy(f.wallet.clone())) < BUMP_THRESHOLD);
    assert!(ttl(&Key::Payee(f.wallet.clone(), f.school.clone())) < BUMP_THRESHOLD);
    assert!(ttl(&Key::Installed(f.wallet.clone())) < BUMP_THRESHOLD);

    f.client.policy__(
        &f.wallet,
        &signer(&f),
        &transfer_context(&f, &f.wallet, &f.school, 100),
    );
    assert!(ttl(&Key::Policy(f.wallet.clone())) >= BUMP_LEDGERS - 1);
    assert!(ttl(&Key::Payee(f.wallet.clone(), f.school.clone())) < BUMP_THRESHOLD);
    assert!(ttl(&Key::Installed(f.wallet)) < BUMP_THRESHOLD);
}

// ---- worst-case cost against the network's per-transaction limits ----

/// A stand-in for a passkey-kit smart wallet, cut down to the one thing this
/// measurement needs: its `__check_auth` hands every authorisation context to
/// the policy signer, exactly as the real wallet does for a `Policy` signer.
/// The host then runs `policy__` as part of the wallet's own authorisation,
/// which is where it runs on mainnet, rather than as a free-standing call
/// with auth mocked away.
mod wallet {
    use crate::PolicySpendClient;
    use smart_wallet_interface::types::SignerKey;
    use soroban_sdk::{
        auth::{Context, CustomAccountInterface},
        contract, contractimpl, contracttype,
        crypto::Hash,
        Address, Env, Vec,
    };

    #[contracttype]
    enum Key {
        Policy,
    }

    #[contract]
    pub struct FakeWallet;

    #[contractimpl]
    impl FakeWallet {
        pub fn __constructor(env: Env, policy: Address) {
            env.storage().instance().set(&Key::Policy, &policy);
        }
    }

    #[contractimpl]
    impl CustomAccountInterface for FakeWallet {
        type Signature = ();
        type Error = soroban_sdk::Error;

        fn __check_auth(
            env: Env,
            _signature_payload: Hash<32>,
            _signature: (),
            auth_contexts: Vec<Context>,
        ) -> Result<(), soroban_sdk::Error> {
            let policy: Address = env.storage().instance().get(&Key::Policy).unwrap();
            PolicySpendClient::new(&env, &policy).policy__(
                &env.current_contract_address(),
                &SignerKey::Policy(policy.clone()),
                &auth_contexts,
            );
            Ok(())
        }
    }
}

/// Payees on the worst-case wallet's allowlist. Payees are stored one entry per
/// `(wallet, payee)`, so the length of the list does not enter `policy__`'s
/// footprint — the check is one keyed lookup whatever the length. The list is
/// filled anyway, and the transfer goes to the last payee added, so the figures
/// are for a wallet a steward has actually used.
const WORST_CASE_PAYEES: u32 = 64;

/// A token transfer out of `wallet`, signed for by `wallet` itself, so the
/// host calls the wallet's `__check_auth` rather than taking a mocked auth.
fn wallet_signed_transfer(
    env: &Env,
    token: &Address,
    wallet: &Address,
    to: &Address,
    amount: i128,
    nonce: i64,
) -> soroban_sdk::xdr::SorobanAuthorizationEntry {
    extern crate std;
    use soroban_sdk::xdr::{
        InvokeContractArgs, ScAddress, ScSymbol, ScVal, SorobanAddressCredentials,
        SorobanAuthorizationEntry, SorobanAuthorizedFunction, SorobanAuthorizedInvocation,
        SorobanCredentials,
    };

    let args: std::vec::Vec<ScVal> = std::vec![wallet.into(), to.into(), ScVal::from(amount),];
    SorobanAuthorizationEntry {
        credentials: SorobanCredentials::Address(SorobanAddressCredentials {
            address: ScAddress::from(wallet),
            nonce,
            signature_expiration_ledger: env.ledger().sequence() + 100,
            signature: ScVal::Void,
        }),
        root_invocation: SorobanAuthorizedInvocation {
            function: SorobanAuthorizedFunction::ContractFn(InvokeContractArgs {
                contract_address: ScAddress::from(token),
                function_name: ScSymbol("transfer".try_into().unwrap()),
                args: args.try_into().unwrap(),
            }),
            sub_invocations: std::vec![].try_into().unwrap(),
        },
    }
}

/// Worst case for `policy__`, the check that runs inside every `Restricted`
/// payment's authorisation:
///
/// - **Inside a smart wallet's auth.** The wallet is a custom account whose
///   `__check_auth` calls `policy__`, and the measured call is a real token
///   `transfer` out of it under `set_auths`, so the figures include the
///   transfer, the wallet's check, and the policy check inside it — what the
///   network bills a recipient's payment for.
/// - **A full payee list**, [`WORST_CASE_PAYEES`] long, paying the last one.
/// - **A transfer at the cap**, so the cap comparison is at its boundary.
/// - **A lapsed window** with an earlier spend in it, so `policy__` takes the
///   reset branch as well as recording the new spend and bumping the policy
///   entry's TTL — every write it can make.
///
/// Run with `--nocapture` to see the measured figures.
#[test]
fn policy_check_worst_case_stays_within_network_limits() {
    use soroban_sdk::token::{StellarAssetClient, TokenClient};

    let env = milepost_test_utils::new_test_env();
    let policy_id = env.register(PolicySpend, ());
    let policy = PolicySpendClient::new(&env, &policy_id);
    let wallet = env.register(wallet::FakeWallet, (policy_id.clone(),));
    let steward = Address::generate(&env);
    let token = milepost_test_utils::register_token(&env);

    policy.configure(&steward, &wallet, &token, &CAP, &PERIOD);
    let mut payee = Address::generate(&env);
    for _ in 0..WORST_CASE_PAYEES {
        payee = Address::generate(&env);
        policy.allow_payee(&steward, &wallet, &payee);
    }
    policy.install(&wallet);
    StellarAssetClient::new(&env, &token).mint(&wallet, &(CAP * 2));

    // Spend part of the first window, then let it lapse.
    policy.policy__(
        &wallet,
        &SignerKey::Policy(policy_id.clone()),
        &vec![
            &env,
            Context::Contract(ContractContext {
                contract: token.clone(),
                fn_name: Symbol::new(&env, "transfer"),
                args: vec![
                    &env,
                    wallet.into_val(&env),
                    payee.into_val(&env),
                    400i128.into_val(&env),
                ],
            }),
        ],
    );
    assert_eq!(policy.get_policy(&wallet).spent, 400);
    env.ledger().set_timestamp(PERIOD + 1);

    // From here on, auth is real: the wallet must approve the transfer through
    // its own `__check_auth`, which defers to the policy.
    env.set_auths(&[wallet_signed_transfer(
        &env, &token, &wallet, &payee, CAP, 1,
    )]);
    env.cost_estimate().disable_resource_limits();
    env.cost_estimate().budget().reset_unlimited();
    TokenClient::new(&env, &token).transfer(&wallet, &payee, &CAP);
    milepost_test_utils::assert_within_network_limits!(
        "policy__ (inside wallet auth, 64 payees, transfer at cap, lapsed window)",
        env
    );

    // The policy really ran inside that authorisation: the window was reset and
    // the whole cap is now spent.
    assert_eq!(TokenClient::new(&env, &token).balance(&payee), CAP);
    let after = policy.get_policy(&wallet);
    assert_eq!(after.spent, CAP);
    assert_eq!(after.window_start, PERIOD + 1);

    // And it is what decides. One more stroop through the same path is
    // refused; the identical transfer goes through once the window lapses, so
    // the refusal was the cap and not the way the authorisation was built.
    let token_client = TokenClient::new(&env, &token);
    env.set_auths(&[wallet_signed_transfer(&env, &token, &wallet, &payee, 1, 2)]);
    assert!(token_client.try_transfer(&wallet, &payee, &1).is_err());
    assert_eq!(policy.get_policy(&wallet).spent, CAP);

    env.ledger().set_timestamp(2 * PERIOD + 2);
    env.set_auths(&[wallet_signed_transfer(&env, &token, &wallet, &payee, 1, 3)]);
    token_client.transfer(&wallet, &payee, &1);
    assert_eq!(policy.get_policy(&wallet).spent, 1);
    assert_eq!(token_client.balance(&payee), CAP + 1);
}
