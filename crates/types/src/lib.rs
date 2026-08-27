#![no_std]

//! # Shared types
//!
//! Types that cross a contract boundary, defined once.
//!
//! Soroban contracts cannot depend on one another's crates: linking a second
//! contract in exports its symbols from the first one's wasm too, and the module
//! fails at link time on the collision. The usual workaround is to redeclare the
//! type on each side, which works right up until one side changes and the other
//! does not — and the failure then is not a compile error but a value decoded
//! into the wrong shape at runtime, after a call has already moved money.
//!
//! This crate exists so that cannot happen. It declares types and no contract,
//! so nothing here is a wasm export and any number of contracts may depend on
//! it. A field added on one side is a compile error on the other, which is
//! where that error belongs.

use soroban_sdk::{contracttype, Address, BytesN};

/// A recipient's accumulated track record.
///
/// Written by `record`, returned to any contract that credits it, and read by
/// programmes underwriting a repeat applicant.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Standing {
    pub subject: Address,
    /// Distinct programmes this recipient has been credited under.
    pub programmes: u32,
    /// Tranches released to them, across all programmes.
    pub tranches: u32,
    pub total_received: i128,
    pub first_seen: u64,
    pub last_updated: u64,
    /// Hash chain over every credit, in order. Genesis is all zeroes; each
    /// credit sets `root = sha256(root ‖ programme ‖ amount ‖ attestation ‖ ts)`.
    /// Lets anyone verify a full off-chain history against on-chain state.
    pub history_root: BytesN<32>,
}

/// Everything a programme is constructed from.
///
/// Grouped into a struct rather than passed as a dozen positional arguments —
/// at that width a caller transposing `review_deadline` and `release_deadline`,
/// or `quorum` and `tranches`, produces a valid-looking programme that behaves
/// wrongly, and the type system says nothing.
///
/// Lives here because the registry constructs it and the programme consumes it.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProgrammeConfig {
    pub creator: Address,
    /// The asset being distributed, as a Stellar Asset Contract address.
    pub token: Address,
    pub treasury: Address,
    /// Attestation registry that tranche conditions are verified against.
    pub attest: Address,
    /// Standing contract credited on each release.
    pub record: Address,
    /// Policy signer contract, consulted before a `Restricted` tranche is paid
    /// into a recipient's wallet.
    pub policy: Address,
    /// The single schema whose attestations unlock this programme's tranches.
    pub schema: BytesN<32>,
    pub fee_bps: u32,
    /// Applications close here.
    pub apply_deadline: u64,
    /// Reviews close here.
    pub review_deadline: u64,
    /// Tranches stop releasing here, and whatever is left becomes refundable.
    pub release_deadline: u64,
    /// Refunds nobody claimed sweep to the treasury here.
    ///
    /// Set per programme rather than fixed protocol-wide: a three-month student
    /// bursary and a three-year infrastructure grant have very different ideas
    /// about how long is long enough to wait for a donor to come back.
    pub sweep_deadline: u64,
    /// Reviewer votes needed before an application can be finalised.
    pub quorum: u32,
    pub tranches: u32,
    /// Minimum award amount below which finalisation is refused. Prevents awards
    /// smaller than the fee taken from them, or so small that splitting into
    /// tranches produces payments worth less than the transaction cost.
    pub minimum_award: i128,
    pub metadata_hash: BytesN<32>,
}
