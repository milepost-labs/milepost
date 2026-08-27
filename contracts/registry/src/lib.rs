#![no_std]
// Contract constructors legitimately take many parameters, and the SDK's
// generated clients mirror those signatures.
#![allow(clippy::too_many_arguments)]

//! # Registry
//!
//! Deploys programmes and holds the protocol-wide configuration they are built
//! from — treasury, fee, and the addresses of the attestation registry and the
//! standing contract.
//!
//! ## Why deployment goes through here
//!
//! A programme credits recipient standing, and standing is only worth anything
//! if it cannot be manufactured. The registry is the admin of the `record`
//! contract, so a programme becomes an authorised writer *because the registry
//! deployed it* — never by asking. That is the whole trust chain: registry
//! deploys the code it knows, and vouches only for that.
//!
//! It follows that a programme deployed some other way can take contributions
//! and make awards perfectly well, but cannot write standing. That is the
//! intended failure mode rather than a gap.

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype, Address,
    BytesN, Env, String, Vec,
};

/// The programme configuration this registry constructs.
///
/// Shared with the programme itself rather than mirrored. A mirrored struct
/// drifts silently — the failure is not a compile error but a value decoded
/// into the wrong shape at runtime, after a call has already moved money.
/// Sharing it turns that into a build failure at the point of change.
pub use milepost_types::ProgrammeConfig;

/// The slice of the standing contract this registry needs.
///
/// Declared rather than imported on purpose. Depending on the `record` crate
/// directly would compile its contract into this wasm as well, and the two
/// export overlapping symbols — `set_admin` among them — so the module fails to
/// link. A client generated from an interface carries no implementation, so
/// nothing is exported twice.
#[contractclient(name = "StandingClient")]
pub trait Standing {
    fn add_writer(env: Env, writer: Address);
}

const DAY_IN_LEDGERS: u32 = 17_280;
const BUMP_LEDGERS: u32 = 90 * DAY_IN_LEDGERS;
const BUMP_THRESHOLD: u32 = 60 * DAY_IN_LEDGERS;

/// Mirrors the programme's own ceiling so a misconfigured registry cannot even
/// attempt to deploy something the programme would reject.
pub const MAX_FEE_BPS: u32 = 1_000;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotAuthorized = 1,
    FeeTooHigh = 2,
    NotInitialized = 3,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub admin: Address,
    pub treasury: Address,
    /// Attestation registry that programmes verify tranche conditions against.
    pub attest: Address,
    /// Standing contract that programmes credit on release.
    pub record: Address,
    /// Spend policy programmes consult before paying a `Restricted` tranche.
    pub policy: Address,
    pub fee_bps: u32,
    /// Hash of the uploaded programme wasm that `create` instantiates.
    pub program_wasm: BytesN<32>,
}

#[contractevent(topics = ["created"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProgrammeCreated {
    #[topic]
    pub programme: Address,
    #[topic]
    pub creator: Address,
    pub name: String,
}

#[contractevent(topics = ["config"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ConfigChanged {
    pub config: Config,
}

#[contracttype]
#[derive(Clone)]
enum Key {
    Config,
    /// Incremented per deployment so two programmes from the same creator in the
    /// same ledger get distinct addresses.
    Nonce,
    Programme(Address),
}

#[contract]
pub struct Registry;

#[contractimpl]
impl Registry {
    pub fn __constructor(
        env: Env,
        admin: Address,
        treasury: Address,
        attest: Address,
        record: Address,
        policy: Address,
        fee_bps: u32,
        program_wasm: BytesN<32>,
    ) -> Result<(), Error> {
        if fee_bps > MAX_FEE_BPS {
            return Err(Error::FeeTooHigh);
        }
        let config = Config {
            admin,
            treasury,
            attest,
            record,
            policy,
            fee_bps,
            program_wasm,
        };
        env.storage().instance().set(&Key::Config, &config);
        ConfigChanged { config }.publish(&env);
        Ok(())
    }

    /// Deploy a programme and authorise it to write standing.
    ///
    /// Treasury and fee come from protocol configuration rather than from the
    /// caller, so a creator cannot deploy a programme that pays a fee to
    /// themselves or skips it entirely.
    pub fn create(
        env: Env,
        creator: Address,
        token: Address,
        schema: BytesN<32>,
        apply_deadline: u64,
        review_deadline: u64,
        release_deadline: u64,
        sweep_deadline: u64,
        quorum: u32,
        tranches: u32,
        metadata_hash: BytesN<32>,
        reviewers: Vec<Address>,
        verifiers: Vec<Address>,
        name: String,
    ) -> Result<Address, Error> {
        creator.require_auth();
        let config = Self::config(&env)?;

        let nonce: u64 = env.storage().instance().get(&Key::Nonce).unwrap_or(0);
        env.storage().instance().set(&Key::Nonce, &(nonce + 1));
        let salt = env
            .crypto()
            .sha256(&soroban_sdk::Bytes::from_array(&env, &nonce.to_be_bytes()));

        let programme = env
            .deployer()
            .with_current_contract(salt.to_bytes())
            .deploy_v2(
                config.program_wasm.clone(),
                (
                    ProgrammeConfig {
                        creator: creator.clone(),
                        token,
                        treasury: config.treasury.clone(),
                        attest: config.attest.clone(),
                        record: config.record.clone(),
                        policy: config.policy.clone(),
                        schema,
                        fee_bps: config.fee_bps,
                        apply_deadline,
                        review_deadline,
                        release_deadline,
                        sweep_deadline,
                        quorum,
                        tranches,
                        metadata_hash,
                    },
                    reviewers,
                    verifiers,
                ),
            );

        // The programme can credit standing because the registry deployed it.
        StandingClient::new(&env, &config.record).add_writer(&programme);

        let key = Key::Programme(programme.clone());
        env.storage().persistent().set(&key, &true);
        env.storage()
            .persistent()
            .extend_ttl(&key, BUMP_THRESHOLD, BUMP_LEDGERS);

        ProgrammeCreated {
            programme: programme.clone(),
            creator,
            name,
        }
        .publish(&env);
        Ok(programme)
    }

    /// Point at a new programme wasm. Only affects programmes deployed after the
    /// change — existing ones keep running the code they were deployed with,
    /// which is the point of deploying rather than proxying.
    pub fn set_program_wasm(env: Env, wasm: BytesN<32>) -> Result<(), Error> {
        let mut config = Self::admin_config(&env)?;
        config.program_wasm = wasm;
        Self::save(&env, config);
        Ok(())
    }

    pub fn set_fee(env: Env, fee_bps: u32) -> Result<(), Error> {
        if fee_bps > MAX_FEE_BPS {
            return Err(Error::FeeTooHigh);
        }
        let mut config = Self::admin_config(&env)?;
        config.fee_bps = fee_bps;
        Self::save(&env, config);
        Ok(())
    }

    pub fn set_policy(env: Env, policy: Address) -> Result<(), Error> {
        let mut config = Self::admin_config(&env)?;
        config.policy = policy;
        Self::save(&env, config);
        Ok(())
    }

    pub fn set_treasury(env: Env, treasury: Address) -> Result<(), Error> {
        let mut config = Self::admin_config(&env)?;
        config.treasury = treasury;
        Self::save(&env, config);
        Ok(())
    }

    pub fn set_admin(env: Env, admin: Address) -> Result<(), Error> {
        let mut config = Self::admin_config(&env)?;
        config.admin = admin;
        Self::save(&env, config);
        Ok(())
    }

    pub fn get_config(env: Env) -> Result<Config, Error> {
        Self::config(&env)
    }

    /// Whether this address is a programme the registry deployed. Anything else
    /// claiming to be one is not vouched for.
    pub fn is_programme(env: Env, addr: Address) -> bool {
        env.storage().persistent().has(&Key::Programme(addr))
    }

    /// The current deployment nonce. One higher than the nonce used by the last
    /// `create` call — i.e. the nonce the *next* deployment will use.
    pub fn nonce(env: Env) -> u64 {
        env.storage().instance().get(&Key::Nonce).unwrap_or(0)
    }

    /// Derive the address a programme *would* have if deployed at the given
    /// nonce, using the same salt scheme as `create`. A client can walk the
    /// range `[0, nonce)` without the contract storing a list.
    pub fn programme_address(env: Env, n: u64) -> Address {
        let salt = env
            .crypto()
            .sha256(&soroban_sdk::Bytes::from_array(&env, &n.to_be_bytes()));
        env.deployer()
            .with_current_contract(salt.to_bytes())
            .deployed_address()
    }

    fn config(env: &Env) -> Result<Config, Error> {
        env.storage()
            .instance()
            .get(&Key::Config)
            .ok_or(Error::NotInitialized)
    }

    fn admin_config(env: &Env) -> Result<Config, Error> {
        let config = Self::config(env)?;
        config.admin.require_auth();
        Ok(config)
    }

    fn save(env: &Env, config: Config) {
        env.storage().instance().set(&Key::Config, &config);
        ConfigChanged { config }.publish(env);
    }
}

#[cfg(test)]
mod test;
