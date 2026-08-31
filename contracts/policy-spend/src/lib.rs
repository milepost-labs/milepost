#![no_std]

//! # Restricted-spend policy
//!
//! A policy signer for Stellar smart wallets. It lets a recipient hold and
//! control their own wallet while limiting what a grant-funded signer may
//! authorise: transfers of one asset, to payees a steward has verified, within
//! a spending cap.
//!
//! This is the piece that makes `Mode::Restricted` tranches meaningful. Paying
//! a school directly is accountable but paternalistic — the recipient never
//! touches the money and cannot choose between two equally valid bookshops.
//! Paying them with no restriction is dignified but unaccountable. A policy
//! signer is the middle: their wallet, their key, their choice among verified
//! payees, and no route to a casino.
//!
//! ## Why the wallet cannot edit its own allowlist
//!
//! The recipient controls the wallet. If the wallet could add payees, it would
//! add its own address and the restriction would mean nothing. So the allowlist
//! belongs to a **steward** — the programme, or an operator it names — and the
//! wallet's only say is the one that matters: it must consent, once, when the
//! policy is first configured. After that the recipient can spend freely inside
//! the rules and cannot unilaterally loosen them.
//!
//! ## What this does not do
//!
//! A policy constrains *one signer*. It is not a lock on the wallet. If the
//! recipient also holds an unrestricted admin signer on the same wallet, they
//! can authorise around the policy or remove it outright, and nothing here
//! prevents that — the smart wallet's own signer limits are what must confine
//! the funded signer to this policy. Deployments that skip that step get the
//! appearance of restriction rather than the fact of it.

use smart_wallet_interface::{types::SignerKey, PolicyInterface};
use soroban_sdk::{
    auth::{Context, ContractContext},
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, Address,
    Env, Symbol, TryIntoVal, Vec,
};

const DAY_IN_LEDGERS: u32 = 17_280;
const BUMP_LEDGERS: u32 = 90 * DAY_IN_LEDGERS;
const BUMP_THRESHOLD: u32 = 60 * DAY_IN_LEDGERS;

/// Named `SpendError` rather than `Error` on purpose: the smart wallet
/// interface exports its own `Error`, and two spec entries under one name make
/// the contract's generated bindings ambiguous about which is which.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum SpendError {
    NotConfigured = 1,
    AlreadyConfigured = 2,
    NotSteward = 3,
    /// The signer tried to authorise something other than a token transfer.
    ForbiddenCall = 4,
    /// The transfer's destination is not a verified payee.
    PayeeNotAllowed = 5,
    /// The transfer would exceed the cap for the current period.
    CapExceeded = 6,
    /// The transfer moves someone else's funds, or a different asset.
    ForbiddenTransfer = 7,
    InvalidAmount = 8,
    InvalidCap = 9,
    AlreadyPayee = 10,
    NotPayee = 11,
}

/// Per-wallet rules. One policy contract serves many wallets.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Policy {
    /// Who may edit the allowlist. Deliberately not the wallet.
    pub steward: Address,
    /// The only asset this signer may move.
    pub token: Address,
    /// Most that may be spent within one period.
    pub cap: i128,
    /// Length of the spending window, in seconds.
    pub period: u64,
    /// Spent so far in the window that began at `window_start`.
    pub spent: i128,
    pub window_start: u64,
}

#[contractevent(topics = ["configd"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Configured {
    #[topic]
    pub wallet: Address,
    pub policy: Policy,
}

#[contractevent(topics = ["payee"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PayeeChanged {
    #[topic]
    pub wallet: Address,
    #[topic]
    pub payee: Address,
    pub allowed: bool,
}

#[contractevent(topics = ["spent"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Spent {
    #[topic]
    pub wallet: Address,
    #[topic]
    pub payee: Address,
    pub amount: i128,
    pub remaining: i128,
}

#[contracttype]
#[derive(Clone)]
enum Key {
    Policy(Address),
    /// One entry per (wallet, payee) rather than a list inside the policy, so
    /// an allowlist can grow without the policy entry growing with it.
    Payee(Address, Address),
    Installed(Address),
}

#[contract]
pub struct PolicySpend;

#[contractimpl]
impl PolicySpend {
    /// Set the rules for a wallet.
    ///
    /// The first call needs **both** signatures: the steward's, and the
    /// wallet's. That consent is the whole basis for the arrangement being
    /// legitimate rather than imposed — the recipient agrees to the constraint
    /// before any money arrives. Later changes need only the steward, so the
    /// recipient cannot quietly raise their own cap.
    pub fn configure(
        env: Env,
        steward: Address,
        wallet: Address,
        token: Address,
        cap: i128,
        period: u64,
    ) -> Result<(), SpendError> {
        steward.require_auth();
        if cap <= 0 || period == 0 {
            return Err(SpendError::InvalidCap);
        }

        let key = Key::Policy(wallet.clone());
        match env.storage().persistent().get::<_, Policy>(&key) {
            Some(existing) => {
                if existing.steward != steward {
                    return Err(SpendError::NotSteward);
                }
            }
            None => wallet.require_auth(),
        }

        let policy = Policy {
            steward,
            token,
            cap,
            period,
            spent: 0,
            window_start: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&key, &policy);
        env.storage()
            .persistent()
            .extend_ttl(&key, BUMP_THRESHOLD, BUMP_LEDGERS);

        Configured { wallet, policy }.publish(&env);
        Ok(())
    }

    pub fn allow_payee(
        env: Env,
        steward: Address,
        wallet: Address,
        payee: Address,
    ) -> Result<(), SpendError> {
        Self::require_steward(&env, &steward, &wallet)?;

        let key = Key::Payee(wallet.clone(), payee.clone());
        if env.storage().persistent().has(&key) {
            return Err(SpendError::AlreadyPayee);
        }
        env.storage().persistent().set(&key, &true);
        env.storage()
            .persistent()
            .extend_ttl(&key, BUMP_THRESHOLD, BUMP_LEDGERS);

        PayeeChanged {
            wallet,
            payee,
            allowed: true,
        }
        .publish(&env);
        Ok(())
    }

    pub fn deny_payee(
        env: Env,
        steward: Address,
        wallet: Address,
        payee: Address,
    ) -> Result<(), SpendError> {
        Self::require_steward(&env, &steward, &wallet)?;

        let key = Key::Payee(wallet.clone(), payee.clone());
        if !env.storage().persistent().has(&key) {
            return Err(SpendError::NotPayee);
        }
        env.storage().persistent().remove(&key);

        PayeeChanged {
            wallet,
            payee,
            allowed: false,
        }
        .publish(&env);
        Ok(())
    }

    pub fn get_policy(env: Env, wallet: Address) -> Result<Policy, SpendError> {
        env.storage()
            .persistent()
            .get(&Key::Policy(wallet))
            .ok_or(SpendError::NotConfigured)
    }

    pub fn is_payee(env: Env, wallet: Address, payee: Address) -> bool {
        env.storage().persistent().has(&Key::Payee(wallet, payee))
    }

    pub fn is_installed(env: Env, wallet: Address) -> bool {
        env.storage().persistent().has(&Key::Installed(wallet))
    }

    /// How much this wallet may still spend in the current window.
    pub fn remaining(env: Env, wallet: Address) -> Result<i128, SpendError> {
        let policy = Self::get_policy(env.clone(), wallet)?;
        Ok(if Self::window_elapsed(&env, &policy) {
            policy.cap
        } else {
            policy.cap - policy.spent
        })
    }

    fn require_steward(env: &Env, steward: &Address, wallet: &Address) -> Result<(), SpendError> {
        steward.require_auth();
        let policy: Policy = env
            .storage()
            .persistent()
            .get(&Key::Policy(wallet.clone()))
            .ok_or(SpendError::NotConfigured)?;
        if &policy.steward != steward {
            return Err(SpendError::NotSteward);
        }
        Ok(())
    }

    fn window_elapsed(env: &Env, policy: &Policy) -> bool {
        env.ledger().timestamp().saturating_sub(policy.window_start) >= policy.period
    }
}

#[contractimpl]
impl PolicyInterface for PolicySpend {
    /// Approve or reject everything this signer is trying to authorise.
    ///
    /// Returning normally approves; panicking rejects. Every context in the
    /// transaction is checked, so a caller cannot smuggle a forbidden call
    /// through by bundling it with a permitted one.
    fn policy__(env: Env, source: Address, _signer: SignerKey, contexts: Vec<Context>) {
        source.require_auth();

        let key = Key::Policy(source.clone());
        let mut policy: Policy = match env.storage().persistent().get(&key) {
            Some(p) => p,
            None => panic_with_error!(&env, SpendError::NotConfigured),
        };

        // A lapsed window resets the allowance before anything is counted
        // against it, so a spend spanning a boundary is not charged twice.
        if Self::window_elapsed(&env, &policy) {
            policy.spent = 0;
            policy.window_start = env.ledger().timestamp();
        }

        for context in contexts.iter() {
            let ContractContext {
                contract,
                fn_name,
                args,
            } = match context {
                Context::Contract(c) => c,
                // Creating a contract is not spending, but it is also not
                // something a grant-funded signer has any business doing.
                Context::CreateContractHostFn(_) | Context::CreateContractWithCtorHostFn(_) => {
                    panic_with_error!(&env, SpendError::ForbiddenCall)
                }
            };

            if contract != policy.token || fn_name != Symbol::new(&env, "transfer") {
                panic_with_error!(&env, SpendError::ForbiddenCall);
            }

            // `transfer(from, to, amount)`.
            let from: Address = args.get(0).unwrap().try_into_val(&env).unwrap();
            let to: Address = args.get(1).unwrap().try_into_val(&env).unwrap();
            let amount: i128 = args.get(2).unwrap().try_into_val(&env).unwrap();

            if from != source {
                panic_with_error!(&env, SpendError::ForbiddenTransfer);
            }
            if amount <= 0 {
                panic_with_error!(&env, SpendError::InvalidAmount);
            }
            if !env
                .storage()
                .persistent()
                .has(&Key::Payee(source.clone(), to.clone()))
            {
                panic_with_error!(&env, SpendError::PayeeNotAllowed);
            }

            policy.spent += amount;
            if policy.spent > policy.cap {
                panic_with_error!(&env, SpendError::CapExceeded);
            }

            Spent {
                wallet: source.clone(),
                payee: to,
                amount,
                remaining: policy.cap - policy.spent,
            }
            .publish(&env);
        }

        env.storage().persistent().set(&key, &policy);
        env.storage()
            .persistent()
            .extend_ttl(&key, BUMP_THRESHOLD, BUMP_LEDGERS);
    }

    /// Called by the wallet as it adds this policy as a signer.
    fn install(env: Env, wallet: Address) {
        wallet.require_auth();
        let key = Key::Installed(wallet);
        env.storage().persistent().set(&key, &true);
        env.storage()
            .persistent()
            .extend_ttl(&key, BUMP_THRESHOLD, BUMP_LEDGERS);
    }

    /// Permissionless cleanup once the policy is no longer a signer.
    ///
    /// The spend record is deliberately left behind. Clearing it would let a
    /// wallet reset its own window by removing and re-adding the policy.
    fn uninstall(env: Env, wallet: Address) {
        env.storage().persistent().remove(&Key::Installed(wallet));
    }
}

#[cfg(test)]
mod test;
