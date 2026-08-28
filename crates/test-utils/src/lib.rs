#![no_std]

//! # Shared dev-only test utilities
//!
//! Each contract's test suite used to build its own environment, registers its
//! own token and declares its own copy of the deadline schedule and the
//! `hash` helper. The duplication grew until a config change meant editing
//! several near-identical fixtures, which is how test suites start diverging.
//!
//! This crate is the single home for that shared, **dev-only** setup. It is
//! deliberately `lib`-only (no `cdylib`) and only ever a dev-dependency, so
//! nothing here reaches a deployed wasm — the same reasoning as `milepost-types`,
//! which lets several contracts depend on a no-export crate without colliding
//! at link time.
//!
//! Suites keep their own `setup`, `Fixture` and contract-specific arrangement;
//! this crate only takes over the pieces that are byte-for-byte the same
//! everywhere.

use soroban_sdk::{BytesN, Env};

/// The canonical schedule every programme-facing suite runs against. One edit
/// here replaces the near-identical copies that used to sit in each test file.
pub mod schedule {
    pub const APPLY_DEADLINE: u64 = 10_000;
    pub const REVIEW_DEADLINE: u64 = 20_000;
    pub const RELEASE_DEADLINE: u64 = 30_000;
    pub const SWEEP_DEADLINE: u64 = 40_000;
    /// The protocol's cut, in basis points (10%).
    pub const FEE_BPS: u32 = 1_000;
    /// The pivot byte for the `metadata_hash` every fixture registers.
    pub const METADATA_HASH_BYTE: u8 = 7;
}

/// A fresh environment with all authentication mocked. Most suites start with
/// exactly this.
#[cfg(feature = "testutils")]
pub fn new_test_env() -> Env {
    let env = Env::default();
    env.mock_all_auths();
    env
}

/// A deterministic 32-byte value for a hash that only needs to be distinct
/// between call sites (`hash(env, n)` differs for different `n`).
pub fn hash(env: &Env, byte: u8) -> BytesN<32> {
    BytesN::from_array(env, &[byte; 32])
}

/// Register a Stellar asset against a fresh issuer and return the asset's
/// address, as the suites that move tokens all do.
#[cfg(feature = "testutils")]
pub fn register_token(env: &Env) -> soroban_sdk::Address {
    use soroban_sdk::testutils::Address as _;

    let issuer = soroban_sdk::Address::generate(env);
    env.register_stellar_asset_contract_v2(issuer).address()
}
