import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}




/**
 * Where a tranche is paid, in descending order of how hard the restriction is
 * to circumvent.
 * 
 * Variants carry no explicit discriminants on purpose: an enum with them is
 * encoded numerically, so callers and generated bindings must pass `3` rather
 * than `"Allocated"`. Symbolic variants cost a few bytes per award and save
 * every caller from a lookup table.
 */
export type Mode = {tag: "Direct", values: void} | {tag: "Allocated", values: void} | {tag: "Restricted", values: void} | {tag: "Open", values: void};


export interface Award {
  /**
 * What reviewers settled on. Never more than `requested`.
 */
granted: i128;
  mode: Mode;
  payee: string;
  recipient: string;
  released: i128;
  tranches: u32;
  tranches_released: u32;
}

export const Errors = {
  1: {message:"NotAuthorized"},
  /**
   * The action does not belong to the programme's current phase.
   */
  2: {message:"WrongPhase"},
  3: {message:"InvalidAmount"},
  4: {message:"InvalidDeadlines"},
  5: {message:"InvalidQuorum"},
  6: {message:"FeeTooHigh"},
  7: {message:"NoReviewers"},
  8: {message:"ApplicationNotFound"},
  9: {message:"AlreadyApplied"},
  10: {message:"AlreadyReviewed"},
  /**
   * Approving more than the applicant asked for.
   */
  11: {message:"ExceedsRequested"},
  /**
   * Not enough reviewers have voted to settle this application yet.
   */
  12: {message:"QuorumNotReached"},
  13: {message:"AlreadyFinalized"},
  /**
   * The remaining budget cannot cover this award.
   */
  14: {message:"InsufficientBudget"},
  15: {message:"Overflow"},
  16: {message:"Cancelled"},
  /**
   * A programme with money in it, or awards made, cannot be cancelled.
   */
  17: {message:"NotCancellable"},
  18: {message:"NoVerifiers"},
  19: {message:"AwardNotFound"},
  20: {message:"AwardFullyReleased"},
  /**
   * The attestation is missing, revoked, expired, or is not a claim by this
   * attester about this recipient under this programme's schema.
   */
  21: {message:"AttestationInvalid"},
  /**
   * One proof unlocks one tranche; this one is spent.
   */
  22: {message:"AttestationAlreadyUsed"},
  23: {message:"ReleaseWindowClosed"},
  24: {message:"FeeAlreadySwept"},
  25: {message:"RefundsNotOpen"},
  26: {message:"AlreadyRefunded"},
  27: {message:"NothingToRefund"},
  /**
   * The grace period for donors to claim refunds has not elapsed.
   */
  28: {message:"SweepNotOpen"},
  29: {message:"NothingToSweep"},
  /**
   * The destination is not a payee this programme has verified.
   */
  30: {message:"PayeeNotVerified"},
  31: {message:"AlreadyPayee"},
  32: {message:"NotPayee"},
  /**
   * The recipient has no allocation, or not enough of one.
   */
  33: {message:"InsufficientAllocation"},
  /**
   * A `Restricted` award was released to a wallet with no policy installed.
   */
  34: {message:"PolicyNotInstalled"},
  /**
   * Allocations can no longer be directed once the sweep window opens.
   */
  35: {message:"SpendWindowClosed"},
  /**
   * The batch exceeds the maximum allowed size.
   */
  36: {message:"BatchTooLarge"},
  /**
   * The application has been withdrawn.
   */
  37: {message:"Withdrawn"},
  /**
   * The award is below the programme's configured minimum and cannot be finalised.
   */
  38: {message:"BelowMinimumAward"},
  /**
   * The programme is paused and this operation cannot proceed.
   */
  39: {message:"Paused"}
}

export type Phase = {tag: "Open", values: void} | {tag: "Review", values: void} | {tag: "Settled", values: void} | {tag: "Cancelled", values: void};












export interface Application {
  applicant: string;
  finalized: boolean;
  metadata_hash: Buffer;
  requested: i128;
  submitted_at: u64;
  /**
 * Approved amounts, kept in ascending order so the median is a lookup.
 */
votes: Array<i128>;
  withdrawn: boolean;
}










/**
 * A recipient's accumulated track record.
 * 
 * Written by `record`, returned to any contract that credits it, and read by
 * programmes underwriting a repeat applicant.
 */
export interface Standing {
  first_seen: u64;
  /**
 * Hash chain over every credit, in order. Genesis is all zeroes; each
 * credit sets `root = sha256(root ‖ programme ‖ amount ‖ attestation ‖ ts)`.
 * Lets anyone verify a full off-chain history against on-chain state.
 */
history_root: Buffer;
  last_updated: u64;
  /**
 * Distinct programmes this recipient has been credited under.
 */
programmes: u32;
  subject: string;
  total_received: i128;
  /**
 * Tranches released to them, across all programmes.
 */
tranches: u32;
}


/**
 * Everything a programme is constructed from.
 * 
 * Grouped into a struct rather than passed as a dozen positional arguments —
 * at that width a caller transposing `review_deadline` and `release_deadline`,
 * or `quorum` and `tranches`, produces a valid-looking programme that behaves
 * wrongly, and the type system says nothing.
 * 
 * Lives here because the registry constructs it and the programme consumes it.
 */
export interface ProgrammeConfig {
  /**
 * Applications close here.
 */
apply_deadline: u64;
  /**
 * Attestation registry that tranche conditions are verified against.
 */
attest: string;
  creator: string;
  fee_bps: u32;
  metadata_hash: Buffer;
  /**
 * Minimum award amount below which finalisation is refused. Prevents awards
 * smaller than the fee taken from them, or so small that splitting into
 * tranches produces payments worth less than the transaction cost.
 */
minimum_award: i128;
  /**
 * Policy signer contract, consulted before a `Restricted` tranche is paid
 * into a recipient's wallet.
 */
policy: string;
  /**
 * Reviewer votes needed before an application can be finalised.
 */
quorum: u32;
  /**
 * Standing contract credited on each release.
 */
record: string;
  /**
 * Tranches stop releasing here, and whatever is left becomes refundable.
 */
release_deadline: u64;
  /**
 * Reviews close here.
 */
review_deadline: u64;
  /**
 * The single schema whose attestations unlock this programme's tranches.
 */
schema: Buffer;
  /**
 * Refunds nobody claimed sweep to the treasury here.
 * 
 * Set per programme rather than fixed protocol-wide: a three-month student
 * bursary and a three-year infrastructure grant have very different ideas
 * about how long is long enough to wait for a donor to come back.
 */
sweep_deadline: u64;
  /**
 * The asset being distributed, as a Stellar Asset Contract address.
 */
token: string;
  tranches: u32;
  treasury: string;
}

export interface Client {
  /**
   * Construct and simulate a fee transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The protocol's cut, computed from contributions rather than held back at
   * contribution time so a donor's receipt matches what they sent.
   */
  fee: (options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a apply transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Ask for what you actually need. `metadata_hash` points at the proposal;
   * the payload lives wherever the parties agree, so a pinning service being
   * down cannot block an application.
   */
  apply: ({applicant, requested, metadata_hash}: {applicant: string, requested: i128, metadata_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a pause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Emergency pause: temporarily halt money-forward operations while leaving
   * refund and sweep paths open so donors are never trapped.
   * 
   * Covers: contribute, apply, review, finalize, spend, release.
   * Does NOT cover: refund, sweep_fee, sweep_unclaimed (donors must always
   * be able to reclaim their money, even during an emergency).
   * 
   * Only the creator may pause. This is deliberate: the creator funds and
   * oversees the programme, and pausing is a reversible containment action,
   * not a permanent shutdown like cancel.
   */
  pause: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a phase transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  phase: (options?: MethodOptions) => Promise<AssembledTransaction<Result<Phase>>>

  /**
   * Construct and simulate a spend transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Direct part of an allocation to a verified payee.
   * 
   * This is what gives an `Allocated` recipient agency: they choose which
   * payee, when, and how much, without ever holding funds that could reach
   * anywhere else. The money moves from escrow straight to the payee.
   */
  spend: ({recipient, payee, amount}: {recipient: string, payee: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a budget transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Contributions less the protocol fee — what is actually available to award.
   */
  budget: (options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a cancel transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Abandon a programme before any tranche has reached a recipient.
   * 
   * Once money has been released, those payouts are final and the programme
   * cannot be unwound. Before that, every unspent token is still in the
   * contract and belongs to the donors, so stepping back and returning it is
   * the right call rather than stranding someone else's money. Cancelling
   * opens refunds immediately (see [`Programme::refund`]), so a donor need
   * not wait out a release deadline that no longer means anything.
   */
  cancel: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  config: (options?: MethodOptions) => Promise<AssembledTransaction<Result<ProgrammeConfig>>>

  /**
   * Construct and simulate a refund transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Reclaim a proportional share of whatever was never paid out.
   * 
   * Covers both money no one was awarded and money awarded but never
   * released — a recipient who never produced a proof leaves their tranches
   * in the pool, and after the release window those go back to the people who
   * put them in rather than sitting stranded.
   */
  refund: ({donor}: {donor: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a review transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Approve an amount up to what was requested. A reviewer who thinks the
   * application should be rejected simply does not vote — there is no
   * "approve zero", because a zero-value award is just a rejection with extra
   * storage.
   * 
   * A reviewer can amend their vote before finalisation by calling this
   * again with a different amount. The sorted order is preserved and quorum
   * still counts each reviewer once.
   */
  review: ({reviewer, applicant, approved}: {reviewer: string, applicant: string, approved: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a release transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Release one tranche against a proof that the condition was met.
   * 
   * Permissionless to call, because everything that decides the outcome is
   * already on-chain: the award, the trusted verifier set, and an attestation
   * the verifier already signed. Requiring a privileged trigger would let
   * whoever holds it withhold money a recipient has already earned.
   * 
   * `attester` names which trusted verifier is being relied on. The programme
   * checks it trusts them; the attestation registry checks the claim really
   * is theirs, really is about this recipient, and really is under this
   * programme's schema.
   */
  release: ({recipient, attestation, attester}: {recipient: string, attestation: Buffer, attester: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a unpause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Lift the pause and resume normal operation.
   * Only the creator may unpause.
   */
  unpause: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a finalize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Settle an application into an award once quorum is in. Permissionless to
   * call: the outcome is already determined by the votes, and requiring a
   * privileged party to trigger it would let them strand an applicant.
   * 
   * `payee` is where tranches are paid. In [`Mode::Direct`] that is a verified
   * institution rather than the recipient.
   * 
   * When the programme is oversubscribed, being permissionless means calling
   * order decides who is funded — see "Oversubscription" in the module docs
   * for what is and is not guaranteed about that.
   */
  finalize: ({applicant, payee, mode}: {applicant: string, payee: string, mode: Mode}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Award>>>

  /**
   * Construct and simulate a is_payee transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_payee: ({payee}: {payee: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a is_spent transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Whether this attestation has already unlocked a tranche.
   */
  is_spent: ({attestation}: {attestation: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a withdraw transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Withdraw an application before finalisation. Withdrawal is final for
   * this programme — the applicant may not reapply. The application record
   * is marked, not deleted, so history stays auditable. Votes already cast
   * are left in place but can never produce an award.
   */
  withdraw: ({applicant}: {applicant: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_award transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_award: ({recipient}: {recipient: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Award>>>

  /**
   * Construct and simulate a get_phase transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_phase: (options?: MethodOptions) => Promise<AssembledTransaction<Result<Phase>>>

  /**
   * Construct and simulate a is_paused transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Whether the programme is paused. Readable so a caller can tell an
   * emergency stop apart from an ordinary phase refusal.
   */
  is_paused: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a keepalive transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Keep the contract's long-lived entries from being archived.
   * 
   * Permissionless, mirroring `keepalive` on the attestation and standing
   * contracts: anyone may pay the gas to extend TTL so a programme's history,
   * and the money still tied to it, does not silently rot away.
   * 
   * `subject` scopes the bump to the entries one observer cares about — an
   * application, its award, any escrowed allocation, and that person's
   * contribution and refund marker. These are exactly the entries that have
   * no write of their own once the programme settles, so they are the ones
   * most likely to archive unnoticed. The contract-wide instance state
   * (config, the running totals, the cancellation flag) is bumped on every
   * call as well, since views and refunds depend on it and it has no subject.
   * 
   * Bumping is capped at [`BUMP_LEDGERS`] from now, so calling this in a loop
   * cannot push an entry's TTL out without bound — there is no griefing path.
   */
  keepalive: ({subject}: {subject: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a sweep_fee transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Send the protocol's cut to the treasury. Permissionless and once only.
   * 
   * The fee was never part of the awardable budget, so this moves money that
   * was never promised to anyone. It waits for contributions to close so the
   * amount cannot change underneath it.
   */
  sweep_fee: (options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a contribute transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  contribute: ({donor, amount}: {donor: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a deny_payee transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Withdraw a payee. Allocations already directed to them are untouched —
   * this stops future payments, it does not claw back past ones.
   */
  deny_payee: ({payee}: {payee: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_config: (options?: MethodOptions) => Promise<AssembledTransaction<Result<ProgrammeConfig>>>

  /**
   * Construct and simulate a allow_payee transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Verify a payee as a legitimate destination for this programme's money.
   * 
   * Managed by the creator rather than the reviewers: reviewers judge whether
   * an applicant deserves funding, which is a different question from whether
   * a given school actually exists.
   */
  allow_payee: ({payee}: {payee: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a deny_payees transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Remove multiple payees in a single call. Payees not currently verified
   * are skipped, not rejected.
   */
  deny_payees: ({payees}: {payees: Array<string>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a is_reviewer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_reviewer: ({addr}: {addr: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a is_verifier transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_verifier: ({addr}: {addr: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a allow_payees transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Add multiple verified payees in a single call. Duplicates within the
   * batch or against already-verified payees are skipped, not rejected — the
   * caller is batching for convenience, not precision.
   */
  allow_payees: ({payees}: {payees: Array<string>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a allocation_of transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Escrowed funds this recipient may still direct.
   */
  allocation_of: ({recipient}: {recipient: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a total_granted transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  total_granted: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a contributed_by transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  contributed_by: ({donor}: {donor: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a total_released transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  total_released: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a get_application transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_application: ({applicant}: {applicant: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Application>>>

  /**
   * Construct and simulate a sweep_unclaimed transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Send whatever no donor ever came back for to the treasury.
   * 
   * Refunds have to be claimed individually, and in practice many will not
   * be: a diaspora donor who gave the equivalent of five dollars is not going
   * to sign a transaction to recover three. Without this the remainder sits
   * in the contract permanently, which serves nobody.
   * 
   * The grace period is `sweep_deadline`, set per programme rather than fixed
   * protocol-wide — a term-length bursary and a multi-year infrastructure
   * grant disagree about how long is long enough to wait. Permissionless, so
   * nobody has to be trusted to remember.
   */
  sweep_unclaimed: (options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a total_contributed transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  total_contributed: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {config, reviewers, verifiers}: {config: ProgrammeConfig, reviewers: Array<string>, verifiers: Array<string>},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({config, reviewers, verifiers}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAgAAAV1XaGVyZSBhIHRyYW5jaGUgaXMgcGFpZCwgaW4gZGVzY2VuZGluZyBvcmRlciBvZiBob3cgaGFyZCB0aGUgcmVzdHJpY3Rpb24gaXMKdG8gY2lyY3VtdmVudC4KClZhcmlhbnRzIGNhcnJ5IG5vIGV4cGxpY2l0IGRpc2NyaW1pbmFudHMgb24gcHVycG9zZTogYW4gZW51bSB3aXRoIHRoZW0gaXMKZW5jb2RlZCBudW1lcmljYWxseSwgc28gY2FsbGVycyBhbmQgZ2VuZXJhdGVkIGJpbmRpbmdzIG11c3QgcGFzcyBgM2AgcmF0aGVyCnRoYW4gYCJBbGxvY2F0ZWQiYC4gU3ltYm9saWMgdmFyaWFudHMgY29zdCBhIGZldyBieXRlcyBwZXIgYXdhcmQgYW5kIHNhdmUKZXZlcnkgY2FsbGVyIGZyb20gYSBsb29rdXAgdGFibGUuAAAAAAAAAAAAAARNb2RlAAAABAAAAAAAAACPUGFpZCBzdHJhaWdodCB0byBhIHZlcmlmaWVkIHBheWVlIGNob3NlbiBhdCBhd2FyZCB0aW1lIOKAlCBhIHNjaG9vbCwgY2xpbmljCm9yIHN1cHBsaWVyLiBUaGUgcmVjaXBpZW50IG5ldmVyIGhvbGRzIHRoZSBmdW5kcyBhbmQgbmV2ZXIgY2hvb3Nlcy4AAAAABkRpcmVjdAAAAAAAAAAAAbtIZWxkIGluIGVzY3JvdyBhbmQgZGlyZWN0ZWQgYnkgdGhlIHJlY2lwaWVudCwgd2hvIHBpY2tzIHdoaWNoIHZlcmlmaWVkCnBheWVlIHJlY2VpdmVzIGl0IGFuZCB3aGVuLgoKVGhlIHN0cm9uZ2VzdCBndWFyYW50ZWUgYXZhaWxhYmxlLCBiZWNhdXNlIGl0IGRlcGVuZHMgb24gbm90aGluZyBvdXRzaWRlCnRoaXMgY29udHJhY3QuIGBSZXN0cmljdGVkYCByZWxpZXMgb24gYSB3YWxsZXQgYmVpbmcgY29uZmlndXJlZApjb3JyZWN0bHk7IGEgbWlzY29uZmlndXJlZCB3YWxsZXQgcXVpZXRseSBkb3duZ3JhZGVzIHRvIG5vIHJlc3RyaWN0aW9uIGF0CmFsbC4gSGVyZSB0aGVyZSBpcyBubyB3YWxsZXQgdG8gbWlzY29uZmlndXJlIOKAlCBmdW5kcyBjYW5ub3QgcmVhY2ggYW55b25lCnVudmVyaWZpZWQgYmVjYXVzZSB0aGV5IG5ldmVyIGxlYXZlIGVzY3JvdyB1bnRpbCB0aGV5IGRvLgAAAAAJQWxsb2NhdGVkAAAAAAAAAAAAAhtQYWlkIGludG8gdGhlIHJlY2lwaWVudCdzIHNtYXJ0IHdhbGxldCwgd2hlcmUgYSBwb2xpY3kgc2lnbmVyIGxpbWl0cwpvbndhcmQgc3BlbmRpbmcgdG8gdmVyaWZpZWQgZGVzdGluYXRpb25zLgoKV2Vha2VyIHRoYW4gaXQgbG9va3MuIEEgcG9saWN5IGNvbnN0cmFpbnMgb25lIHNpZ25lciwgbm90IHRoZSB3YWxsZXQ6IGEKcmVjaXBpZW50IGhvbGRpbmcgYW4gdW5yZXN0cmljdGVkIGFkbWluIHNpZ25lciBjYW4gYXV0aG9yaXNlIGFyb3VuZCBpdC4KR2VudWluZSBlbmZvcmNlbWVudCBuZWVkcyB0aGUgd2FsbGV0J3Mgb3duIGBTaWduZXJMaW1pdHNgIHRvIGNvbmZpbmUgdGhlCmZ1bmRlZCBzaWduZXIgdG8gdGhlIHBvbGljeSwgd2hpY2ggaXMgYSBkZXBsb3ltZW50IHN0ZXAgdGhpcyBjb250cmFjdApjYW5ub3QgcGVyZm9ybS4gUmVsZWFzZXMgaGVyZSB2ZXJpZnkgdGhlIHBvbGljeSBpcyBhdCBsZWFzdCBpbnN0YWxsZWQsCndoaWNoIGJvdW5kcyBhIG1pc2NvbmZpZ3VyYXRpb24gdG8gb25lIHRyYW5jaGUgcmF0aGVyIHRoYW4gdGhlIGF3YXJkLgAAAAAKUmVzdHJpY3RlZAAAAAAAAAAAACpQYWlkIHRvIHRoZSByZWNpcGllbnQgd2l0aCBubyByZXN0cmljdGlvbi4AAAAAAARPcGVu",
        "AAAAAQAAAAAAAAAAAAAABUF3YXJkAAAAAAAABwAAADdXaGF0IHJldmlld2VycyBzZXR0bGVkIG9uLiBOZXZlciBtb3JlIHRoYW4gYHJlcXVlc3RlZGAuAAAAAAdncmFudGVkAAAAAAsAAAAAAAAABG1vZGUAAAfQAAAABE1vZGUAAAAAAAAABXBheWVlAAAAAAAAEwAAAAAAAAAJcmVjaXBpZW50AAAAAAAAEwAAAAAAAAAIcmVsZWFzZWQAAAALAAAAAAAAAAh0cmFuY2hlcwAAAAQAAAAAAAAAEXRyYW5jaGVzX3JlbGVhc2VkAAAAAAAABA==",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAAJwAAAAAAAAANTm90QXV0aG9yaXplZAAAAAAAAAEAAAA8VGhlIGFjdGlvbiBkb2VzIG5vdCBiZWxvbmcgdG8gdGhlIHByb2dyYW1tZSdzIGN1cnJlbnQgcGhhc2UuAAAACldyb25nUGhhc2UAAAAAAAIAAAAAAAAADUludmFsaWRBbW91bnQAAAAAAAADAAAAAAAAABBJbnZhbGlkRGVhZGxpbmVzAAAABAAAAAAAAAANSW52YWxpZFF1b3J1bQAAAAAAAAUAAAAAAAAACkZlZVRvb0hpZ2gAAAAAAAYAAAAAAAAAC05vUmV2aWV3ZXJzAAAAAAcAAAAAAAAAE0FwcGxpY2F0aW9uTm90Rm91bmQAAAAACAAAAAAAAAAOQWxyZWFkeUFwcGxpZWQAAAAAAAkAAAAAAAAAD0FscmVhZHlSZXZpZXdlZAAAAAAKAAAALEFwcHJvdmluZyBtb3JlIHRoYW4gdGhlIGFwcGxpY2FudCBhc2tlZCBmb3IuAAAAEEV4Y2VlZHNSZXF1ZXN0ZWQAAAALAAAAP05vdCBlbm91Z2ggcmV2aWV3ZXJzIGhhdmUgdm90ZWQgdG8gc2V0dGxlIHRoaXMgYXBwbGljYXRpb24geWV0LgAAAAAQUXVvcnVtTm90UmVhY2hlZAAAAAwAAAAAAAAAEEFscmVhZHlGaW5hbGl6ZWQAAAANAAAALVRoZSByZW1haW5pbmcgYnVkZ2V0IGNhbm5vdCBjb3ZlciB0aGlzIGF3YXJkLgAAAAAAABJJbnN1ZmZpY2llbnRCdWRnZXQAAAAAAA4AAAAAAAAACE92ZXJmbG93AAAADwAAAAAAAAAJQ2FuY2VsbGVkAAAAAAAAEAAAAEJBIHByb2dyYW1tZSB3aXRoIG1vbmV5IGluIGl0LCBvciBhd2FyZHMgbWFkZSwgY2Fubm90IGJlIGNhbmNlbGxlZC4AAAAAAA5Ob3RDYW5jZWxsYWJsZQAAAAAAEQAAAAAAAAALTm9WZXJpZmllcnMAAAAAEgAAAAAAAAANQXdhcmROb3RGb3VuZAAAAAAAABMAAAAAAAAAEkF3YXJkRnVsbHlSZWxlYXNlZAAAAAAAFAAAAIRUaGUgYXR0ZXN0YXRpb24gaXMgbWlzc2luZywgcmV2b2tlZCwgZXhwaXJlZCwgb3IgaXMgbm90IGEgY2xhaW0gYnkgdGhpcwphdHRlc3RlciBhYm91dCB0aGlzIHJlY2lwaWVudCB1bmRlciB0aGlzIHByb2dyYW1tZSdzIHNjaGVtYS4AAAASQXR0ZXN0YXRpb25JbnZhbGlkAAAAAAAVAAAAMU9uZSBwcm9vZiB1bmxvY2tzIG9uZSB0cmFuY2hlOyB0aGlzIG9uZSBpcyBzcGVudC4AAAAAAAAWQXR0ZXN0YXRpb25BbHJlYWR5VXNlZAAAAAAAFgAAAAAAAAATUmVsZWFzZVdpbmRvd0Nsb3NlZAAAAAAXAAAAAAAAAA9GZWVBbHJlYWR5U3dlcHQAAAAAGAAAAAAAAAAOUmVmdW5kc05vdE9wZW4AAAAAABkAAAAAAAAAD0FscmVhZHlSZWZ1bmRlZAAAAAAaAAAAAAAAAA9Ob3RoaW5nVG9SZWZ1bmQAAAAAGwAAAD1UaGUgZ3JhY2UgcGVyaW9kIGZvciBkb25vcnMgdG8gY2xhaW0gcmVmdW5kcyBoYXMgbm90IGVsYXBzZWQuAAAAAAAADFN3ZWVwTm90T3BlbgAAABwAAAAAAAAADk5vdGhpbmdUb1N3ZWVwAAAAAAAdAAAAO1RoZSBkZXN0aW5hdGlvbiBpcyBub3QgYSBwYXllZSB0aGlzIHByb2dyYW1tZSBoYXMgdmVyaWZpZWQuAAAAABBQYXllZU5vdFZlcmlmaWVkAAAAHgAAAAAAAAAMQWxyZWFkeVBheWVlAAAAHwAAAAAAAAAITm90UGF5ZWUAAAAgAAAANlRoZSByZWNpcGllbnQgaGFzIG5vIGFsbG9jYXRpb24sIG9yIG5vdCBlbm91Z2ggb2Ygb25lLgAAAAAAFkluc3VmZmljaWVudEFsbG9jYXRpb24AAAAAACEAAABHQSBgUmVzdHJpY3RlZGAgYXdhcmQgd2FzIHJlbGVhc2VkIHRvIGEgd2FsbGV0IHdpdGggbm8gcG9saWN5IGluc3RhbGxlZC4AAAAAElBvbGljeU5vdEluc3RhbGxlZAAAAAAAIgAAAEJBbGxvY2F0aW9ucyBjYW4gbm8gbG9uZ2VyIGJlIGRpcmVjdGVkIG9uY2UgdGhlIHN3ZWVwIHdpbmRvdyBvcGVucy4AAAAAABFTcGVuZFdpbmRvd0Nsb3NlZAAAAAAAACMAAAArVGhlIGJhdGNoIGV4Y2VlZHMgdGhlIG1heGltdW0gYWxsb3dlZCBzaXplLgAAAAANQmF0Y2hUb29MYXJnZQAAAAAAACQAAAAjVGhlIGFwcGxpY2F0aW9uIGhhcyBiZWVuIHdpdGhkcmF3bi4AAAAACVdpdGhkcmF3bgAAAAAAACUAAABOVGhlIGF3YXJkIGlzIGJlbG93IHRoZSBwcm9ncmFtbWUncyBjb25maWd1cmVkIG1pbmltdW0gYW5kIGNhbm5vdCBiZSBmaW5hbGlzZWQuAAAAAAARQmVsb3dNaW5pbXVtQXdhcmQAAAAAAAAmAAAAOlRoZSBwcm9ncmFtbWUgaXMgcGF1c2VkIGFuZCB0aGlzIG9wZXJhdGlvbiBjYW5ub3QgcHJvY2VlZC4AAAAAAAZQYXVzZWQAAAAAACc=",
        "AAAAAgAAAAAAAAAAAAAABVBoYXNlAAAAAAAABAAAAAAAAAAAAAAABE9wZW4AAAAAAAAAAAAAAAZSZXZpZXcAAAAAAAAAAAAAAAAAB1NldHRsZWQAAAAAAAAAAAAAAAAJQ2FuY2VsbGVkAAAA",
        "AAAABQAAAAAAAAAAAAAABlBhdXNlZAAAAAAAAQAAAAZwYXVzZWQAAAAAAAEAAAAAAAAAAmJ5AAAAAAATAAAAAQAAAAI=",
        "AAAABQAAAAAAAAAAAAAAB0FwcGxpZWQAAAAAAQAAAAdhcHBsaWVkAAAAAAIAAAAAAAAACWFwcGxpY2FudAAAAAAAABMAAAABAAAAAAAAAAthcHBsaWNhdGlvbgAAAAfQAAAAC0FwcGxpY2F0aW9uAAAAAAAAAAAA",
        "AAAABQAAAAAAAAAAAAAAB0F3YXJkZWQAAAAAAQAAAAdhd2FyZGVkAAAAAAIAAAAAAAAACXJlY2lwaWVudAAAAAAAABMAAAABAAAAAAAAAAVhd2FyZAAAAAAAB9AAAAAFQXdhcmQAAAAAAAAAAAAAAA==",
        "AAAABQAAAAAAAAAAAAAACERpcmVjdGVkAAAAAQAAAAdkaXJlY3RkAAAAAAQAAAAAAAAACXJlY2lwaWVudAAAAAAAABMAAAABAAAAAAAAAAVwYXllZQAAAAAAABMAAAABAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAAAAAAlyZW1haW5pbmcAAAAAAAALAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAACEZlZVN3ZXB0AAAAAQAAAANmZWUAAAAAAQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAA=",
        "AAAABQAAAAAAAAAAAAAACFJlZnVuZGVkAAAAAQAAAAhyZWZ1bmRlZAAAAAIAAAAAAAAABWRvbm9yAAAAAAAAEwAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAA",
        "AAAABQAAAAAAAAAAAAAACFJlbGVhc2VkAAAAAQAAAAhyZWxlYXNlZAAAAAUAAAAAAAAACXJlY2lwaWVudAAAAAAAABMAAAABAAAAAAAAAAVwYXllZQAAAAAAABMAAAABAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAAAAAAthdHRlc3RhdGlvbgAAAAPuAAAAIAAAAAAAAAAAAAAABWF3YXJkAAAAAAAH0AAAAAVBd2FyZAAAAAAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAACFJldmlld2VkAAAAAQAAAAhyZXZpZXdlZAAAAAMAAAAAAAAACWFwcGxpY2FudAAAAAAAABMAAAABAAAAAAAAAAhyZXZpZXdlcgAAABMAAAABAAAAAAAAAAhhcHByb3ZlZAAAAAsAAAAAAAAAAA==",
        "AAAABQAAAAAAAAAAAAAACFVucGF1c2VkAAAAAQAAAAh1bnBhdXNlZAAAAAEAAAAAAAAAAmJ5AAAAAAATAAAAAQAAAAI=",
        "AAAABQAAAN5BIHBlcm1pc3Npb25sZXNzIG51ZGdlIHRoYXQga2VlcHMgdGhlIGNvbnRyYWN0J3MgbG9uZy1saXZlZCBlbnRyaWVzIGZyb20KYmVpbmcgYXJjaGl2ZWQuIFNlZSBbYFByb2dyYW1tZTo6a2VlcGFsaXZlYF0gZm9yIHRoZSByYXRpb25hbGU7IHRoZSBzdHJ1Y3QKZXhpc3RzIHNvIHRoZSBldmVudCBjYW4gYmUgcHVibGlzaGVkIGhlcmUgdG9vIHdoZW4gdGhhdCBwYXRoIGlzIGV4ZXJjaXNlZC4AAAAAAAAAAAAJS2VwdEFsaXZlAAAAAAAAAQAAAARrZXB0AAAAAQAAAAAAAAAHc3ViamVjdAAAAAATAAAAAAAAAAA=",
        "AAAAAQAAAAAAAAAAAAAAC0FwcGxpY2F0aW9uAAAAAAcAAAAAAAAACWFwcGxpY2FudAAAAAAAABMAAAAAAAAACWZpbmFsaXplZAAAAAAAAAEAAAAAAAAADW1ldGFkYXRhX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAJcmVxdWVzdGVkAAAAAAAACwAAAAAAAAAMc3VibWl0dGVkX2F0AAAABgAAAERBcHByb3ZlZCBhbW91bnRzLCBrZXB0IGluIGFzY2VuZGluZyBvcmRlciBzbyB0aGUgbWVkaWFuIGlzIGEgbG9va3VwLgAAAAV2b3RlcwAAAAAAA+oAAAALAAAAAAAAAAl3aXRoZHJhd24AAAAAAAAB",
        "AAAABQAAAAAAAAAAAAAAC0NvbnRyaWJ1dGVkAAAAAAEAAAAHY29udHJpYgAAAAACAAAAAAAAAAVkb25vcgAAAAAAABMAAAABAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAA==",
        "AAAABQAAAAAAAAAAAAAAC1ZvdGVBbWVuZGVkAAAAAAEAAAAMdm90ZV9hbWVuZGVkAAAABAAAAAAAAAAJYXBwbGljYW50AAAAAAAAEwAAAAEAAAAAAAAACHJldmlld2VyAAAAEwAAAAEAAAAAAAAACHByZXZpb3VzAAAACwAAAAAAAAAAAAAACGFwcHJvdmVkAAAACwAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAADFBheWVlQ2hhbmdlZAAAAAEAAAAFcGF5ZWUAAAAAAAACAAAAAAAAAAVwYXllZQAAAAAAABMAAAABAAAAAAAAAAh2ZXJpZmllZAAAAAEAAAAAAAAAAA==",
        "AAAABQAAAAAAAAAAAAAADlVuY2xhaW1lZFN3ZXB0AAAAAAABAAAABXN3ZXB0AAAAAAAAAQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAA=",
        "AAAABQAAAkRFbWl0dGVkIG9uY2UsIGF0IGNvbnN0cnVjdGlvbiwgc28gYW4gb2JzZXJ2ZXIgcmVidWlsZGluZyBwcm9ncmFtbWUgaGlzdG9yeQpmcm9tIGV2ZW50cyBoYXMgYSBzdGFydGluZyBwb2ludC4gQ2FycmllcyB0aGUgZnVsbCB0ZXJtcyBhbiBvYnNlcnZlciBjYW5ub3QKb3RoZXJ3aXNlIGNoZWFwbHkgb2J0YWluIOKAlCB0aGUgZGVhZGxpbmVzLCBxdW9ydW0sIHRyYW5jaGVzLCBmZWUgYW5kIHRoZQphZGRyZXNzZXMgdGhlIHByb2dyYW1tZSBpcyB3aXJlZCB0by4gTWlycm9ycyB0aGUgZXhpc3RpbmcgY29udmVudGlvbiBvZgpwdWJsaXNoaW5nIHRoZSB3aG9sZSBzdHJ1Y3QgcmF0aGVyIHRoYW4gYSBwcm9qZWN0aW9uIG9mIGl0LgpOb3QgYXNzZXJ0ZWQgaW4gdGVzdHM6IHRoZSBTb3JvYmFuIHRlc3QgZW52aXJvbm1lbnQgZG9lcyBub3QgcmVjb3JkIGV2ZW50cwplbWl0dGVkIGR1cmluZyBjb25zdHJ1Y3Rpb24sIHdoZXRoZXIgdGhlIGNvbnRyYWN0IGlzIHJlZ2lzdGVyZWQgZGlyZWN0bHkgb3IKZGVwbG95ZWQgdGhyb3VnaCB0aGUgcmVnaXN0cnkuIFRoZSBldmVudCBpcyBlbWl0dGVkIG9uLWNoYWluIHJlZ2FyZGxlc3MuAAAAAAAAABBQcm9ncmFtbWVDcmVhdGVkAAAAAQAAAAdjcmVhdGVkAAAAAAEAAAAAAAAABmNvbmZpZwAAAAAH0AAAAA9Qcm9ncmFtbWVDb25maWcAAAAAAAAAAAA=",
        "AAAABQAAAAAAAAAAAAAAEUFsbG9jYXRpb25DaGFuZ2VkAAAAAAAAAQAAAAZhbGxvY2QAAAAAAAIAAAAAAAAACXJlY2lwaWVudAAAAAAAABMAAAABAAAAAAAAAAphbGxvY2F0aW9uAAAAAAALAAAAAAAAAAA=",
        "AAAABQAAAAAAAAAAAAAAElByb2dyYW1tZUNhbmNlbGxlZAAAAAAAAQAAAAljYW5jZWxsZWQAAAAAAAABAAAAAAAAAAJhdAAAAAAABgAAAAAAAAAA",
        "AAAABQAAAAAAAAAAAAAAFEFwcGxpY2F0aW9uV2l0aGRyYXduAAAAAQAAAAl3aXRoZHJhd24AAAAAAAABAAAAAAAAAAlhcHBsaWNhbnQAAAAAAAATAAAAAQAAAAA=",
        "AAAAAAAAAIdUaGUgcHJvdG9jb2wncyBjdXQsIGNvbXB1dGVkIGZyb20gY29udHJpYnV0aW9ucyByYXRoZXIgdGhhbiBoZWxkIGJhY2sgYXQKY29udHJpYnV0aW9uIHRpbWUgc28gYSBkb25vcidzIHJlY2VpcHQgbWF0Y2hlcyB3aGF0IHRoZXkgc2VudC4AAAAAA2ZlZQAAAAAAAAAAAQAAA+kAAAALAAAAAw==",
        "AAAAAAAAALJBc2sgZm9yIHdoYXQgeW91IGFjdHVhbGx5IG5lZWQuIGBtZXRhZGF0YV9oYXNoYCBwb2ludHMgYXQgdGhlIHByb3Bvc2FsOwp0aGUgcGF5bG9hZCBsaXZlcyB3aGVyZXZlciB0aGUgcGFydGllcyBhZ3JlZSwgc28gYSBwaW5uaW5nIHNlcnZpY2UgYmVpbmcKZG93biBjYW5ub3QgYmxvY2sgYW4gYXBwbGljYXRpb24uAAAAAAAFYXBwbHkAAAAAAAADAAAAAAAAAAlhcHBsaWNhbnQAAAAAAAATAAAAAAAAAAlyZXF1ZXN0ZWQAAAAAAAALAAAAAAAAAA1tZXRhZGF0YV9oYXNoAAAAAAAD7gAAACAAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAfZFbWVyZ2VuY3kgcGF1c2U6IHRlbXBvcmFyaWx5IGhhbHQgbW9uZXktZm9yd2FyZCBvcGVyYXRpb25zIHdoaWxlIGxlYXZpbmcKcmVmdW5kIGFuZCBzd2VlcCBwYXRocyBvcGVuIHNvIGRvbm9ycyBhcmUgbmV2ZXIgdHJhcHBlZC4KCkNvdmVyczogY29udHJpYnV0ZSwgYXBwbHksIHJldmlldywgZmluYWxpemUsIHNwZW5kLCByZWxlYXNlLgpEb2VzIE5PVCBjb3ZlcjogcmVmdW5kLCBzd2VlcF9mZWUsIHN3ZWVwX3VuY2xhaW1lZCAoZG9ub3JzIG11c3QgYWx3YXlzCmJlIGFibGUgdG8gcmVjbGFpbSB0aGVpciBtb25leSwgZXZlbiBkdXJpbmcgYW4gZW1lcmdlbmN5KS4KCk9ubHkgdGhlIGNyZWF0b3IgbWF5IHBhdXNlLiBUaGlzIGlzIGRlbGliZXJhdGU6IHRoZSBjcmVhdG9yIGZ1bmRzIGFuZApvdmVyc2VlcyB0aGUgcHJvZ3JhbW1lLCBhbmQgcGF1c2luZyBpcyBhIHJldmVyc2libGUgY29udGFpbm1lbnQgYWN0aW9uLApub3QgYSBwZXJtYW5lbnQgc2h1dGRvd24gbGlrZSBjYW5jZWwuAAAAAAAFcGF1c2UAAAAAAAAAAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAAAAAAAFcGhhc2UAAAAAAAAAAAAAAQAAA+kAAAfQAAAABVBoYXNlAAAAAAAAAw==",
        "AAAAAAAAAQFEaXJlY3QgcGFydCBvZiBhbiBhbGxvY2F0aW9uIHRvIGEgdmVyaWZpZWQgcGF5ZWUuCgpUaGlzIGlzIHdoYXQgZ2l2ZXMgYW4gYEFsbG9jYXRlZGAgcmVjaXBpZW50IGFnZW5jeTogdGhleSBjaG9vc2Ugd2hpY2gKcGF5ZWUsIHdoZW4sIGFuZCBob3cgbXVjaCwgd2l0aG91dCBldmVyIGhvbGRpbmcgZnVuZHMgdGhhdCBjb3VsZCByZWFjaAphbnl3aGVyZSBlbHNlLiBUaGUgbW9uZXkgbW92ZXMgZnJvbSBlc2Nyb3cgc3RyYWlnaHQgdG8gdGhlIHBheWVlLgAAAAAAAAVzcGVuZAAAAAAAAAMAAAAAAAAACXJlY2lwaWVudAAAAAAAABMAAAAAAAAABXBheWVlAAAAAAAAEwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAQAAA+kAAAALAAAAAw==",
        "AAAAAAAAAExDb250cmlidXRpb25zIGxlc3MgdGhlIHByb3RvY29sIGZlZSDigJQgd2hhdCBpcyBhY3R1YWxseSBhdmFpbGFibGUgdG8gYXdhcmQuAAAABmJ1ZGdldAAAAAAAAAAAAAEAAAPpAAAACwAAAAM=",
        "AAAAAAAAAeFBYmFuZG9uIGEgcHJvZ3JhbW1lIGJlZm9yZSBhbnkgdHJhbmNoZSBoYXMgcmVhY2hlZCBhIHJlY2lwaWVudC4KCk9uY2UgbW9uZXkgaGFzIGJlZW4gcmVsZWFzZWQsIHRob3NlIHBheW91dHMgYXJlIGZpbmFsIGFuZCB0aGUgcHJvZ3JhbW1lCmNhbm5vdCBiZSB1bndvdW5kLiBCZWZvcmUgdGhhdCwgZXZlcnkgdW5zcGVudCB0b2tlbiBpcyBzdGlsbCBpbiB0aGUKY29udHJhY3QgYW5kIGJlbG9uZ3MgdG8gdGhlIGRvbm9ycywgc28gc3RlcHBpbmcgYmFjayBhbmQgcmV0dXJuaW5nIGl0IGlzCnRoZSByaWdodCBjYWxsIHJhdGhlciB0aGFuIHN0cmFuZGluZyBzb21lb25lIGVsc2UncyBtb25leS4gQ2FuY2VsbGluZwpvcGVucyByZWZ1bmRzIGltbWVkaWF0ZWx5IChzZWUgW2BQcm9ncmFtbWU6OnJlZnVuZGBdKSwgc28gYSBkb25vciBuZWVkCm5vdCB3YWl0IG91dCBhIHJlbGVhc2UgZGVhZGxpbmUgdGhhdCBubyBsb25nZXIgbWVhbnMgYW55dGhpbmcuAAAAAAAABmNhbmNlbAAAAAAAAAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAAGY29uZmlnAAAAAAAAAAAAAQAAA+kAAAfQAAAAD1Byb2dyYW1tZUNvbmZpZwAAAAAD",
        "AAAAAAAAATxSZWNsYWltIGEgcHJvcG9ydGlvbmFsIHNoYXJlIG9mIHdoYXRldmVyIHdhcyBuZXZlciBwYWlkIG91dC4KCkNvdmVycyBib3RoIG1vbmV5IG5vIG9uZSB3YXMgYXdhcmRlZCBhbmQgbW9uZXkgYXdhcmRlZCBidXQgbmV2ZXIKcmVsZWFzZWQg4oCUIGEgcmVjaXBpZW50IHdobyBuZXZlciBwcm9kdWNlZCBhIHByb29mIGxlYXZlcyB0aGVpciB0cmFuY2hlcwppbiB0aGUgcG9vbCwgYW5kIGFmdGVyIHRoZSByZWxlYXNlIHdpbmRvdyB0aG9zZSBnbyBiYWNrIHRvIHRoZSBwZW9wbGUgd2hvCnB1dCB0aGVtIGluIHJhdGhlciB0aGFuIHNpdHRpbmcgc3RyYW5kZWQuAAAABnJlZnVuZAAAAAAAAQAAAAAAAAAFZG9ub3IAAAAAAAATAAAAAQAAA+kAAAALAAAAAw==",
        "AAAAAAAAAYpBcHByb3ZlIGFuIGFtb3VudCB1cCB0byB3aGF0IHdhcyByZXF1ZXN0ZWQuIEEgcmV2aWV3ZXIgd2hvIHRoaW5rcyB0aGUKYXBwbGljYXRpb24gc2hvdWxkIGJlIHJlamVjdGVkIHNpbXBseSBkb2VzIG5vdCB2b3RlIOKAlCB0aGVyZSBpcyBubwoiYXBwcm92ZSB6ZXJvIiwgYmVjYXVzZSBhIHplcm8tdmFsdWUgYXdhcmQgaXMganVzdCBhIHJlamVjdGlvbiB3aXRoIGV4dHJhCnN0b3JhZ2UuCgpBIHJldmlld2VyIGNhbiBhbWVuZCB0aGVpciB2b3RlIGJlZm9yZSBmaW5hbGlzYXRpb24gYnkgY2FsbGluZyB0aGlzCmFnYWluIHdpdGggYSBkaWZmZXJlbnQgYW1vdW50LiBUaGUgc29ydGVkIG9yZGVyIGlzIHByZXNlcnZlZCBhbmQgcXVvcnVtCnN0aWxsIGNvdW50cyBlYWNoIHJldmlld2VyIG9uY2UuAAAAAAAGcmV2aWV3AAAAAAADAAAAAAAAAAhyZXZpZXdlcgAAABMAAAAAAAAACWFwcGxpY2FudAAAAAAAABMAAAAAAAAACGFwcHJvdmVkAAAACwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAkJSZWxlYXNlIG9uZSB0cmFuY2hlIGFnYWluc3QgYSBwcm9vZiB0aGF0IHRoZSBjb25kaXRpb24gd2FzIG1ldC4KClBlcm1pc3Npb25sZXNzIHRvIGNhbGwsIGJlY2F1c2UgZXZlcnl0aGluZyB0aGF0IGRlY2lkZXMgdGhlIG91dGNvbWUgaXMKYWxyZWFkeSBvbi1jaGFpbjogdGhlIGF3YXJkLCB0aGUgdHJ1c3RlZCB2ZXJpZmllciBzZXQsIGFuZCBhbiBhdHRlc3RhdGlvbgp0aGUgdmVyaWZpZXIgYWxyZWFkeSBzaWduZWQuIFJlcXVpcmluZyBhIHByaXZpbGVnZWQgdHJpZ2dlciB3b3VsZCBsZXQKd2hvZXZlciBob2xkcyBpdCB3aXRoaG9sZCBtb25leSBhIHJlY2lwaWVudCBoYXMgYWxyZWFkeSBlYXJuZWQuCgpgYXR0ZXN0ZXJgIG5hbWVzIHdoaWNoIHRydXN0ZWQgdmVyaWZpZXIgaXMgYmVpbmcgcmVsaWVkIG9uLiBUaGUgcHJvZ3JhbW1lCmNoZWNrcyBpdCB0cnVzdHMgdGhlbTsgdGhlIGF0dGVzdGF0aW9uIHJlZ2lzdHJ5IGNoZWNrcyB0aGUgY2xhaW0gcmVhbGx5CmlzIHRoZWlycywgcmVhbGx5IGlzIGFib3V0IHRoaXMgcmVjaXBpZW50LCBhbmQgcmVhbGx5IGlzIHVuZGVyIHRoaXMKcHJvZ3JhbW1lJ3Mgc2NoZW1hLgAAAAAAB3JlbGVhc2UAAAAAAwAAAAAAAAAJcmVjaXBpZW50AAAAAAAAEwAAAAAAAAALYXR0ZXN0YXRpb24AAAAD7gAAACAAAAAAAAAACGF0dGVzdGVyAAAAEwAAAAEAAAPpAAAACwAAAAM=",
        "AAAAAAAAAElMaWZ0IHRoZSBwYXVzZSBhbmQgcmVzdW1lIG5vcm1hbCBvcGVyYXRpb24uCk9ubHkgdGhlIGNyZWF0b3IgbWF5IHVucGF1c2UuAAAAAAAAB3VucGF1c2UAAAAAAAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAgZTZXR0bGUgYW4gYXBwbGljYXRpb24gaW50byBhbiBhd2FyZCBvbmNlIHF1b3J1bSBpcyBpbi4gUGVybWlzc2lvbmxlc3MgdG8KY2FsbDogdGhlIG91dGNvbWUgaXMgYWxyZWFkeSBkZXRlcm1pbmVkIGJ5IHRoZSB2b3RlcywgYW5kIHJlcXVpcmluZyBhCnByaXZpbGVnZWQgcGFydHkgdG8gdHJpZ2dlciBpdCB3b3VsZCBsZXQgdGhlbSBzdHJhbmQgYW4gYXBwbGljYW50LgoKYHBheWVlYCBpcyB3aGVyZSB0cmFuY2hlcyBhcmUgcGFpZC4gSW4gW2BNb2RlOjpEaXJlY3RgXSB0aGF0IGlzIGEgdmVyaWZpZWQKaW5zdGl0dXRpb24gcmF0aGVyIHRoYW4gdGhlIHJlY2lwaWVudC4KCldoZW4gdGhlIHByb2dyYW1tZSBpcyBvdmVyc3Vic2NyaWJlZCwgYmVpbmcgcGVybWlzc2lvbmxlc3MgbWVhbnMgY2FsbGluZwpvcmRlciBkZWNpZGVzIHdobyBpcyBmdW5kZWQg4oCUIHNlZSAiT3ZlcnN1YnNjcmlwdGlvbiIgaW4gdGhlIG1vZHVsZSBkb2NzCmZvciB3aGF0IGlzIGFuZCBpcyBub3QgZ3VhcmFudGVlZCBhYm91dCB0aGF0LgAAAAAACGZpbmFsaXplAAAAAwAAAAAAAAAJYXBwbGljYW50AAAAAAAAEwAAAAAAAAAFcGF5ZWUAAAAAAAATAAAAAAAAAARtb2RlAAAH0AAAAARNb2RlAAAAAQAAA+kAAAfQAAAABUF3YXJkAAAAAAAAAw==",
        "AAAAAAAAAAAAAAAIaXNfcGF5ZWUAAAABAAAAAAAAAAVwYXllZQAAAAAAABMAAAABAAAAAQ==",
        "AAAAAAAAADhXaGV0aGVyIHRoaXMgYXR0ZXN0YXRpb24gaGFzIGFscmVhZHkgdW5sb2NrZWQgYSB0cmFuY2hlLgAAAAhpc19zcGVudAAAAAEAAAAAAAAAC2F0dGVzdGF0aW9uAAAAA+4AAAAgAAAAAQAAAAE=",
        "AAAAAAAAAQZXaXRoZHJhdyBhbiBhcHBsaWNhdGlvbiBiZWZvcmUgZmluYWxpc2F0aW9uLiBXaXRoZHJhd2FsIGlzIGZpbmFsIGZvcgp0aGlzIHByb2dyYW1tZSDigJQgdGhlIGFwcGxpY2FudCBtYXkgbm90IHJlYXBwbHkuIFRoZSBhcHBsaWNhdGlvbiByZWNvcmQKaXMgbWFya2VkLCBub3QgZGVsZXRlZCwgc28gaGlzdG9yeSBzdGF5cyBhdWRpdGFibGUuIFZvdGVzIGFscmVhZHkgY2FzdAphcmUgbGVmdCBpbiBwbGFjZSBidXQgY2FuIG5ldmVyIHByb2R1Y2UgYW4gYXdhcmQuAAAAAAAId2l0aGRyYXcAAAABAAAAAAAAAAlhcHBsaWNhbnQAAAAAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAAAAAAAJZ2V0X2F3YXJkAAAAAAAAAQAAAAAAAAAJcmVjaXBpZW50AAAAAAAAEwAAAAEAAAPpAAAH0AAAAAVBd2FyZAAAAAAAAAM=",
        "AAAAAAAAAAAAAAAJZ2V0X3BoYXNlAAAAAAAAAAAAAAEAAAPpAAAH0AAAAAVQaGFzZQAAAAAAAAM=",
        "AAAAAAAAAHZXaGV0aGVyIHRoZSBwcm9ncmFtbWUgaXMgcGF1c2VkLiBSZWFkYWJsZSBzbyBhIGNhbGxlciBjYW4gdGVsbCBhbgplbWVyZ2VuY3kgc3RvcCBhcGFydCBmcm9tIGFuIG9yZGluYXJ5IHBoYXNlIHJlZnVzYWwuAAAAAAAJaXNfcGF1c2VkAAAAAAAAAAAAAAEAAAAB",
        "AAAAAAAAA49LZWVwIHRoZSBjb250cmFjdCdzIGxvbmctbGl2ZWQgZW50cmllcyBmcm9tIGJlaW5nIGFyY2hpdmVkLgoKUGVybWlzc2lvbmxlc3MsIG1pcnJvcmluZyBga2VlcGFsaXZlYCBvbiB0aGUgYXR0ZXN0YXRpb24gYW5kIHN0YW5kaW5nCmNvbnRyYWN0czogYW55b25lIG1heSBwYXkgdGhlIGdhcyB0byBleHRlbmQgVFRMIHNvIGEgcHJvZ3JhbW1lJ3MgaGlzdG9yeSwKYW5kIHRoZSBtb25leSBzdGlsbCB0aWVkIHRvIGl0LCBkb2VzIG5vdCBzaWxlbnRseSByb3QgYXdheS4KCmBzdWJqZWN0YCBzY29wZXMgdGhlIGJ1bXAgdG8gdGhlIGVudHJpZXMgb25lIG9ic2VydmVyIGNhcmVzIGFib3V0IOKAlCBhbgphcHBsaWNhdGlvbiwgaXRzIGF3YXJkLCBhbnkgZXNjcm93ZWQgYWxsb2NhdGlvbiwgYW5kIHRoYXQgcGVyc29uJ3MKY29udHJpYnV0aW9uIGFuZCByZWZ1bmQgbWFya2VyLiBUaGVzZSBhcmUgZXhhY3RseSB0aGUgZW50cmllcyB0aGF0IGhhdmUKbm8gd3JpdGUgb2YgdGhlaXIgb3duIG9uY2UgdGhlIHByb2dyYW1tZSBzZXR0bGVzLCBzbyB0aGV5IGFyZSB0aGUgb25lcwptb3N0IGxpa2VseSB0byBhcmNoaXZlIHVubm90aWNlZC4gVGhlIGNvbnRyYWN0LXdpZGUgaW5zdGFuY2Ugc3RhdGUKKGNvbmZpZywgdGhlIHJ1bm5pbmcgdG90YWxzLCB0aGUgY2FuY2VsbGF0aW9uIGZsYWcpIGlzIGJ1bXBlZCBvbiBldmVyeQpjYWxsIGFzIHdlbGwsIHNpbmNlIHZpZXdzIGFuZCByZWZ1bmRzIGRlcGVuZCBvbiBpdCBhbmQgaXQgaGFzIG5vIHN1YmplY3QuCgpCdW1waW5nIGlzIGNhcHBlZCBhdCBbYEJVTVBfTEVER0VSU2BdIGZyb20gbm93LCBzbyBjYWxsaW5nIHRoaXMgaW4gYSBsb29wCmNhbm5vdCBwdXNoIGFuIGVudHJ5J3MgVFRMIG91dCB3aXRob3V0IGJvdW5kIOKAlCB0aGVyZSBpcyBubyBncmllZmluZyBwYXRoLgAAAAAJa2VlcGFsaXZlAAAAAAAAAQAAAAAAAAAHc3ViamVjdAAAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAP1TZW5kIHRoZSBwcm90b2NvbCdzIGN1dCB0byB0aGUgdHJlYXN1cnkuIFBlcm1pc3Npb25sZXNzIGFuZCBvbmNlIG9ubHkuCgpUaGUgZmVlIHdhcyBuZXZlciBwYXJ0IG9mIHRoZSBhd2FyZGFibGUgYnVkZ2V0LCBzbyB0aGlzIG1vdmVzIG1vbmV5IHRoYXQKd2FzIG5ldmVyIHByb21pc2VkIHRvIGFueW9uZS4gSXQgd2FpdHMgZm9yIGNvbnRyaWJ1dGlvbnMgdG8gY2xvc2Ugc28gdGhlCmFtb3VudCBjYW5ub3QgY2hhbmdlIHVuZGVybmVhdGggaXQuAAAAAAAACXN3ZWVwX2ZlZQAAAAAAAAAAAAABAAAD6QAAAAsAAAAD",
        "AAAAAAAAAAAAAAAKY29udHJpYnV0ZQAAAAAAAgAAAAAAAAAFZG9ub3IAAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAIVXaXRoZHJhdyBhIHBheWVlLiBBbGxvY2F0aW9ucyBhbHJlYWR5IGRpcmVjdGVkIHRvIHRoZW0gYXJlIHVudG91Y2hlZCDigJQKdGhpcyBzdG9wcyBmdXR1cmUgcGF5bWVudHMsIGl0IGRvZXMgbm90IGNsYXcgYmFjayBwYXN0IG9uZXMuAAAAAAAACmRlbnlfcGF5ZWUAAAAAAAEAAAAAAAAABXBheWVlAAAAAAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAAKZ2V0X2NvbmZpZwAAAAAAAAAAAAEAAAPpAAAH0AAAAA9Qcm9ncmFtbWVDb25maWcAAAAAAw==",
        "AAAAAAAAAPtWZXJpZnkgYSBwYXllZSBhcyBhIGxlZ2l0aW1hdGUgZGVzdGluYXRpb24gZm9yIHRoaXMgcHJvZ3JhbW1lJ3MgbW9uZXkuCgpNYW5hZ2VkIGJ5IHRoZSBjcmVhdG9yIHJhdGhlciB0aGFuIHRoZSByZXZpZXdlcnM6IHJldmlld2VycyBqdWRnZSB3aGV0aGVyCmFuIGFwcGxpY2FudCBkZXNlcnZlcyBmdW5kaW5nLCB3aGljaCBpcyBhIGRpZmZlcmVudCBxdWVzdGlvbiBmcm9tIHdoZXRoZXIKYSBnaXZlbiBzY2hvb2wgYWN0dWFsbHkgZXhpc3RzLgAAAAALYWxsb3dfcGF5ZWUAAAAAAQAAAAAAAAAFcGF5ZWUAAAAAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAGFSZW1vdmUgbXVsdGlwbGUgcGF5ZWVzIGluIGEgc2luZ2xlIGNhbGwuIFBheWVlcyBub3QgY3VycmVudGx5IHZlcmlmaWVkCmFyZSBza2lwcGVkLCBub3QgcmVqZWN0ZWQuAAAAAAAAC2RlbnlfcGF5ZWVzAAAAAAEAAAAAAAAABnBheWVlcwAAAAAD6gAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAAAAAAALaXNfcmV2aWV3ZXIAAAAAAQAAAAAAAAAEYWRkcgAAABMAAAABAAAAAQ==",
        "AAAAAAAAAAAAAAALaXNfdmVyaWZpZXIAAAAAAQAAAAAAAAAEYWRkcgAAABMAAAABAAAAAQ==",
        "AAAAAAAAAMJBZGQgbXVsdGlwbGUgdmVyaWZpZWQgcGF5ZWVzIGluIGEgc2luZ2xlIGNhbGwuIER1cGxpY2F0ZXMgd2l0aGluIHRoZQpiYXRjaCBvciBhZ2FpbnN0IGFscmVhZHktdmVyaWZpZWQgcGF5ZWVzIGFyZSBza2lwcGVkLCBub3QgcmVqZWN0ZWQg4oCUIHRoZQpjYWxsZXIgaXMgYmF0Y2hpbmcgZm9yIGNvbnZlbmllbmNlLCBub3QgcHJlY2lzaW9uLgAAAAAADGFsbG93X3BheWVlcwAAAAEAAAAAAAAABnBheWVlcwAAAAAD6gAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAMAAAAAAAAABmNvbmZpZwAAAAAH0AAAAA9Qcm9ncmFtbWVDb25maWcAAAAAAAAAAAlyZXZpZXdlcnMAAAAAAAPqAAAAEwAAAAAAAAAJdmVyaWZpZXJzAAAAAAAD6gAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAC9Fc2Nyb3dlZCBmdW5kcyB0aGlzIHJlY2lwaWVudCBtYXkgc3RpbGwgZGlyZWN0LgAAAAANYWxsb2NhdGlvbl9vZgAAAAAAAAEAAAAAAAAACXJlY2lwaWVudAAAAAAAABMAAAABAAAACw==",
        "AAAAAAAAAAAAAAANdG90YWxfZ3JhbnRlZAAAAAAAAAAAAAABAAAACw==",
        "AAAAAAAAAAAAAAAOY29udHJpYnV0ZWRfYnkAAAAAAAEAAAAAAAAABWRvbm9yAAAAAAAAEwAAAAEAAAAL",
        "AAAAAAAAAAAAAAAOdG90YWxfcmVsZWFzZWQAAAAAAAAAAAABAAAACw==",
        "AAAAAAAAAAAAAAAPZ2V0X2FwcGxpY2F0aW9uAAAAAAEAAAAAAAAACWFwcGxpY2FudAAAAAAAABMAAAABAAAD6QAAB9AAAAALQXBwbGljYXRpb24AAAAAAw==",
        "AAAAAAAAAkhTZW5kIHdoYXRldmVyIG5vIGRvbm9yIGV2ZXIgY2FtZSBiYWNrIGZvciB0byB0aGUgdHJlYXN1cnkuCgpSZWZ1bmRzIGhhdmUgdG8gYmUgY2xhaW1lZCBpbmRpdmlkdWFsbHksIGFuZCBpbiBwcmFjdGljZSBtYW55IHdpbGwgbm90CmJlOiBhIGRpYXNwb3JhIGRvbm9yIHdobyBnYXZlIHRoZSBlcXVpdmFsZW50IG9mIGZpdmUgZG9sbGFycyBpcyBub3QgZ29pbmcKdG8gc2lnbiBhIHRyYW5zYWN0aW9uIHRvIHJlY292ZXIgdGhyZWUuIFdpdGhvdXQgdGhpcyB0aGUgcmVtYWluZGVyIHNpdHMKaW4gdGhlIGNvbnRyYWN0IHBlcm1hbmVudGx5LCB3aGljaCBzZXJ2ZXMgbm9ib2R5LgoKVGhlIGdyYWNlIHBlcmlvZCBpcyBgc3dlZXBfZGVhZGxpbmVgLCBzZXQgcGVyIHByb2dyYW1tZSByYXRoZXIgdGhhbiBmaXhlZApwcm90b2NvbC13aWRlIOKAlCBhIHRlcm0tbGVuZ3RoIGJ1cnNhcnkgYW5kIGEgbXVsdGkteWVhciBpbmZyYXN0cnVjdHVyZQpncmFudCBkaXNhZ3JlZSBhYm91dCBob3cgbG9uZyBpcyBsb25nIGVub3VnaCB0byB3YWl0LiBQZXJtaXNzaW9ubGVzcywgc28Kbm9ib2R5IGhhcyB0byBiZSB0cnVzdGVkIHRvIHJlbWVtYmVyLgAAAA9zd2VlcF91bmNsYWltZWQAAAAAAAAAAAEAAAPpAAAACwAAAAM=",
        "AAAAAAAAAAAAAAARdG90YWxfY29udHJpYnV0ZWQAAAAAAAAAAAAAAQAAAAs=",
        "AAAAAQAAAJ9BIHJlY2lwaWVudCdzIGFjY3VtdWxhdGVkIHRyYWNrIHJlY29yZC4KCldyaXR0ZW4gYnkgYHJlY29yZGAsIHJldHVybmVkIHRvIGFueSBjb250cmFjdCB0aGF0IGNyZWRpdHMgaXQsIGFuZCByZWFkIGJ5CnByb2dyYW1tZXMgdW5kZXJ3cml0aW5nIGEgcmVwZWF0IGFwcGxpY2FudC4AAAAAAAAAAAhTdGFuZGluZwAAAAcAAAAAAAAACmZpcnN0X3NlZW4AAAAAAAYAAADaSGFzaCBjaGFpbiBvdmVyIGV2ZXJ5IGNyZWRpdCwgaW4gb3JkZXIuIEdlbmVzaXMgaXMgYWxsIHplcm9lczsgZWFjaApjcmVkaXQgc2V0cyBgcm9vdCA9IHNoYTI1Nihyb290IOKAliBwcm9ncmFtbWUg4oCWIGFtb3VudCDigJYgYXR0ZXN0YXRpb24g4oCWIHRzKWAuCkxldHMgYW55b25lIHZlcmlmeSBhIGZ1bGwgb2ZmLWNoYWluIGhpc3RvcnkgYWdhaW5zdCBvbi1jaGFpbiBzdGF0ZS4AAAAAAAxoaXN0b3J5X3Jvb3QAAAPuAAAAIAAAAAAAAAAMbGFzdF91cGRhdGVkAAAABgAAADtEaXN0aW5jdCBwcm9ncmFtbWVzIHRoaXMgcmVjaXBpZW50IGhhcyBiZWVuIGNyZWRpdGVkIHVuZGVyLgAAAAAKcHJvZ3JhbW1lcwAAAAAABAAAAAAAAAAHc3ViamVjdAAAAAATAAAAAAAAAA50b3RhbF9yZWNlaXZlZAAAAAAACwAAADFUcmFuY2hlcyByZWxlYXNlZCB0byB0aGVtLCBhY3Jvc3MgYWxsIHByb2dyYW1tZXMuAAAAAAAACHRyYW5jaGVzAAAABA==",
        "AAAAAQAAAYtFdmVyeXRoaW5nIGEgcHJvZ3JhbW1lIGlzIGNvbnN0cnVjdGVkIGZyb20uCgpHcm91cGVkIGludG8gYSBzdHJ1Y3QgcmF0aGVyIHRoYW4gcGFzc2VkIGFzIGEgZG96ZW4gcG9zaXRpb25hbCBhcmd1bWVudHMg4oCUCmF0IHRoYXQgd2lkdGggYSBjYWxsZXIgdHJhbnNwb3NpbmcgYHJldmlld19kZWFkbGluZWAgYW5kIGByZWxlYXNlX2RlYWRsaW5lYCwKb3IgYHF1b3J1bWAgYW5kIGB0cmFuY2hlc2AsIHByb2R1Y2VzIGEgdmFsaWQtbG9va2luZyBwcm9ncmFtbWUgdGhhdCBiZWhhdmVzCndyb25nbHksIGFuZCB0aGUgdHlwZSBzeXN0ZW0gc2F5cyBub3RoaW5nLgoKTGl2ZXMgaGVyZSBiZWNhdXNlIHRoZSByZWdpc3RyeSBjb25zdHJ1Y3RzIGl0IGFuZCB0aGUgcHJvZ3JhbW1lIGNvbnN1bWVzIGl0LgAAAAAAAAAAD1Byb2dyYW1tZUNvbmZpZwAAAAAQAAAAGEFwcGxpY2F0aW9ucyBjbG9zZSBoZXJlLgAAAA5hcHBseV9kZWFkbGluZQAAAAAABgAAAEJBdHRlc3RhdGlvbiByZWdpc3RyeSB0aGF0IHRyYW5jaGUgY29uZGl0aW9ucyBhcmUgdmVyaWZpZWQgYWdhaW5zdC4AAAAAAAZhdHRlc3QAAAAAABMAAAAAAAAAB2NyZWF0b3IAAAAAEwAAAAAAAAAHZmVlX2JwcwAAAAAEAAAAAAAAAA1tZXRhZGF0YV9oYXNoAAAAAAAD7gAAACAAAADQTWluaW11bSBhd2FyZCBhbW91bnQgYmVsb3cgd2hpY2ggZmluYWxpc2F0aW9uIGlzIHJlZnVzZWQuIFByZXZlbnRzIGF3YXJkcwpzbWFsbGVyIHRoYW4gdGhlIGZlZSB0YWtlbiBmcm9tIHRoZW0sIG9yIHNvIHNtYWxsIHRoYXQgc3BsaXR0aW5nIGludG8KdHJhbmNoZXMgcHJvZHVjZXMgcGF5bWVudHMgd29ydGggbGVzcyB0aGFuIHRoZSB0cmFuc2FjdGlvbiBjb3N0LgAAAA1taW5pbXVtX2F3YXJkAAAAAAAACwAAAGJQb2xpY3kgc2lnbmVyIGNvbnRyYWN0LCBjb25zdWx0ZWQgYmVmb3JlIGEgYFJlc3RyaWN0ZWRgIHRyYW5jaGUgaXMgcGFpZAppbnRvIGEgcmVjaXBpZW50J3Mgd2FsbGV0LgAAAAAABnBvbGljeQAAAAAAEwAAAD1SZXZpZXdlciB2b3RlcyBuZWVkZWQgYmVmb3JlIGFuIGFwcGxpY2F0aW9uIGNhbiBiZSBmaW5hbGlzZWQuAAAAAAAABnF1b3J1bQAAAAAABAAAACtTdGFuZGluZyBjb250cmFjdCBjcmVkaXRlZCBvbiBlYWNoIHJlbGVhc2UuAAAAAAZyZWNvcmQAAAAAABMAAABGVHJhbmNoZXMgc3RvcCByZWxlYXNpbmcgaGVyZSwgYW5kIHdoYXRldmVyIGlzIGxlZnQgYmVjb21lcyByZWZ1bmRhYmxlLgAAAAAAEHJlbGVhc2VfZGVhZGxpbmUAAAAGAAAAE1Jldmlld3MgY2xvc2UgaGVyZS4AAAAAD3Jldmlld19kZWFkbGluZQAAAAAGAAAARlRoZSBzaW5nbGUgc2NoZW1hIHdob3NlIGF0dGVzdGF0aW9ucyB1bmxvY2sgdGhpcyBwcm9ncmFtbWUncyB0cmFuY2hlcy4AAAAAAAZzY2hlbWEAAAAAA+4AAAAgAAABBFJlZnVuZHMgbm9ib2R5IGNsYWltZWQgc3dlZXAgdG8gdGhlIHRyZWFzdXJ5IGhlcmUuCgpTZXQgcGVyIHByb2dyYW1tZSByYXRoZXIgdGhhbiBmaXhlZCBwcm90b2NvbC13aWRlOiBhIHRocmVlLW1vbnRoIHN0dWRlbnQKYnVyc2FyeSBhbmQgYSB0aHJlZS15ZWFyIGluZnJhc3RydWN0dXJlIGdyYW50IGhhdmUgdmVyeSBkaWZmZXJlbnQgaWRlYXMKYWJvdXQgaG93IGxvbmcgaXMgbG9uZyBlbm91Z2ggdG8gd2FpdCBmb3IgYSBkb25vciB0byBjb21lIGJhY2suAAAADnN3ZWVwX2RlYWRsaW5lAAAAAAAGAAAAQVRoZSBhc3NldCBiZWluZyBkaXN0cmlidXRlZCwgYXMgYSBTdGVsbGFyIEFzc2V0IENvbnRyYWN0IGFkZHJlc3MuAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAIdHJhbmNoZXMAAAAEAAAAAAAAAAh0cmVhc3VyeQAAABM=" ]),
      options
    )
  }
  public readonly fromJSON = {
    fee: this.txFromJSON<Result<i128>>,
        apply: this.txFromJSON<Result<void>>,
        pause: this.txFromJSON<Result<void>>,
        phase: this.txFromJSON<Result<Phase>>,
        spend: this.txFromJSON<Result<i128>>,
        budget: this.txFromJSON<Result<i128>>,
        cancel: this.txFromJSON<Result<void>>,
        config: this.txFromJSON<Result<ProgrammeConfig>>,
        refund: this.txFromJSON<Result<i128>>,
        review: this.txFromJSON<Result<void>>,
        release: this.txFromJSON<Result<i128>>,
        unpause: this.txFromJSON<Result<void>>,
        finalize: this.txFromJSON<Result<Award>>,
        is_payee: this.txFromJSON<boolean>,
        is_spent: this.txFromJSON<boolean>,
        withdraw: this.txFromJSON<Result<void>>,
        get_award: this.txFromJSON<Result<Award>>,
        get_phase: this.txFromJSON<Result<Phase>>,
        is_paused: this.txFromJSON<boolean>,
        keepalive: this.txFromJSON<Result<void>>,
        sweep_fee: this.txFromJSON<Result<i128>>,
        contribute: this.txFromJSON<Result<void>>,
        deny_payee: this.txFromJSON<Result<void>>,
        get_config: this.txFromJSON<Result<ProgrammeConfig>>,
        allow_payee: this.txFromJSON<Result<void>>,
        deny_payees: this.txFromJSON<Result<void>>,
        is_reviewer: this.txFromJSON<boolean>,
        is_verifier: this.txFromJSON<boolean>,
        allow_payees: this.txFromJSON<Result<void>>,
        allocation_of: this.txFromJSON<i128>,
        total_granted: this.txFromJSON<i128>,
        contributed_by: this.txFromJSON<i128>,
        total_released: this.txFromJSON<i128>,
        get_application: this.txFromJSON<Result<Application>>,
        sweep_unclaimed: this.txFromJSON<Result<i128>>,
        total_contributed: this.txFromJSON<i128>
  }
}