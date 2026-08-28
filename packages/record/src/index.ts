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


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CCNOJI7LNHQBQFFOQRB3B5CAABRNOXYCGLJTVWRMS7AMOMDGKNY324ZO",
  }
} as const

export const Errors = {
  /**
   * The caller is not a registered writer, or is not the admin.
   */
  1: {message:"NotAuthorized"},
  /**
   * No standing exists for this address yet.
   */
  2: {message:"NotFound"},
  /**
   * Credits must be strictly positive; standing is append-only and cannot be
   * walked backwards.
   */
  3: {message:"InvalidAmount"},
  /**
   * `total_received` would exceed `i128::MAX`.
   */
  4: {message:"Overflow"},
  5: {message:"AlreadyWriter"},
  6: {message:"NotWriter"}
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
  /**
 * Timestamp of the last credit, allows readers to weigh recency.
 */
last_seen: u64;
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
   * Construct and simulate a get transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get: ({subject}: {subject: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Standing>>>

  /**
   * Construct and simulate a credit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Record a released tranche against `subject`, creating their standing if
   * this is the first one. `attestation` is the proof that unlocked the
   * release; it is folded into the hash chain so the off-chain history cannot
   * later claim a release was backed by different evidence.
   */
  credit: ({writer, subject, programme, amount, attestation}: {writer: string, subject: string, programme: string, amount: i128, attestation: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Standing>>>

  /**
   * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Upgrade the record contract itself.
   */
  upgrade: ({new_wasm_hash}: {new_wasm_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_admin: (options?: MethodOptions) => Promise<AssembledTransaction<Result<string>>>

  /**
   * Construct and simulate a is_writer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_writer: ({addr}: {addr: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a keepalive transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Push a recipient's standing further from archival. Permissionless: a
   * track record is the recipient's asset, and anyone willing to pay the fee
   * may keep it alive — including the recipient themselves.
   */
  keepalive: ({subject}: {subject: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a next_root transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Recompute what `history_root` becomes after one more credit. Lets an
   * indexer, or anyone auditing a claimed history, verify off-chain records
   * against on-chain state without trusting the indexer.
   */
  next_root: ({root, programme, amount, attestation, timestamp}: {root: Buffer, programme: string, amount: i128, attestation: Buffer, timestamp: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Buffer>>

  /**
   * Construct and simulate a set_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_admin: ({new_admin}: {new_admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a add_writer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Authorise a contract to credit standing. Deliberately restricted: an
   * unauthorised writer could manufacture a track record out of nothing,
   * which would make every downstream underwriting decision worthless.
   */
  add_writer: ({writer}: {writer: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a remove_writer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Revoke a writer. Standing already credited is left alone — history is not
   * rewritten because an issuer was later removed.
   */
  remove_writer: ({writer}: {writer: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin}: {admin: string},
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
    return ContractClient.deploy({admin}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABgAAADtUaGUgY2FsbGVyIGlzIG5vdCBhIHJlZ2lzdGVyZWQgd3JpdGVyLCBvciBpcyBub3QgdGhlIGFkbWluLgAAAAANTm90QXV0aG9yaXplZAAAAAAAAAEAAAAoTm8gc3RhbmRpbmcgZXhpc3RzIGZvciB0aGlzIGFkZHJlc3MgeWV0LgAAAAhOb3RGb3VuZAAAAAIAAABaQ3JlZGl0cyBtdXN0IGJlIHN0cmljdGx5IHBvc2l0aXZlOyBzdGFuZGluZyBpcyBhcHBlbmQtb25seSBhbmQgY2Fubm90IGJlCndhbGtlZCBiYWNrd2FyZHMuAAAAAAANSW52YWxpZEFtb3VudAAAAAAAAAMAAAAqYHRvdGFsX3JlY2VpdmVkYCB3b3VsZCBleGNlZWQgYGkxMjg6Ok1BWGAuAAAAAAAIT3ZlcmZsb3cAAAAEAAAAAAAAAA1BbHJlYWR5V3JpdGVyAAAAAAAABQAAAAAAAAAJTm90V3JpdGVyAAAAAAAABg==",
        "AAAABQAAAAAAAAAAAAAACENyZWRpdGVkAAAAAQAAAAZjcmVkaXQAAAAAAAMAAAAAAAAAB3N1YmplY3QAAAAAEwAAAAEAAAAAAAAACXByb2dyYW1tZQAAAAAAABMAAAABAAAAAAAAAAhzdGFuZGluZwAAB9AAAAAIU3RhbmRpbmcAAAAAAAAAAA==",
        "AAAABQAAAAAAAAAAAAAADEFkbWluQ2hhbmdlZAAAAAEAAAAFYWRtaW4AAAAAAAABAAAAAAAAAAVhZG1pbgAAAAAAABMAAAABAAAAAA==",
        "AAAABQAAAAAAAAAAAAAADVdyaXRlckNoYW5nZWQAAAAAAAABAAAABndyaXRlcgAAAAAAAgAAAAAAAAAGd3JpdGVyAAAAAAATAAAAAQAAAAAAAAAKYXV0aG9yaXplZAAAAAAAAQAAAAAAAAAA",
        "AAAAAAAAAAAAAAADZ2V0AAAAAAEAAAAAAAAAB3N1YmplY3QAAAAAEwAAAAEAAAPpAAAH0AAAAAhTdGFuZGluZwAAAAM=",
        "AAAAAAAAAQ1SZWNvcmQgYSByZWxlYXNlZCB0cmFuY2hlIGFnYWluc3QgYHN1YmplY3RgLCBjcmVhdGluZyB0aGVpciBzdGFuZGluZyBpZgp0aGlzIGlzIHRoZSBmaXJzdCBvbmUuIGBhdHRlc3RhdGlvbmAgaXMgdGhlIHByb29mIHRoYXQgdW5sb2NrZWQgdGhlCnJlbGVhc2U7IGl0IGlzIGZvbGRlZCBpbnRvIHRoZSBoYXNoIGNoYWluIHNvIHRoZSBvZmYtY2hhaW4gaGlzdG9yeSBjYW5ub3QKbGF0ZXIgY2xhaW0gYSByZWxlYXNlIHdhcyBiYWNrZWQgYnkgZGlmZmVyZW50IGV2aWRlbmNlLgAAAAAAAAZjcmVkaXQAAAAAAAUAAAAAAAAABndyaXRlcgAAAAAAEwAAAAAAAAAHc3ViamVjdAAAAAATAAAAAAAAAAlwcm9ncmFtbWUAAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAC2F0dGVzdGF0aW9uAAAAA+4AAAAgAAAAAQAAA+kAAAfQAAAACFN0YW5kaW5nAAAAAw==",
        "AAAAAAAAACNVcGdyYWRlIHRoZSByZWNvcmQgY29udHJhY3QgaXRzZWxmLgAAAAAHdXBncmFkZQAAAAABAAAAAAAAAA1uZXdfd2FzbV9oYXNoAAAAAAAD7gAAACAAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAAAAAAAJZ2V0X2FkbWluAAAAAAAAAAAAAAEAAAPpAAAAEwAAAAM=",
        "AAAAAAAAAAAAAAAJaXNfd3JpdGVyAAAAAAAAAQAAAAAAAAAEYWRkcgAAABMAAAABAAAAAQ==",
        "AAAAAAAAAMdQdXNoIGEgcmVjaXBpZW50J3Mgc3RhbmRpbmcgZnVydGhlciBmcm9tIGFyY2hpdmFsLiBQZXJtaXNzaW9ubGVzczogYQp0cmFjayByZWNvcmQgaXMgdGhlIHJlY2lwaWVudCdzIGFzc2V0LCBhbmQgYW55b25lIHdpbGxpbmcgdG8gcGF5IHRoZSBmZWUKbWF5IGtlZXAgaXQgYWxpdmUg4oCUIGluY2x1ZGluZyB0aGUgcmVjaXBpZW50IHRoZW1zZWx2ZXMuAAAAAAlrZWVwYWxpdmUAAAAAAAABAAAAAAAAAAdzdWJqZWN0AAAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAMFSZWNvbXB1dGUgd2hhdCBgaGlzdG9yeV9yb290YCBiZWNvbWVzIGFmdGVyIG9uZSBtb3JlIGNyZWRpdC4gTGV0cyBhbgppbmRleGVyLCBvciBhbnlvbmUgYXVkaXRpbmcgYSBjbGFpbWVkIGhpc3RvcnksIHZlcmlmeSBvZmYtY2hhaW4gcmVjb3JkcwphZ2FpbnN0IG9uLWNoYWluIHN0YXRlIHdpdGhvdXQgdHJ1c3RpbmcgdGhlIGluZGV4ZXIuAAAAAAAACW5leHRfcm9vdAAAAAAAAAUAAAAAAAAABHJvb3QAAAPuAAAAIAAAAAAAAAAJcHJvZ3JhbW1lAAAAAAAAEwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAthdHRlc3RhdGlvbgAAAAPuAAAAIAAAAAAAAAAJdGltZXN0YW1wAAAAAAAABgAAAAEAAAPuAAAAIA==",
        "AAAAAAAAAAAAAAAJc2V0X2FkbWluAAAAAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAMxBdXRob3Jpc2UgYSBjb250cmFjdCB0byBjcmVkaXQgc3RhbmRpbmcuIERlbGliZXJhdGVseSByZXN0cmljdGVkOiBhbgp1bmF1dGhvcmlzZWQgd3JpdGVyIGNvdWxkIG1hbnVmYWN0dXJlIGEgdHJhY2sgcmVjb3JkIG91dCBvZiBub3RoaW5nLAp3aGljaCB3b3VsZCBtYWtlIGV2ZXJ5IGRvd25zdHJlYW0gdW5kZXJ3cml0aW5nIGRlY2lzaW9uIHdvcnRobGVzcy4AAAAKYWRkX3dyaXRlcgAAAAAAAQAAAAAAAAAGd3JpdGVyAAAAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAIZgYWRtaW5gIGdvdmVybnMgd2hpY2ggY29udHJhY3RzIG1heSB3cml0ZSBzdGFuZGluZy4gSW4gcHJvZHVjdGlvbiB0aGlzIGlzCnRoZSBwcm90b2NvbCByZWdpc3RyeSwgd2hpY2ggYWRkcyBlYWNoIHByb2dyYW1tZSBpdCBkZXBsb3lzLgAAAAAADV9fY29uc3RydWN0b3IAAAAAAAABAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAA",
        "AAAAAAAAAHpSZXZva2UgYSB3cml0ZXIuIFN0YW5kaW5nIGFscmVhZHkgY3JlZGl0ZWQgaXMgbGVmdCBhbG9uZSDigJQgaGlzdG9yeSBpcyBub3QKcmV3cml0dGVuIGJlY2F1c2UgYW4gaXNzdWVyIHdhcyBsYXRlciByZW1vdmVkLgAAAAAADXJlbW92ZV93cml0ZXIAAAAAAAABAAAAAAAAAAZ3cml0ZXIAAAAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAAAQAAAJ9BIHJlY2lwaWVudCdzIGFjY3VtdWxhdGVkIHRyYWNrIHJlY29yZC4KCldyaXR0ZW4gYnkgYHJlY29yZGAsIHJldHVybmVkIHRvIGFueSBjb250cmFjdCB0aGF0IGNyZWRpdHMgaXQsIGFuZCByZWFkIGJ5CnByb2dyYW1tZXMgdW5kZXJ3cml0aW5nIGEgcmVwZWF0IGFwcGxpY2FudC4AAAAAAAAAAAhTdGFuZGluZwAAAAcAAAAAAAAACmZpcnN0X3NlZW4AAAAAAAYAAADaSGFzaCBjaGFpbiBvdmVyIGV2ZXJ5IGNyZWRpdCwgaW4gb3JkZXIuIEdlbmVzaXMgaXMgYWxsIHplcm9lczsgZWFjaApjcmVkaXQgc2V0cyBgcm9vdCA9IHNoYTI1Nihyb290IOKAliBwcm9ncmFtbWUg4oCWIGFtb3VudCDigJYgYXR0ZXN0YXRpb24g4oCWIHRzKWAuCkxldHMgYW55b25lIHZlcmlmeSBhIGZ1bGwgb2ZmLWNoYWluIGhpc3RvcnkgYWdhaW5zdCBvbi1jaGFpbiBzdGF0ZS4AAAAAAAxoaXN0b3J5X3Jvb3QAAAPuAAAAIAAAAD5UaW1lc3RhbXAgb2YgdGhlIGxhc3QgY3JlZGl0LCBhbGxvd3MgcmVhZGVycyB0byB3ZWlnaCByZWNlbmN5LgAAAAAACWxhc3Rfc2VlbgAAAAAAAAYAAAA7RGlzdGluY3QgcHJvZ3JhbW1lcyB0aGlzIHJlY2lwaWVudCBoYXMgYmVlbiBjcmVkaXRlZCB1bmRlci4AAAAACnByb2dyYW1tZXMAAAAAAAQAAAAAAAAAB3N1YmplY3QAAAAAEwAAAAAAAAAOdG90YWxfcmVjZWl2ZWQAAAAAAAsAAAAxVHJhbmNoZXMgcmVsZWFzZWQgdG8gdGhlbSwgYWNyb3NzIGFsbCBwcm9ncmFtbWVzLgAAAAAAAAh0cmFuY2hlcwAAAAQ=",
        "AAAAAQAAAYtFdmVyeXRoaW5nIGEgcHJvZ3JhbW1lIGlzIGNvbnN0cnVjdGVkIGZyb20uCgpHcm91cGVkIGludG8gYSBzdHJ1Y3QgcmF0aGVyIHRoYW4gcGFzc2VkIGFzIGEgZG96ZW4gcG9zaXRpb25hbCBhcmd1bWVudHMg4oCUCmF0IHRoYXQgd2lkdGggYSBjYWxsZXIgdHJhbnNwb3NpbmcgYHJldmlld19kZWFkbGluZWAgYW5kIGByZWxlYXNlX2RlYWRsaW5lYCwKb3IgYHF1b3J1bWAgYW5kIGB0cmFuY2hlc2AsIHByb2R1Y2VzIGEgdmFsaWQtbG9va2luZyBwcm9ncmFtbWUgdGhhdCBiZWhhdmVzCndyb25nbHksIGFuZCB0aGUgdHlwZSBzeXN0ZW0gc2F5cyBub3RoaW5nLgoKTGl2ZXMgaGVyZSBiZWNhdXNlIHRoZSByZWdpc3RyeSBjb25zdHJ1Y3RzIGl0IGFuZCB0aGUgcHJvZ3JhbW1lIGNvbnN1bWVzIGl0LgAAAAAAAAAAD1Byb2dyYW1tZUNvbmZpZwAAAAAQAAAAGEFwcGxpY2F0aW9ucyBjbG9zZSBoZXJlLgAAAA5hcHBseV9kZWFkbGluZQAAAAAABgAAAEJBdHRlc3RhdGlvbiByZWdpc3RyeSB0aGF0IHRyYW5jaGUgY29uZGl0aW9ucyBhcmUgdmVyaWZpZWQgYWdhaW5zdC4AAAAAAAZhdHRlc3QAAAAAABMAAAAAAAAAB2NyZWF0b3IAAAAAEwAAAAAAAAAHZmVlX2JwcwAAAAAEAAAAAAAAAA1tZXRhZGF0YV9oYXNoAAAAAAAD7gAAACAAAADQTWluaW11bSBhd2FyZCBhbW91bnQgYmVsb3cgd2hpY2ggZmluYWxpc2F0aW9uIGlzIHJlZnVzZWQuIFByZXZlbnRzIGF3YXJkcwpzbWFsbGVyIHRoYW4gdGhlIGZlZSB0YWtlbiBmcm9tIHRoZW0sIG9yIHNvIHNtYWxsIHRoYXQgc3BsaXR0aW5nIGludG8KdHJhbmNoZXMgcHJvZHVjZXMgcGF5bWVudHMgd29ydGggbGVzcyB0aGFuIHRoZSB0cmFuc2FjdGlvbiBjb3N0LgAAAA1taW5pbXVtX2F3YXJkAAAAAAAACwAAAGJQb2xpY3kgc2lnbmVyIGNvbnRyYWN0LCBjb25zdWx0ZWQgYmVmb3JlIGEgYFJlc3RyaWN0ZWRgIHRyYW5jaGUgaXMgcGFpZAppbnRvIGEgcmVjaXBpZW50J3Mgd2FsbGV0LgAAAAAABnBvbGljeQAAAAAAEwAAAD1SZXZpZXdlciB2b3RlcyBuZWVkZWQgYmVmb3JlIGFuIGFwcGxpY2F0aW9uIGNhbiBiZSBmaW5hbGlzZWQuAAAAAAAABnF1b3J1bQAAAAAABAAAACtTdGFuZGluZyBjb250cmFjdCBjcmVkaXRlZCBvbiBlYWNoIHJlbGVhc2UuAAAAAAZyZWNvcmQAAAAAABMAAABGVHJhbmNoZXMgc3RvcCByZWxlYXNpbmcgaGVyZSwgYW5kIHdoYXRldmVyIGlzIGxlZnQgYmVjb21lcyByZWZ1bmRhYmxlLgAAAAAAEHJlbGVhc2VfZGVhZGxpbmUAAAAGAAAAE1Jldmlld3MgY2xvc2UgaGVyZS4AAAAAD3Jldmlld19kZWFkbGluZQAAAAAGAAAARlRoZSBzaW5nbGUgc2NoZW1hIHdob3NlIGF0dGVzdGF0aW9ucyB1bmxvY2sgdGhpcyBwcm9ncmFtbWUncyB0cmFuY2hlcy4AAAAAAAZzY2hlbWEAAAAAA+4AAAAgAAABBFJlZnVuZHMgbm9ib2R5IGNsYWltZWQgc3dlZXAgdG8gdGhlIHRyZWFzdXJ5IGhlcmUuCgpTZXQgcGVyIHByb2dyYW1tZSByYXRoZXIgdGhhbiBmaXhlZCBwcm90b2NvbC13aWRlOiBhIHRocmVlLW1vbnRoIHN0dWRlbnQKYnVyc2FyeSBhbmQgYSB0aHJlZS15ZWFyIGluZnJhc3RydWN0dXJlIGdyYW50IGhhdmUgdmVyeSBkaWZmZXJlbnQgaWRlYXMKYWJvdXQgaG93IGxvbmcgaXMgbG9uZyBlbm91Z2ggdG8gd2FpdCBmb3IgYSBkb25vciB0byBjb21lIGJhY2suAAAADnN3ZWVwX2RlYWRsaW5lAAAAAAAGAAAAQVRoZSBhc3NldCBiZWluZyBkaXN0cmlidXRlZCwgYXMgYSBTdGVsbGFyIEFzc2V0IENvbnRyYWN0IGFkZHJlc3MuAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAIdHJhbmNoZXMAAAAEAAAAAAAAAAh0cmVhc3VyeQAAABM=" ]),
      options
    )
  }
  public readonly fromJSON = {
    get: this.txFromJSON<Result<Standing>>,
        credit: this.txFromJSON<Result<Standing>>,
        upgrade: this.txFromJSON<Result<void>>,
        get_admin: this.txFromJSON<Result<string>>,
        is_writer: this.txFromJSON<boolean>,
        keepalive: this.txFromJSON<Result<void>>,
        next_root: this.txFromJSON<Buffer>,
        set_admin: this.txFromJSON<Result<void>>,
        add_writer: this.txFromJSON<Result<void>>,
        remove_writer: this.txFromJSON<Result<void>>
  }
}