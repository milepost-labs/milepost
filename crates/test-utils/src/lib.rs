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

/// Assert that `contract` published exactly `expected` events.
///
/// Two details of the SDK make this helper necessary rather than nice to have:
///
/// - The event buffer holds the events of the **most recent top-level call** and
///   every call nested inside it, so a programme that transfers a token and
///   credits standing emits those contracts' events too. Filtering by contract
///   id is what keeps a suite asserting on the contract it is testing.
/// - Any later call empties the buffer, **including a getter**, so a suite has to
///   assert straight after the call under test rather than after reading the
///   state it just wrote.
///
/// `expected` is compared exactly — order, count and every field — because a
/// consumer reading these events is entitled to the fields the contract says it
/// publishes, and an event carrying a placeholder is worse than no event.
#[cfg(feature = "testutils")]
pub fn assert_events(
    env: &Env,
    contract: &soroban_sdk::Address,
    expected: &[soroban_sdk::xdr::ContractEvent],
) {
    use soroban_sdk::testutils::Events as _;

    let published = env.events().all().filter_by_contract(contract);
    assert_eq!(published, expected);
}

/// The network's per-transaction resource limits, and the headroom the cost
/// tests demand under them.
///
/// Every worst-case cost test asserts against these figures and nowhere else,
/// so when validators vote new limits there is one place to update.
///
/// - Source: <https://lab.stellar.org/network-limits>, or
///   `stellar network settings --network mainnet`.
/// - Read on: 2026-07-10. This is the date of the Mainnet snapshot the
///   soroban-sdk 27.0.6 test environment itself enforces
///   (`InvocationResourceLimits::mainnet()`); re-read the source above and bump
///   the date whenever a figure changes.
pub mod network_limits {
    /// URL the figures below were read from.
    pub const SOURCE: &str = "https://lab.stellar.org/network-limits";
    /// Date the figures below were read.
    pub const READ_ON: &str = "2026-07-10";

    /// Modelled CPU instructions per transaction.
    pub const INSTRUCTIONS: i64 = 400_000_000;
    /// Modelled memory per transaction, in bytes.
    pub const MEM_BYTES: i64 = 41_943_040;
    /// Ledger entries read from disk per transaction.
    pub const DISK_READ_ENTRIES: u32 = 200;
    /// Ledger entries written per transaction.
    pub const WRITE_ENTRIES: u32 = 200;
    /// Ledger entries in the footprint (read + written) per transaction.
    pub const LEDGER_ENTRIES: u32 = 400;
    /// Bytes read from disk per transaction.
    pub const DISK_READ_BYTES: u32 = 200_000;
    /// Bytes written to the ledger per transaction.
    pub const WRITE_BYTES: u32 = 132_096;
    /// Contract event bytes per transaction.
    pub const CONTRACT_EVENTS_SIZE_BYTES: u32 = 16_384;

    /// A worst-case test must stay under this share of every limit, so there is
    /// room for the limits to tighten before a real transaction fails.
    pub const HEADROOM_PERCENT: u64 = 80;
}

/// What one invocation used, as plain numbers.
///
/// The SDK does not re-export the type `env.cost_estimate().resources()`
/// returns, so [`assert_within_network_limits!`] copies the fields into this.
#[cfg(feature = "testutils")]
#[derive(Clone, Copy, Debug)]
pub struct Measured {
    pub instructions: i64,
    pub mem_bytes: i64,
    pub disk_read_entries: u32,
    pub memory_read_entries: u32,
    pub write_entries: u32,
    pub disk_read_bytes: u32,
    pub write_bytes: u32,
    pub contract_events_size_bytes: u32,
}

/// Print what the last invocation on `$env` used, then assert every resource is
/// under [`network_limits::HEADROOM_PERCENT`] of its limit.
///
/// Call straight after the invocation under test: the environment only keeps
/// the resources of the *last* top-level call. Run with `--nocapture` to see
/// the table.
#[cfg(feature = "testutils")]
#[macro_export]
macro_rules! assert_within_network_limits {
    ($label:expr, $env:expr) => {{
        let r = $env.cost_estimate().resources();
        $crate::check_network_limits(
            $label,
            &$crate::Measured {
                instructions: r.instructions,
                mem_bytes: r.mem_bytes,
                disk_read_entries: r.disk_read_entries,
                memory_read_entries: r.memory_read_entries,
                write_entries: r.write_entries,
                disk_read_bytes: r.disk_read_bytes,
                write_bytes: r.write_bytes,
                contract_events_size_bytes: r.contract_events_size_bytes,
            },
        )
    }};
}

/// Backs [`assert_within_network_limits!`]; call the macro instead.
#[cfg(feature = "testutils")]
pub fn check_network_limits(label: &str, resources: &Measured) {
    use network_limits::*;

    extern crate std;
    use std::println;

    let ledger_entries =
        resources.disk_read_entries + resources.memory_read_entries + resources.write_entries;
    let rows: [(&str, u64, u64); 8] = [
        (
            "instructions",
            resources.instructions as u64,
            INSTRUCTIONS as u64,
        ),
        ("memory bytes", resources.mem_bytes as u64, MEM_BYTES as u64),
        (
            "disk read entries",
            resources.disk_read_entries as u64,
            DISK_READ_ENTRIES as u64,
        ),
        (
            "write entries",
            resources.write_entries as u64,
            WRITE_ENTRIES as u64,
        ),
        (
            "ledger entries",
            ledger_entries as u64,
            LEDGER_ENTRIES as u64,
        ),
        (
            "disk read bytes",
            resources.disk_read_bytes as u64,
            DISK_READ_BYTES as u64,
        ),
        (
            "write bytes",
            resources.write_bytes as u64,
            WRITE_BYTES as u64,
        ),
        (
            "event bytes",
            resources.contract_events_size_bytes as u64,
            CONTRACT_EVENTS_SIZE_BYTES as u64,
        ),
    ];

    println!("{label}: worst-case cost against {SOURCE} (read {READ_ON})");
    let mut over = std::vec::Vec::new();
    for (name, used, limit) in rows {
        let pct = used as f64 * 100.0 / limit as f64;
        println!("  {name:<18} {used:>12} / {limit:>12}  ({pct:.1}%)");
        if used * 100 > limit * HEADROOM_PERCENT {
            over.push(name);
        }
    }
    assert!(
        over.is_empty(),
        "{label}: over {HEADROOM_PERCENT}% of the network limit for: {over:?}"
    );
}
