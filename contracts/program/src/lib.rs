#![no_std]
// Contract constructors legitimately take many parameters, and the SDK's
// generated clients mirror those signatures.
#![allow(clippy::too_many_arguments)]

//! # Programme
//!
//! One funding round. Contributors put money in, applicants ask for what they
//! actually need, reviewers approve an amount up to that, and the result is an
//! award with a tranche schedule that Phase 3 releases against attestations.
//!
//! ## Partial funding, because equal splits are not funding
//!
//! The common shortcut is to divide the pot equally among everyone approved.
//! That ignores the only thing that matters: one applicant needs 200 for exam
//! fees and another needs 5,000 for tuition. Here an applicant states a
//! `requested` amount and each reviewer approves some amount up to it, so a
//! programme can fully fund one person, partially fund another, and reject a
//! third.
//!
//! ## Why the award is the median of reviewer votes
//!
//! Reviewers rarely agree on a number. Taking the **minimum** lets one cautious
//! reviewer dictate the outcome; the **mean** lets one outlier drag it. The
//! median is what a committee would land on and is robust to a single reviewer
//! at either extreme.
//!
//! Computing it needs the votes ordered, which means holding a collection — the
//! thing deliberately avoided elsewhere in this protocol. It is acceptable here
//! for one specific reason: the vote vector is **bounded at construction** by
//! `quorum`, which is capped at [`MAX_QUORUM`]. It cannot grow without limit, so
//! its write cost and its restoration cost after archival are both known in
//! advance. Votes are also inserted in sorted position rather than sorted later,
//! so the cost stays linear in a small fixed bound.
//!
//! ## Budget
//!
//! Awards are settled against the contributed balance less the protocol fee,
//! first finalised first served. A programme that over-approves will find later
//! finalisations rejected rather than silently over-committing money it does not
//! have.
//!
//! ## Oversubscription: order decides, and that is deliberate
//!
//! [`Programme::finalize`] is permissionless — anyone may call it once quorum is
//! reached, on purpose, so no privileged party can strand an applicant by simply
//! not pressing a button. That same permissionlessness means that when the
//! programme is oversubscribed (approved amounts exceed what remains of the
//! budget), **whoever calls `finalize` first decides who gets funded**. A
//! reviewer panel approving three applicants for more than the budget covers
//! does not decide which two are funded; the order finalisations happen to
//! arrive in does.
//!
//! This is a documented limitation, not a bug, and fixing it — priority,
//! queueing, a fairer allocation rule — is a separate decision from the three
//! guarantees this contract actually makes about it, all covered by tests in
//! `test.rs`:
//!
//! - **The budget is never exceeded**, under any ordering. A finalisation that
//!   would over-commit is rejected with [`Error::InsufficientBudget`] rather
//!   than accepted and squeezing a later payout.
//! - **A rejected finalisation is a pure read.** Nothing is written before the
//!   budget check, so a refused application is untouched — same `finalized:
//!   false`, same votes, no [`Award`] created — and stays finalisable exactly
//!   as before. If whatever consumed the budget the first time around is never
//!   finalised (or is finalised for less), the identical call against the
//!   identical application can still succeed later.
//! - **No ordering double-commits.** Once an application is finalised, every
//!   further `finalize` call against it fails with [`Error::AlreadyFinalized`]
//!   before the budget is touched again, regardless of who calls it or when.

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype, token,
    Address, BytesN, Env, Symbol, Vec,
};

/// The programme's configuration, shared with the registry that builds it.
pub use milepost_types::{ProgrammeConfig, Standing};

/// The slice of the attestation registry a programme needs.
///
/// `verify` rather than `is_valid`: the registry checks subject, schema and
/// attester together, so a valid attestation by the wrong party under the wrong
/// schema cannot unlock a tranche.
///
/// Declared rather than imported — linking the contract itself would export its
/// symbols from this wasm too.
#[contractclient(name = "AttestClient")]
pub trait Attestations {
    fn verify(
        env: Env,
        uid: BytesN<32>,
        subject: Address,
        schema: BytesN<32>,
        attester: Address,
    ) -> bool;
    fn get_schema(env: Env, uid: BytesN<32>) -> Result<crate::Schema, crate::Error>;
}

/// Mirrors the schema type from the attest contract without importing it,
/// which would re-export its symbols from this wasm.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Schema {
    pub uid: BytesN<32>,
    pub authority: Address,
    pub definition: soroban_sdk::String,
    pub revocable: bool,
    pub restricted: bool,
}

/// Error type matching the attest contract's error enum, used only for the
/// `get_schema` return. Discriminants must stay in sync with the attest crate.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum AttestError {
    SchemaNotFound = 1,
}

/// The slice of the spend policy a programme needs.
///
/// Only installation is checkable from here. Whether the recipient's *other*
/// signers are properly limited lives in the wallet's own storage, and no
/// contract in this protocol can see it — which is exactly why `Allocated`
/// exists.
#[contractclient(name = "PolicyClient")]
pub trait SpendPolicy {
    fn is_installed(env: Env, wallet: Address) -> bool;
}

/// The slice of the standing contract a programme needs.
///
/// `credit` returns the updated standing, which this contract has no use for —
/// but the type still has to be right. A client whose declared return type does
/// not match what the callee returns fails conversion *after* the call has
/// already moved money, so the shared `Standing` is named here rather than a
/// convenient stand-in.
#[contractclient(name = "StandingClient")]
pub trait StandingContract {
    fn credit(
        env: Env,
        writer: Address,
        subject: Address,
        programme: Address,
        amount: i128,
        attestation: BytesN<32>,
    ) -> Standing;
}

/// Ledgers per day, at the ~5 second close time Stellar targets.
const DAY_IN_LEDGERS: u32 = 17_280;
const BUMP_LEDGERS: u32 = 90 * DAY_IN_LEDGERS;
const BUMP_THRESHOLD: u32 = 60 * DAY_IN_LEDGERS;

/// Upper bound on reviewers required per applicant. Bounds the vote vector, and
/// with it the worst-case write and restoration cost of a review entry.
pub const MAX_QUORUM: u32 = 16;
/// Protocol fee ceiling, in basis points. A programme cannot be created with a
/// fee above this no matter what the registry says.
pub const MAX_FEE_BPS: u32 = 1_000;
/// Maximum number of payees in a single batch operation.
pub const MAX_PAYEE_BATCH: u32 = 50;
const BPS_DENOMINATOR: i128 = 10_000;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotAuthorized = 1,
    /// The action does not belong to the programme's current phase.
    WrongPhase = 2,
    InvalidAmount = 3,
    InvalidDeadlines = 4,
    InvalidQuorum = 5,
    FeeTooHigh = 6,
    NoReviewers = 7,
    ApplicationNotFound = 8,
    AlreadyApplied = 9,
    AlreadyReviewed = 10,
    /// Approving more than the applicant asked for.
    ExceedsRequested = 11,
    /// Not enough reviewers have voted to settle this application yet.
    QuorumNotReached = 12,
    AlreadyFinalized = 13,
    /// The remaining budget cannot cover this award.
    InsufficientBudget = 14,
    Overflow = 15,
    Cancelled = 16,
    /// A programme with money in it, or awards made, cannot be cancelled.
    NotCancellable = 17,
    NoVerifiers = 18,
    AwardNotFound = 19,
    AwardFullyReleased = 20,
    /// The attestation is missing, revoked, expired, or is not a claim by this
    /// attester about this recipient under this programme's schema.
    AttestationInvalid = 21,
    /// One proof unlocks one tranche; this one is spent.
    AttestationAlreadyUsed = 22,
    ReleaseWindowClosed = 23,
    FeeAlreadySwept = 24,
    RefundsNotOpen = 25,
    AlreadyRefunded = 26,
    NothingToRefund = 27,
    /// The grace period for donors to claim refunds has not elapsed.
    SweepNotOpen = 28,
    NothingToSweep = 29,
    /// The destination is not a payee this programme has verified.
    PayeeNotVerified = 30,
    AlreadyPayee = 31,
    NotPayee = 32,
    /// The recipient has no allocation, or not enough of one.
    InsufficientAllocation = 33,
    /// A `Restricted` award was released to a wallet with no policy installed.
    PolicyNotInstalled = 34,
    /// Allocations can no longer be directed once the sweep window opens.
    SpendWindowClosed = 35,
    /// The batch exceeds the maximum allowed size.
    BatchTooLarge = 36,
    /// The application has been withdrawn.
    Withdrawn = 37,
    /// The award is below the programme's configured minimum and cannot be finalised.
    BelowMinimumAward = 38,
    /// The programme is paused and this operation cannot proceed.
    Paused = 39,
    /// The schema is restricted but its authority is not among the verifiers,
    /// so no tranche could ever be released.
    SchemaAuthorityNotVerifier = 40,
    /// The schema does not exist in the attestation registry.
    SchemaNotFound = 41,
}

/// Where a tranche is paid, in descending order of how hard the restriction is
/// to circumvent.
///
/// Variants carry no explicit discriminants on purpose: an enum with them is
/// encoded numerically, so callers and generated bindings must pass `3` rather
/// than `"Allocated"`. Symbolic variants cost a few bytes per award and save
/// every caller from a lookup table.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Mode {
    /// Paid straight to a verified payee chosen at award time — a school, clinic
    /// or supplier. The recipient never holds the funds and never chooses.
    Direct,
    /// Held in escrow and directed by the recipient, who picks which verified
    /// payee receives it and when.
    ///
    /// The strongest guarantee available, because it depends on nothing outside
    /// this contract. `Restricted` relies on a wallet being configured
    /// correctly; a misconfigured wallet quietly downgrades to no restriction at
    /// all. Here there is no wallet to misconfigure — funds cannot reach anyone
    /// unverified because they never leave escrow until they do.
    Allocated,
    /// Paid into the recipient's smart wallet, where a policy signer limits
    /// onward spending to verified destinations.
    ///
    /// Weaker than it looks. A policy constrains one signer, not the wallet: a
    /// recipient holding an unrestricted admin signer can authorise around it.
    /// Genuine enforcement needs the wallet's own `SignerLimits` to confine the
    /// funded signer to the policy, which is a deployment step this contract
    /// cannot perform. Releases here verify the policy is at least installed,
    /// which bounds a misconfiguration to one tranche rather than the award.
    Restricted,
    /// Paid to the recipient with no restriction.
    Open,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Phase {
    Open,
    Review,
    Settled,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Application {
    pub applicant: Address,
    pub requested: i128,
    pub metadata_hash: BytesN<32>,
    pub submitted_at: u64,
    /// Approved amounts, kept in ascending order so the median is a lookup.
    pub votes: Vec<i128>,
    pub finalized: bool,
    pub withdrawn: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Award {
    pub recipient: Address,
    /// What reviewers settled on. Never more than `requested`.
    pub granted: i128,
    pub released: i128,
    pub tranches: u32,
    pub tranches_released: u32,
    pub payee: Address,
    pub mode: Mode,
}

#[contractevent(topics = ["contrib"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Contributed {
    #[topic]
    pub donor: Address,
    pub amount: i128,
}

#[contractevent(topics = ["applied"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Applied {
    #[topic]
    pub applicant: Address,
    pub application: Application,
}

#[contractevent(topics = ["reviewed"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Reviewed {
    #[topic]
    pub applicant: Address,
    #[topic]
    pub reviewer: Address,
    pub approved: i128,
}

#[contractevent(topics = ["vote_amended"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VoteAmended {
    #[topic]
    pub applicant: Address,
    #[topic]
    pub reviewer: Address,
    pub previous: i128,
    pub approved: i128,
}

#[contractevent(topics = ["awarded"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Awarded {
    #[topic]
    pub recipient: Address,
    pub award: Award,
}

#[contractevent(topics = ["released"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Released {
    #[topic]
    pub recipient: Address,
    #[topic]
    pub payee: Address,
    pub amount: i128,
    pub attestation: BytesN<32>,
    pub award: Award,
}

#[contractevent(topics = ["fee"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FeeSwept {
    pub amount: i128,
}

#[contractevent(topics = ["refunded"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Refunded {
    #[topic]
    pub donor: Address,
    pub amount: i128,
}

#[contractevent(topics = ["payee"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PayeeChanged {
    #[topic]
    pub payee: Address,
    pub verified: bool,
}

#[contractevent(topics = ["allocd"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AllocationChanged {
    #[topic]
    pub recipient: Address,
    pub allocation: i128,
}

#[contractevent(topics = ["directd"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Directed {
    #[topic]
    pub recipient: Address,
    #[topic]
    pub payee: Address,
    pub amount: i128,
    pub remaining: i128,
}

#[contractevent(topics = ["swept"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UnclaimedSwept {
    pub amount: i128,
}

#[contractevent(topics = ["verifier_changed"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerifierChanged {
    #[topic]
    pub verifier: Address,
    pub added: bool,
}

#[contractevent(topics = ["cancelled"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProgrammeCancelled {
    pub at: u64,
}

/// Emitted once, at construction, so an observer rebuilding programme history
/// from events has a starting point. Carries the full terms an observer cannot
/// otherwise cheaply obtain — the deadlines, quorum, tranches, fee and the
/// addresses the programme is wired to. Mirrors the existing convention of
/// publishing the whole struct rather than a projection of it.
/// Not asserted in tests: the Soroban test environment does not record events
/// emitted during construction, whether the contract is registered directly or
/// deployed through the registry. The event is emitted on-chain regardless.
#[contractevent(topics = ["created"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProgrammeCreated {
    pub config: ProgrammeConfig,
}

/// A permissionless nudge that keeps the contract's long-lived entries from
/// being archived. See [`Programme::keepalive`] for the rationale; the struct
/// exists so the event can be published here too when that path is exercised.
#[contractevent(topics = ["kept"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KeptAlive {
    pub subject: Address,
}

#[contractevent(topics = ["paused"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Paused {
    #[topic]
    pub by: Address,
}

#[contractevent(topics = ["unpaused"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Unpaused {
    #[topic]
    pub by: Address,
}

#[contractevent(topics = ["withdrawn"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ApplicationWithdrawn {
    #[topic]
    pub applicant: Address,
}

#[contracttype]
#[derive(Clone)]
enum Key {
    Config,
    Cancelled,
    Paused,
    Contributed,
    Granted,
    Released,
    RefundedTotal,
    SweptTotal,
    FeeSwept,
    /// One entry per contributor, so refunds stay proportional without a list.
    Donor(Address),
    Refunded(Address),
    Reviewer(Address),
    /// Attesters this programme trusts to unlock its tranches.
    Verifier(Address),
    Application(Address),
    Award(Address),
    /// Marks that `reviewer` already voted on `applicant`.
    Voted(Address, Address),
    /// Marks an attestation as spent, so one proof unlocks exactly one tranche.
    Used(BytesN<32>),
    /// Payees this programme has verified as legitimate destinations.
    Payee(Address),
    /// Released funds held in escrow for a recipient to direct.
    Allocation(Address),
}

#[contract]
pub struct Programme;

#[contractimpl]
impl Programme {
    pub fn __constructor(
        env: Env,
        config: ProgrammeConfig,
        reviewers: Vec<Address>,
        verifiers: Vec<Address>,
    ) -> Result<(), Error> {
        if config.fee_bps > MAX_FEE_BPS {
            return Err(Error::FeeTooHigh);
        }
        let now = env.ledger().timestamp();
        if config.apply_deadline <= now
            || config.review_deadline <= config.apply_deadline
            || config.release_deadline <= config.review_deadline
            || config.sweep_deadline <= config.release_deadline
        {
            return Err(Error::InvalidDeadlines);
        }
        if reviewers.is_empty() {
            return Err(Error::NoReviewers);
        }
        // Without a trusted attester no tranche could ever be released, so the
        // programme would take money it could never pay out.
        if verifiers.is_empty() {
            return Err(Error::NoVerifiers);
        }
        // Quorum above the reviewer count would make every application
        // permanently unfinalisable.
        if config.quorum == 0 || config.quorum > MAX_QUORUM || config.quorum > reviewers.len() {
            return Err(Error::InvalidQuorum);
        }
        if config.tranches == 0 {
            return Err(Error::InvalidAmount);
        }
        // Minimum award must be non-negative and sensible relative to tranches.
        // Each tranche must be at least 1 stroops to be payable.
        if config.minimum_award < 0 {
            return Err(Error::InvalidAmount);
        }
        // If minimum_award is set, it must be at least tranches count to ensure
        // each tranche is at least 1 stroops (the smallest unit).
        if config.minimum_award > 0 && config.minimum_award < config.tranches as i128 {
            return Err(Error::InvalidAmount);
        }

        for reviewer in reviewers.iter() {
            let key = Key::Reviewer(reviewer.clone());
            env.storage().persistent().set(&key, &true);
            // Written once here and only read thereafter, so without an explicit
            // bump it would archive while the programme is still live.
            env.storage()
                .persistent()
                .extend_ttl(&key, BUMP_THRESHOLD, BUMP_LEDGERS);
        }
        for verifier in verifiers.iter() {
            let key = Key::Verifier(verifier.clone());
            env.storage().persistent().set(&key, &true);
            env.storage()
                .persistent()
                .extend_ttl(&key, BUMP_THRESHOLD, BUMP_LEDGERS);
        }

        // Validate the schema: it must exist, and if it is restricted the
        // authority must be among the verifiers so a tranche can actually be
        // released. Without this check a programme could be constructed in a
        // state where no attestation could ever unlock payment.
        //
        // We call via `invoke_contract` rather than the generated client
        // because the `contractclient` macro auto-unwraps `Result`, making
        // it impossible to distinguish "schema not found" from "valid
        // schema". With `invoke_contract` we can return our own error
        // discriminant instead of letting the attest contract panic.
        let args = soroban_sdk::vec![&env, config.schema.to_val()];
        let result: Result<Schema, AttestError> =
            env.invoke_contract(&config.attest, &Symbol::new(&env, "get_schema"), args);
        match result {
            Err(_) => return Err(Error::SchemaNotFound),
            Ok(schema) => {
                if schema.restricted && !verifiers.iter().any(|v| v == schema.authority) {
                    return Err(Error::SchemaAuthorityNotVerifier);
                }
            }
        }

        env.storage().instance().set(&Key::Config, &config);
        env.storage().instance().set(&Key::Contributed, &0i128);
        env.storage().instance().set(&Key::Granted, &0i128);
        env.storage().instance().set(&Key::Released, &0i128);
        env.storage().instance().set(&Key::RefundedTotal, &0i128);
        env.storage().instance().set(&Key::SweptTotal, &0i128);
        // The contract-wide instance entries back every view and refund, so keep
        // them alive from the start rather than relying on the first write.
        env.storage()
            .instance()
            .extend_ttl(BUMP_THRESHOLD, BUMP_LEDGERS);

        ProgrammeCreated {
            config: config.clone(),
        }
        .publish(&env);
        Ok(())
    }

    /// Put money in. Contributions close when applications do, so the budget is
    /// fixed before anyone reviews against it — a reviewer approving an amount
    /// should not have the ground move underneath them.
    /// Reject when the programme is paused.
    ///
    /// Deliberately not part of `phase`: pausing is orthogonal to the deadline
    /// timeline, and refund and sweep must keep working while paused.
    fn require_not_paused(env: &Env) -> Result<(), Error> {
        if env.storage().instance().get::<_, bool>(&Key::Paused) == Some(true) {
            return Err(Error::Paused);
        }
        Ok(())
    }

    pub fn contribute(env: Env, donor: Address, amount: i128) -> Result<(), Error> {
        Self::require_not_paused(&env)?;
        donor.require_auth();
        Self::require_phase(&env, Phase::Open)?;
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let config = Self::config(&env)?;
        token::Client::new(&env, &config.token).transfer(
            &donor,
            env.current_contract_address(),
            &amount,
        );

        let key = Key::Donor(donor.clone());
        let prior: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        env.storage()
            .persistent()
            .set(&key, &prior.checked_add(amount).ok_or(Error::Overflow)?);
        env.storage()
            .persistent()
            .extend_ttl(&key, BUMP_THRESHOLD, BUMP_LEDGERS);

        let total: i128 = env.storage().instance().get(&Key::Contributed).unwrap_or(0);
        env.storage().instance().set(
            &Key::Contributed,
            &total.checked_add(amount).ok_or(Error::Overflow)?,
        );

        Contributed { donor, amount }.publish(&env);
        Ok(())
    }

    /// Ask for what you actually need. `metadata_hash` points at the proposal;
    /// the payload lives wherever the parties agree, so a pinning service being
    /// down cannot block an application.
    pub fn apply(
        env: Env,
        applicant: Address,
        requested: i128,
        metadata_hash: BytesN<32>,
    ) -> Result<(), Error> {
        Self::require_not_paused(&env)?;
        applicant.require_auth();
        Self::require_phase(&env, Phase::Open)?;
        if requested <= 0 {
            return Err(Error::InvalidAmount);
        }

        let key = Key::Application(applicant.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::AlreadyApplied);
        }

        let application = Application {
            applicant: applicant.clone(),
            requested,
            metadata_hash,
            submitted_at: env.ledger().timestamp(),
            votes: Vec::new(&env),
            finalized: false,
            withdrawn: false,
        };
        env.storage().persistent().set(&key, &application);
        env.storage()
            .persistent()
            .extend_ttl(&key, BUMP_THRESHOLD, BUMP_LEDGERS);

        Applied {
            applicant,
            application,
        }
        .publish(&env);
        Ok(())
    }

    /// Approve an amount up to what was requested. A reviewer who thinks the
    /// application should be rejected simply does not vote — there is no
    /// "approve zero", because a zero-value award is just a rejection with extra
    /// storage.
    ///
    /// A reviewer can amend their vote before finalisation by calling this
    /// again with a different amount. The sorted order is preserved and quorum
    /// still counts each reviewer once.
    pub fn review(
        env: Env,
        reviewer: Address,
        applicant: Address,
        approved: i128,
    ) -> Result<(), Error> {
        Self::require_not_paused(&env)?;
        reviewer.require_auth();
        Self::require_phase(&env, Phase::Review)?;
        if !env
            .storage()
            .persistent()
            .has(&Key::Reviewer(reviewer.clone()))
        {
            return Err(Error::NotAuthorized);
        }
        // Read on every review; bump it so the trust set survives a long review
        // window without a separate keepalive.
        env.storage().persistent().extend_ttl(
            &Key::Reviewer(reviewer.clone()),
            BUMP_THRESHOLD,
            BUMP_LEDGERS,
        );

        let key = Key::Application(applicant.clone());
        let mut application: Application = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::ApplicationNotFound)?;
        if application.finalized {
            return Err(Error::AlreadyFinalized);
        }
        if application.withdrawn {
            return Err(Error::Withdrawn);
        }
        if approved <= 0 {
            return Err(Error::InvalidAmount);
        }
        if approved > application.requested {
            return Err(Error::ExceedsRequested);
        }

        let vote_key = Key::Voted(applicant.clone(), reviewer.clone());
        let is_amendment = env.storage().persistent().has(&vote_key);

        if is_amendment {
            // This is an amendment: find and remove the old vote, keeping sorted order.
            let old_vote: i128 = env
                .storage()
                .persistent()
                .get(&vote_key)
                .unwrap_or(approved);

            // Remove one instance of the old vote, keeping sorted order. The
            // break makes it exactly one, so no flag is needed to track it.
            for i in 0..application.votes.len() {
                if application.votes.get(i).unwrap() == old_vote {
                    application.votes.remove(i);
                    break;
                }
            }

            // Insert the new vote in sorted position.
            let mut at = application.votes.len();
            for (i, existing) in application.votes.iter().enumerate() {
                if approved < existing {
                    at = i as u32;
                    break;
                }
            }
            application.votes.insert(at, approved);

            env.storage().persistent().set(&key, &application);
            env.storage()
                .persistent()
                .extend_ttl(&key, BUMP_THRESHOLD, BUMP_LEDGERS);
            env.storage().persistent().set(&vote_key, &approved);
            env.storage()
                .persistent()
                .extend_ttl(&vote_key, BUMP_THRESHOLD, BUMP_LEDGERS);

            VoteAmended {
                applicant,
                reviewer,
                previous: old_vote,
                approved,
            }
            .publish(&env);
        } else {
            // This is a new vote: insert in sorted position.
            let mut at = application.votes.len();
            for (i, existing) in application.votes.iter().enumerate() {
                if approved < existing {
                    at = i as u32;
                    break;
                }
            }
            application.votes.insert(at, approved);

            env.storage().persistent().set(&key, &application);
            env.storage()
                .persistent()
                .extend_ttl(&key, BUMP_THRESHOLD, BUMP_LEDGERS);
            env.storage().persistent().set(&vote_key, &approved);
            env.storage()
                .persistent()
                .extend_ttl(&vote_key, BUMP_THRESHOLD, BUMP_LEDGERS);

            Reviewed {
                applicant,
                reviewer,
                approved,
            }
            .publish(&env);
        }

        Ok(())
    }

    /// Settle an application into an award once quorum is in. Permissionless to
    /// call: the outcome is already determined by the votes, and requiring a
    /// privileged party to trigger it would let them strand an applicant.
    ///
    /// `payee` is where tranches are paid. In [`Mode::Direct`] that is a verified
    /// institution rather than the recipient.
    ///
    /// When the programme is oversubscribed, being permissionless means calling
    /// order decides who is funded — see "Oversubscription" in the module docs
    /// for what is and is not guaranteed about that.
    pub fn finalize(
        env: Env,
        applicant: Address,
        payee: Address,
        mode: Mode,
    ) -> Result<Award, Error> {
        Self::require_not_paused(&env)?;
        match Self::phase(&env)? {
            Phase::Review | Phase::Settled => {}
            Phase::Cancelled => return Err(Error::Cancelled),
            Phase::Open => return Err(Error::WrongPhase),
        }

        let key = Key::Application(applicant.clone());
        let mut application: Application = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::ApplicationNotFound)?;
        if application.finalized {
            return Err(Error::AlreadyFinalized);
        }
        if application.withdrawn {
            return Err(Error::Withdrawn);
        }

        let config = Self::config(&env)?;
        if application.votes.len() < config.quorum {
            return Err(Error::QuorumNotReached);
        }

        // Median of the first `quorum` votes, which are already sorted. With an
        // even count this takes the lower of the two middles — the conservative
        // side, which is the right bias when the number is money.
        let granted = application
            .votes
            .get((config.quorum - 1) / 2)
            .ok_or(Error::QuorumNotReached)?;

        // Refuse to finalise if the award is below the configured minimum.
        // This prevents awards smaller than the fee taken from them, or so small
        // that splitting into tranches produces payments worth less than the
        // transaction cost. The application remains untouched and retryable.
        if granted < config.minimum_award {
            return Err(Error::BelowMinimumAward);
        }

        // A Direct award names its payee now and pays them without further
        // consent, so the payee has to be one this programme stands behind.
        if mode == Mode::Direct && !env.storage().persistent().has(&Key::Payee(payee.clone())) {
            return Err(Error::PayeeNotVerified);
        }

        let granted_so_far: i128 = env.storage().instance().get(&Key::Granted).unwrap_or(0);
        let committed = granted_so_far.checked_add(granted).ok_or(Error::Overflow)?;
        if committed > Self::available(&env, &config)? {
            return Err(Error::InsufficientBudget);
        }

        application.finalized = true;
        env.storage().persistent().set(&key, &application);
        env.storage()
            .persistent()
            .extend_ttl(&key, BUMP_THRESHOLD, BUMP_LEDGERS);
        env.storage().instance().set(&Key::Granted, &committed);

        let award = Award {
            recipient: applicant.clone(),
            granted,
            released: 0,
            tranches: config.tranches,
            tranches_released: 0,
            payee,
            mode,
        };
        let award_key = Key::Award(applicant.clone());
        env.storage().persistent().set(&award_key, &award);
        env.storage()
            .persistent()
            .extend_ttl(&award_key, BUMP_THRESHOLD, BUMP_LEDGERS);

        Awarded {
            recipient: applicant,
            award: award.clone(),
        }
        .publish(&env);
        Ok(award)
    }

    /// Verify a payee as a legitimate destination for this programme's money.
    ///
    /// Managed by the creator rather than the reviewers: reviewers judge whether
    /// an applicant deserves funding, which is a different question from whether
    /// a given school actually exists.
    pub fn allow_payee(env: Env, payee: Address) -> Result<(), Error> {
        Self::config(&env)?.creator.require_auth();

        let key = Key::Payee(payee.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::AlreadyPayee);
        }
        env.storage().persistent().set(&key, &true);
        env.storage()
            .persistent()
            .extend_ttl(&key, BUMP_THRESHOLD, BUMP_LEDGERS);

        PayeeChanged {
            payee,
            verified: true,
        }
        .publish(&env);
        Ok(())
    }

    /// Withdraw a payee. Allocations already directed to them are untouched —
    /// this stops future payments, it does not claw back past ones.
    pub fn deny_payee(env: Env, payee: Address) -> Result<(), Error> {
        Self::config(&env)?.creator.require_auth();

        let key = Key::Payee(payee.clone());
        if !env.storage().persistent().has(&key) {
            return Err(Error::NotPayee);
        }
        env.storage().persistent().remove(&key);

        PayeeChanged {
            payee,
            verified: false,
        }
        .publish(&env);
        Ok(())
    }

    /// Add multiple verified payees in a single call. Duplicates within the
    /// batch or against already-verified payees are skipped, not rejected — the
    /// caller is batching for convenience, not precision.
    pub fn allow_payees(env: Env, payees: Vec<Address>) -> Result<(), Error> {
        if payees.len() > MAX_PAYEE_BATCH {
            return Err(Error::BatchTooLarge);
        }
        Self::config(&env)?.creator.require_auth();

        for payee in payees.iter() {
            let key = Key::Payee(payee.clone());
            if env.storage().persistent().has(&key) {
                continue;
            }
            env.storage().persistent().set(&key, &true);
            env.storage()
                .persistent()
                .extend_ttl(&key, BUMP_THRESHOLD, BUMP_LEDGERS);

            PayeeChanged {
                payee,
                verified: true,
            }
            .publish(&env);
        }
        Ok(())
    }

    /// Remove multiple payees in a single call. Payees not currently verified
    /// are skipped, not rejected.
    pub fn deny_payees(env: Env, payees: Vec<Address>) -> Result<(), Error> {
        if payees.len() > MAX_PAYEE_BATCH {
            return Err(Error::BatchTooLarge);
        }
        Self::config(&env)?.creator.require_auth();

        for payee in payees.iter() {
            let key = Key::Payee(payee.clone());
            if !env.storage().persistent().has(&key) {
                continue;
            }
            env.storage().persistent().remove(&key);

            PayeeChanged {
                payee,
                verified: false,
            }
            .publish(&env);
        }
        Ok(())
    }

    /// Add a new verifier to the trust set. The creator manages the verifier
    /// list: reviewers decide *how much* to award, but the verifier list
    /// decides *who can attest* that a milestone was met — a different
    /// trust boundary.
    pub fn add_verifier(env: Env, verifier: Address) -> Result<(), Error> {
        Self::config(&env)?.creator.require_auth();
        let key = Key::Verifier(verifier.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::AlreadyPayee); // reuse: already a verifier
        }
        env.storage().persistent().set(&key, &true);
        env.storage()
            .persistent()
            .extend_ttl(&key, BUMP_THRESHOLD, BUMP_LEDGERS);

        VerifierChanged {
            verifier,
            added: true,
        }
        .publish(&env);
        Ok(())
    }

    /// Remove a verifier from the trust set. Attestations already made by a
    /// removed verifier remain valid — they were signed under the schema's
    /// authority, not the programme's verifier list, so the attestation
    /// registry still recognises them. What changes is that future tranche
    /// releases can no longer rely on attestations by this address.
    pub fn remove_verifier(env: Env, verifier: Address) -> Result<(), Error> {
        Self::config(&env)?.creator.require_auth();
        let key = Key::Verifier(verifier.clone());
        if !env.storage().persistent().has(&key) {
            return Err(Error::NotPayee); // reuse: not a verifier
        }
        env.storage().persistent().remove(&key);

        VerifierChanged {
            verifier,
            added: false,
        }
        .publish(&env);
        Ok(())
    }

    /// Withdraw an application before finalisation. Withdrawal is final for
    /// this programme — the applicant may not reapply. The application record
    /// is marked, not deleted, so history stays auditable. Votes already cast
    /// are left in place but can never produce an award.
    pub fn withdraw(env: Env, applicant: Address) -> Result<(), Error> {
        applicant.require_auth();

        let key = Key::Application(applicant.clone());
        let mut application: Application = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::ApplicationNotFound)?;
        if application.finalized {
            return Err(Error::AlreadyFinalized);
        }
        if application.withdrawn {
            return Err(Error::Withdrawn);
        }

        application.withdrawn = true;
        env.storage().persistent().set(&key, &application);
        env.storage()
            .persistent()
            .extend_ttl(&key, BUMP_THRESHOLD, BUMP_LEDGERS);

        ApplicationWithdrawn { applicant }.publish(&env);
        Ok(())
    }

    /// Direct part of an allocation to a verified payee.
    ///
    /// This is what gives an `Allocated` recipient agency: they choose which
    /// payee, when, and how much, without ever holding funds that could reach
    /// anywhere else. The money moves from escrow straight to the payee.
    pub fn spend(
        env: Env,
        recipient: Address,
        payee: Address,
        amount: i128,
    ) -> Result<i128, Error> {
        Self::require_not_paused(&env)?;
        recipient.require_auth();
        let config = Self::config(&env)?;

        if env.ledger().timestamp() >= config.sweep_deadline {
            return Err(Error::SpendWindowClosed);
        }
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if !env.storage().persistent().has(&Key::Payee(payee.clone())) {
            return Err(Error::PayeeNotVerified);
        }

        let key = Key::Allocation(recipient.clone());
        let allocation: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        if allocation < amount {
            return Err(Error::InsufficientAllocation);
        }

        let remaining = allocation - amount;
        env.storage().persistent().set(&key, &remaining);
        env.storage()
            .persistent()
            .extend_ttl(&key, BUMP_THRESHOLD, BUMP_LEDGERS);

        token::Client::new(&env, &config.token).transfer(
            &env.current_contract_address(),
            &payee,
            &amount,
        );

        Directed {
            recipient,
            payee,
            amount,
            remaining,
        }
        .publish(&env);
        Ok(remaining)
    }

    /// Release one tranche against a proof that the condition was met.
    ///
    /// Permissionless to call, because everything that decides the outcome is
    /// already on-chain: the award, the trusted verifier set, and an attestation
    /// the verifier already signed. Requiring a privileged trigger would let
    /// whoever holds it withhold money a recipient has already earned.
    ///
    /// `attester` names which trusted verifier is being relied on. The programme
    /// checks it trusts them; the attestation registry checks the claim really
    /// is theirs, really is about this recipient, and really is under this
    /// programme's schema.
    pub fn release(
        env: Env,
        recipient: Address,
        attestation: BytesN<32>,
        attester: Address,
    ) -> Result<i128, Error> {
        Self::require_not_paused(&env)?;
        let config = Self::config(&env)?;
        if Self::phase(&env)? == Phase::Cancelled {
            return Err(Error::Cancelled);
        }
        if env.ledger().timestamp() >= config.release_deadline {
            return Err(Error::ReleaseWindowClosed);
        }

        if !env
            .storage()
            .persistent()
            .has(&Key::Verifier(attester.clone()))
        {
            return Err(Error::NotAuthorized);
        }
        // Read on every release; bump it so a trusted verifier stays resolvable
        // for the full life of a long-running programme.
        env.storage().persistent().extend_ttl(
            &Key::Verifier(attester.clone()),
            BUMP_THRESHOLD,
            BUMP_LEDGERS,
        );

        // One proof, one tranche. Without this a single attestation would
        // unlock the whole award.
        let used = Key::Used(attestation.clone());
        if env.storage().persistent().has(&used) {
            return Err(Error::AttestationAlreadyUsed);
        }

        if !AttestClient::new(&env, &config.attest).verify(
            &attestation,
            &recipient,
            &config.schema,
            &attester,
        ) {
            return Err(Error::AttestationInvalid);
        }

        let key = Key::Award(recipient.clone());
        let mut award: Award = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::AwardNotFound)?;
        if award.tranches_released >= award.tranches {
            return Err(Error::AwardFullyReleased);
        }

        // The final tranche takes the remainder so integer division cannot
        // strand dust in the contract.
        award.tranches_released += 1;
        let amount = if award.tranches_released == award.tranches {
            award.granted - award.released
        } else {
            award.granted / award.tranches as i128
        };
        award.released += amount;

        env.storage().persistent().set(&key, &award);
        env.storage()
            .persistent()
            .extend_ttl(&key, BUMP_THRESHOLD, BUMP_LEDGERS);
        env.storage().persistent().set(&used, &true);
        env.storage()
            .persistent()
            .extend_ttl(&used, BUMP_THRESHOLD, BUMP_LEDGERS);

        let released: i128 = env.storage().instance().get(&Key::Released).unwrap_or(0);
        env.storage().instance().set(
            &Key::Released,
            &released.checked_add(amount).ok_or(Error::Overflow)?,
        );

        match award.mode {
            // Stays in escrow for the recipient to direct via `spend`.
            Mode::Allocated => {
                let key = Key::Allocation(recipient.clone());
                let allocation: i128 = env.storage().persistent().get(&key).unwrap_or(0);
                let allocation = allocation.checked_add(amount).ok_or(Error::Overflow)?;
                env.storage().persistent().set(&key, &allocation);
                env.storage()
                    .persistent()
                    .extend_ttl(&key, BUMP_THRESHOLD, BUMP_LEDGERS);

                AllocationChanged {
                    recipient: recipient.clone(),
                    allocation,
                }
                .publish(&env);
            }
            mode => {
                // A `Restricted` award paid into a wallet with no policy
                // installed is an unrestricted payment wearing the wrong label.
                // Checking per tranche bounds a misconfiguration to one release.
                if mode == Mode::Restricted
                    && !PolicyClient::new(&env, &config.policy).is_installed(&award.payee)
                {
                    return Err(Error::PolicyNotInstalled);
                }
                token::Client::new(&env, &config.token).transfer(
                    &env.current_contract_address(),
                    &award.payee,
                    &amount,
                );
            }
        }

        // Credit standing last: the attestation is the proof the milestone was
        // met, and that is what a track record should describe.
        StandingClient::new(&env, &config.record).credit(
            &env.current_contract_address(),
            &recipient,
            &env.current_contract_address(),
            &amount,
            &attestation,
        );

        Released {
            recipient,
            payee: award.payee.clone(),
            amount,
            attestation,
            award,
        }
        .publish(&env);
        Ok(amount)
    }

    /// Send the protocol's cut to the treasury. Permissionless and once only.
    ///
    /// The fee was never part of the awardable budget, so this moves money that
    /// was never promised to anyone. It waits for contributions to close so the
    /// amount cannot change underneath it.
    pub fn sweep_fee(env: Env) -> Result<i128, Error> {
        let config = Self::config(&env)?;
        if Self::phase(&env)? == Phase::Open {
            return Err(Error::WrongPhase);
        }
        if env.storage().instance().get::<_, bool>(&Key::FeeSwept) == Some(true) {
            return Err(Error::FeeAlreadySwept);
        }

        let total: i128 = env.storage().instance().get(&Key::Contributed).unwrap_or(0);
        let fee = total
            .checked_mul(config.fee_bps as i128)
            .ok_or(Error::Overflow)?
            / BPS_DENOMINATOR;

        env.storage().instance().set(&Key::FeeSwept, &true);
        if fee > 0 {
            token::Client::new(&env, &config.token).transfer(
                &env.current_contract_address(),
                &config.treasury,
                &fee,
            );
        }

        FeeSwept { amount: fee }.publish(&env);
        Ok(fee)
    }

    /// Reclaim a proportional share of whatever was never paid out.
    ///
    /// Covers both money no one was awarded and money awarded but never
    /// released — a recipient who never produced a proof leaves their tranches
    /// in the pool, and after the release window those go back to the people who
    /// put them in rather than sitting stranded.
    pub fn refund(env: Env, donor: Address) -> Result<i128, Error> {
        let config = Self::config(&env)?;
        let cancelled = Self::phase(&env)? == Phase::Cancelled;
        if !cancelled && env.ledger().timestamp() < config.release_deadline {
            return Err(Error::RefundsNotOpen);
        }

        let refunded_key = Key::Refunded(donor.clone());
        if env.storage().persistent().has(&refunded_key) {
            return Err(Error::AlreadyRefunded);
        }

        let contributed: i128 = env
            .storage()
            .persistent()
            .get(&Key::Donor(donor.clone()))
            .unwrap_or(0);
        if contributed == 0 {
            return Err(Error::NothingToRefund);
        }

        let total: i128 = env.storage().instance().get(&Key::Contributed).unwrap_or(0);
        let released: i128 = env.storage().instance().get(&Key::Released).unwrap_or(0);
        let unpaid = Self::available(&env, &config)? - released;
        if unpaid <= 0 {
            return Err(Error::NothingToRefund);
        }

        // Proportional to what this donor put in, so rounding cannot let the
        // sum of refunds exceed what is actually left.
        let amount = contributed.checked_mul(unpaid).ok_or(Error::Overflow)? / total;
        if amount <= 0 {
            return Err(Error::NothingToRefund);
        }

        env.storage().persistent().set(&refunded_key, &true);
        env.storage()
            .persistent()
            .extend_ttl(&refunded_key, BUMP_THRESHOLD, BUMP_LEDGERS);

        let refunded_total: i128 = env
            .storage()
            .instance()
            .get(&Key::RefundedTotal)
            .unwrap_or(0);
        env.storage().instance().set(
            &Key::RefundedTotal,
            &refunded_total.checked_add(amount).ok_or(Error::Overflow)?,
        );

        token::Client::new(&env, &config.token).transfer(
            &env.current_contract_address(),
            &donor,
            &amount,
        );

        Refunded { donor, amount }.publish(&env);
        Ok(amount)
    }

    /// Send whatever no donor ever came back for to the treasury.
    ///
    /// Refunds have to be claimed individually, and in practice many will not
    /// be: a diaspora donor who gave the equivalent of five dollars is not going
    /// to sign a transaction to recover three. Without this the remainder sits
    /// in the contract permanently, which serves nobody.
    ///
    /// The grace period is `sweep_deadline`, set per programme rather than fixed
    /// protocol-wide — a term-length bursary and a multi-year infrastructure
    /// grant disagree about how long is long enough to wait. Permissionless, so
    /// nobody has to be trusted to remember.
    pub fn sweep_unclaimed(env: Env) -> Result<i128, Error> {
        let config = Self::config(&env)?;
        if env.ledger().timestamp() < config.sweep_deadline {
            return Err(Error::SweepNotOpen);
        }

        let token = token::Client::new(&env, &config.token);
        let mut remaining = token.balance(&env.current_contract_address());

        // The protocol fee is not the donors' to reclaim, but it is also not
        // unclaimed refund money. If it was never swept, it is already heading
        // to the same place, so only the difference matters here.
        if env.storage().instance().get::<_, bool>(&Key::FeeSwept) != Some(true) {
            env.storage().instance().set(&Key::FeeSwept, &true);
        }

        if remaining <= 0 {
            return Err(Error::NothingToSweep);
        }
        remaining = remaining.min(token.balance(&env.current_contract_address()));

        token.transfer(
            &env.current_contract_address(),
            &config.treasury,
            &remaining,
        );

        let swept_total: i128 = env.storage().instance().get(&Key::SweptTotal).unwrap_or(0);
        env.storage().instance().set(
            &Key::SweptTotal,
            &swept_total.checked_add(remaining).ok_or(Error::Overflow)?,
        );

        UnclaimedSwept { amount: remaining }.publish(&env);
        Ok(remaining)
    }

    /// Abandon a programme before any tranche has reached a recipient.
    ///
    /// Once money has been released, those payouts are final and the programme
    /// cannot be unwound. Before that, every unspent token is still in the
    /// contract and belongs to the donors, so stepping back and returning it is
    /// the right call rather than stranding someone else's money. Cancelling
    /// opens refunds immediately (see [`Programme::refund`]), so a donor need
    /// not wait out a release deadline that no longer means anything.
    pub fn cancel(env: Env) -> Result<(), Error> {
        let config = Self::config(&env)?;
        config.creator.require_auth();

        if env.storage().instance().get::<_, bool>(&Key::Cancelled) == Some(true) {
            return Err(Error::Cancelled);
        }
        // Safe only while nothing has actually left the contract. A released
        // tranche is a payout that cannot be clawed back, so we refuse rather
        // than leave a recipient who earned money empty-handed.
        let released: i128 = env.storage().instance().get(&Key::Released).unwrap_or(0);
        if released != 0 {
            return Err(Error::NotCancellable);
        }

        env.storage().instance().set(&Key::Cancelled, &true);
        ProgrammeCancelled {
            at: env.ledger().timestamp(),
        }
        .publish(&env);
        Ok(())
    }

    /// Keep the contract's long-lived entries from being archived.
    ///
    /// Permissionless, mirroring `keepalive` on the attestation and standing
    /// contracts: anyone may pay the gas to extend TTL so a programme's history,
    /// and the money still tied to it, does not silently rot away.
    ///
    /// `subject` scopes the bump to the entries one observer cares about — an
    /// application, its award, any escrowed allocation, and that person's
    /// contribution and refund marker. These are exactly the entries that have
    /// no write of their own once the programme settles, so they are the ones
    /// most likely to archive unnoticed. The contract-wide instance state
    /// (config, the running totals, the cancellation flag) is bumped on every
    /// call as well, since views and refunds depend on it and it has no subject.
    ///
    /// Bumping is capped at [`BUMP_LEDGERS`] from now, so calling this in a loop
    /// cannot push an entry's TTL out without bound — there is no griefing path.
    pub fn keepalive(env: Env, subject: Address) -> Result<(), Error> {
        env.storage()
            .instance()
            .extend_ttl(BUMP_THRESHOLD, BUMP_LEDGERS);
        for key in [
            Key::Application(subject.clone()),
            Key::Award(subject.clone()),
            Key::Allocation(subject.clone()),
            Key::Donor(subject.clone()),
            Key::Refunded(subject.clone()),
        ] {
            if env.storage().persistent().has(&key) {
                env.storage()
                    .persistent()
                    .extend_ttl(&key, BUMP_THRESHOLD, BUMP_LEDGERS);
            }
        }

        KeptAlive { subject }.publish(&env);
        Ok(())
    }

    /// Emergency pause: temporarily halt money-forward operations while leaving
    /// refund and sweep paths open so donors are never trapped.
    ///
    /// Covers: contribute, apply, review, finalize, spend, release.
    /// Does NOT cover: refund, sweep_fee, sweep_unclaimed (donors must always
    /// be able to reclaim their money, even during an emergency).
    ///
    /// Only the creator may pause. This is deliberate: the creator funds and
    /// oversees the programme, and pausing is a reversible containment action,
    /// not a permanent shutdown like cancel.
    pub fn pause(env: Env) -> Result<(), Error> {
        let config = Self::config(&env)?;
        config.creator.require_auth();

        if env.storage().instance().get::<_, bool>(&Key::Paused) == Some(true) {
            return Err(Error::Paused);
        }
        if env.storage().instance().get::<_, bool>(&Key::Cancelled) == Some(true) {
            return Err(Error::Cancelled);
        }

        env.storage().instance().set(&Key::Paused, &true);
        Paused { by: config.creator }.publish(&env);
        Ok(())
    }

    /// Lift the pause and resume normal operation.
    /// Only the creator may unpause.
    pub fn unpause(env: Env) -> Result<(), Error> {
        let config = Self::config(&env)?;
        config.creator.require_auth();

        if env.storage().instance().get::<_, bool>(&Key::Paused) != Some(true) {
            return Ok(()); // Already unpaused, no-op
        }

        env.storage().instance().remove(&Key::Paused);
        Unpaused { by: config.creator }.publish(&env);
        Ok(())
    }

    // ---- views ----

    pub fn config(env: &Env) -> Result<ProgrammeConfig, Error> {
        env.storage()
            .instance()
            .get(&Key::Config)
            .ok_or(Error::NotAuthorized)
    }

    pub fn get_config(env: Env) -> Result<ProgrammeConfig, Error> {
        Self::config(&env)
    }

    /// Whether the programme is paused. Readable so a caller can tell an
    /// emergency stop apart from an ordinary phase refusal.
    pub fn is_paused(env: Env) -> bool {
        env.storage().instance().get::<_, bool>(&Key::Paused) == Some(true)
    }

    pub fn phase(env: &Env) -> Result<Phase, Error> {
        if env.storage().instance().get::<_, bool>(&Key::Cancelled) == Some(true) {
            return Ok(Phase::Cancelled);
        }
        let config = Self::config(env)?;
        let now = env.ledger().timestamp();
        Ok(if now < config.apply_deadline {
            Phase::Open
        } else if now < config.review_deadline {
            Phase::Review
        } else {
            Phase::Settled
        })
    }

    pub fn get_phase(env: Env) -> Result<Phase, Error> {
        Self::phase(&env)
    }

    pub fn get_application(env: Env, applicant: Address) -> Result<Application, Error> {
        env.storage()
            .persistent()
            .get(&Key::Application(applicant))
            .ok_or(Error::ApplicationNotFound)
    }

    pub fn get_award(env: Env, recipient: Address) -> Result<Award, Error> {
        env.storage()
            .persistent()
            .get(&Key::Award(recipient))
            .ok_or(Error::AwardNotFound)
    }

    pub fn contributed_by(env: Env, donor: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&Key::Donor(donor))
            .unwrap_or(0)
    }

    pub fn total_contributed(env: Env) -> i128 {
        env.storage().instance().get(&Key::Contributed).unwrap_or(0)
    }

    pub fn total_granted(env: Env) -> i128 {
        env.storage().instance().get(&Key::Granted).unwrap_or(0)
    }

    pub fn total_released(env: Env) -> i128 {
        env.storage().instance().get(&Key::Released).unwrap_or(0)
    }

    pub fn total_refunded(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&Key::RefundedTotal)
            .unwrap_or(0)
    }

    pub fn total_swept(env: Env) -> i128 {
        env.storage().instance().get(&Key::SweptTotal).unwrap_or(0)
    }

    /// Escrowed funds this recipient may still direct.
    pub fn allocation_of(env: Env, recipient: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&Key::Allocation(recipient))
            .unwrap_or(0)
    }

    pub fn is_payee(env: Env, payee: Address) -> bool {
        env.storage().persistent().has(&Key::Payee(payee))
    }

    pub fn is_verifier(env: Env, addr: Address) -> bool {
        env.storage().persistent().has(&Key::Verifier(addr))
    }

    /// Whether this attestation has already unlocked a tranche.
    pub fn is_spent(env: Env, attestation: BytesN<32>) -> bool {
        env.storage().persistent().has(&Key::Used(attestation))
    }

    pub fn is_reviewer(env: Env, addr: Address) -> bool {
        env.storage().persistent().has(&Key::Reviewer(addr))
    }

    /// Contributions less the protocol fee — what is actually available to award.
    pub fn budget(env: Env) -> Result<i128, Error> {
        let config = Self::config(&env)?;
        Self::available(&env, &config)
    }

    /// The protocol's cut, computed from contributions rather than held back at
    /// contribution time so a donor's receipt matches what they sent.
    pub fn fee(env: Env) -> Result<i128, Error> {
        let config = Self::config(&env)?;
        let total: i128 = env.storage().instance().get(&Key::Contributed).unwrap_or(0);
        Ok(total * config.fee_bps as i128 / BPS_DENOMINATOR)
    }

    fn available(env: &Env, config: &ProgrammeConfig) -> Result<i128, Error> {
        let total: i128 = env.storage().instance().get(&Key::Contributed).unwrap_or(0);
        let fee = total
            .checked_mul(config.fee_bps as i128)
            .ok_or(Error::Overflow)?
            / BPS_DENOMINATOR;
        Ok(total - fee)
    }

    fn require_phase(env: &Env, expected: Phase) -> Result<(), Error> {
        let actual = Self::phase(env)?;
        if actual == Phase::Cancelled {
            return Err(Error::Cancelled);
        }
        if actual != expected {
            return Err(Error::WrongPhase);
        }
        Ok(())
    }
}

#[cfg(test)]
mod test;
