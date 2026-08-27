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
    contractId: "CAWCAOO3VYQT3LFKX4IKD6FDEPCOI3N3URPMAALO3T7G5OCMQM5IA6BQ",
  }
} as const

/**
 * Per-wallet rules. One policy contract serves many wallets.
 */
export interface Policy {
  /**
 * Most that may be spent within one period.
 */
cap: i128;
  /**
 * Length of the spending window, in seconds.
 */
period: u64;
  /**
 * Spent so far in the window that began at `window_start`.
 */
spent: i128;
  /**
 * Who may edit the allowlist. Deliberately not the wallet.
 */
steward: string;
  /**
 * The only asset this signer may move.
 */
token: string;
  window_start: u64;
}

/**
 * Named `SpendError` rather than `Error` on purpose: the smart wallet
 * interface exports its own `Error`, and two spec entries under one name make
 * the contract's generated bindings ambiguous about which is which.
 */
export const SpendError = {
  1: {message:"NotConfigured"},
  2: {message:"AlreadyConfigured"},
  3: {message:"NotSteward"},
  /**
   * The signer tried to authorise something other than a token transfer.
   */
  4: {message:"ForbiddenCall"},
  /**
   * The transfer's destination is not a verified payee.
   */
  5: {message:"PayeeNotAllowed"},
  /**
   * The transfer would exceed the cap for the current period.
   */
  6: {message:"CapExceeded"},
  /**
   * The transfer moves someone else's funds, or a different asset.
   */
  7: {message:"ForbiddenTransfer"},
  8: {message:"InvalidAmount"},
  9: {message:"InvalidCap"},
  10: {message:"AlreadyPayee"},
  11: {message:"NotPayee"}
}



/**
 * Contract errors.
 * 
 * Deliberately renumbered for the v1 interface so the error space is disjoint
 * from the legacy (pre-1.0) contract's 1-9 range. A client decoding an error
 * code < 100 is talking to a legacy wallet.
 * 
 * Ranges:
 * - 100-109: signer storage / management
 * - 110-119: auth (`__check_auth`)
 * - 120-129: WebAuthn (secp256r1) verification
 */
export const Errors = {
  /**
   * The requested signer does not exist on this smart wallet.
   */
  100: {message:"SignerNotFound"},
  /**
   * `add_signer` was called with a signer key that already exists.
   */
  101: {message:"SignerAlreadyExists"},
  /**
   * The signer's expiration timestamp is in the past.
   */
  102: {message:"SignerExpired"},
  /**
   * The operation would remove — or demote via `update_signer` — the
   * wallet's LAST durable admin signer: a signer stored `Persistent`,
   * non-expiring (`SignerExpiration(None)`), and independently
   * admin-capable — either unlimited (`SignerLimits(None)`) or holding a
   * limits entry for the wallet's own address with no required co-signers
   * (`None` or an empty list). With zero such signers no `add_signer` or
   * `upgrade` could ever be authorized again, permanently locking the
   * wallet on an immutable network, so the transition is rejected.
   * To retire the last admin signer, add (or promote) a replacement
   * durable admin signer first.
   * 
   * Case this guard CANNOT catch (statically undecidable): a POLICY
   * signer with an admin-shaped grant counts as an admin even if its
   * `policy__` rejects every request. If such a policy is your only
   * remaining admin, the wallet's admin surface is unrecoverable even
   * though the signer still exists. Keep a non-policy admin (or a second
   * admin) at all times.
   */
  103: {message:"LastAdminSigner"},
  /**
   * The operation would leave the wallet without any DURABLE signer — one
   * stored `Persistent` with `SignerExpiration(None)`, any limits. Fired
   * by `remove_signer` (removing the last durable signer), `update_signer`
   * (demoting it to `Temporary` storage or to an expiring value), and
   * `__constructor` (the wallet's first signer must be durable).
   * Non-durable signers can evict or expire with NO contract
   * call, so only a durable signer guarantees the wallet always keeps at
   * least one live signer; with zero live signers nothing — not even
   * `add_signer` — can ever be authorized again. This is the
   * classification-independent backstop beneath `LastAdminSigner`. To
   * retire the last durable signer, add a durable replacement first.
   */
  104: {message:"LastSigner"},
  /**
   * No signer in the signatures map is permitted to authorize one of the
   * requested auth contexts.
   */
  110: {message:"MissingContext"},
  /**
   * A signature's variant does not match the stored signer it claims to be
   * for (e.g. an Ed25519 signature submitted for a Policy signer key).
   */
  111: {message:"SignatureKeyValueMismatch"},
  /**
   * clientDataJSON exceeds the 1024 byte parse buffer.
   */
  120: {message:"ClientDataJsonTooLarge"},
  /**
   * clientDataJSON is not parseable JSON (or is missing required fields).
   */
  121: {message:"ClientDataJsonParseError"},
  /**
   * The challenge in clientDataJSON does not match the base64url-encoded
   * signature payload. This binds the WebAuthn assertion to the Soroban
   * authorization entry and MUST NOT be weakened.
   */
  122: {message:"ClientDataJsonChallengeIncorrect"},
  /**
   * clientDataJSON `type` is not "webauthn.get".
   */
  123: {message:"InvalidWebAuthnType"},
  /**
   * authenticatorData is shorter than the WebAuthn minimum of 37 bytes
   * (rpIdHash 32 + flags 1 + signCount 4).
   */
  124: {message:"InvalidAuthenticatorData"},
  /**
   * The authenticator did not set the User Present (UP) flag.
   * 
   * UP-only is the deliberate default. Requiring UP keeps
   * silent, non-interactive assertions out while staying compatible with
   * authenticators that cannot do User Verification (UV — biometric/PIN).
   * UV is therefore NOT required by this contract. A deployment that wants
   * UV-required assertions should enforce it at the client/relayer layer,
   * or via a future per-signer flag (which would be a signer-model change,
   * not a change to this check); the contract cannot upgrade UP-only
   * signers to UV-required retroactively without such a flag.
   */
  125: {message:"UserPresenceRequired"},
  /**
   * authenticatorData exceeds the 1024 byte cap (symmetric with
   * `ClientDataJsonTooLarge`). Real assertions are ~37 bytes; the cap
   * rejects oversized input BEFORE it is hashed, since this path is
   * reachable without a valid signature.
   */
  126: {message:"AuthenticatorDataTooLarge"}
}

/**
 * Full signer description used by `__constructor`, `add_signer` and
 * `update_signer`.
 */
export type Signer = {tag: "Policy", values: readonly [string, SignerExpiration, SignerLimits, SignerStorage]} | {tag: "Ed25519", values: readonly [Buffer, SignerExpiration, SignerLimits, SignerStorage]} | {tag: "Secp256r1", values: readonly [Buffer, Buffer, SignerExpiration, SignerLimits, SignerStorage]};

/**
 * A signature entry in the signatures map. `Policy` carries no signature
 * material: inclusion of the policy key authorizes an on-chain `policy__`
 * check instead.
 */
export type Signature = {tag: "Policy", values: void} | {tag: "Ed25519", values: readonly [Buffer]} | {tag: "Secp256r1", values: readonly [Secp256r1Signature]};

/**
 * Storage key identifying a signer. Secp256r1 carries the WebAuthn
 * credential id (`keyId`).
 */
export type SignerKey = {tag: "Policy", values: readonly [string]} | {tag: "Ed25519", values: readonly [Buffer]} | {tag: "Secp256r1", values: readonly [Buffer]};

/**
 * Stored signer value. Secp256r1 carries the SEC-1 uncompressed public key.
 */
export type SignerVal = {tag: "Policy", values: readonly [SignerExpiration, SignerLimits]} | {tag: "Ed25519", values: readonly [SignerExpiration, SignerLimits]} | {tag: "Secp256r1", values: readonly [Buffer, SignerExpiration, SignerLimits]};

/**
 * The `__check_auth` signature object: a map of signer keys to signatures.
 * Map ordering is the host's ScVal ordering. EVERY entry must verify (pass
 * 2 of `__check_auth`) — include only signatures that are needed.
 */
export type Signatures = readonly [Map<SignerKey, Signature>];

/**
 * Restrictions on which auth contexts a signer may authorize.
 * 
 * - `None`: unlimited. The signer can authorize anything, including
 * `CreateContract*` (deploy) contexts and this wallet's own admin
 * functions.
 * - `Some(empty map)`: NO permissions (fail-closed). The signer can authorize
 * nothing except removing itself (see below). v1 breaking change: pre-1.0
 * an empty map meant unlimited, leaving two unlimited encodings and no
 * "none" encoding.
 * - `Some({address -> None})`: the signer may authorize any invocation of
 * contract `address`, with no co-signers required.
 * - `Some({address -> Some([keys])})`: the signer may authorize invocations
 * of contract `address` only if every listed key also APPROVES. The listed
 * keys are required CO-SIGNERS.
 * 
 * ## Required co-signers are scope-independent approvers
 * 
 * A required co-signer's OWN `SignerLimits` do NOT constrain its co-signer
 * role — a key's limits govern only its INDEPENDENT authority (whether it can
 * cover a context on its own). This is symmetric across key kinds:
 * 
 * - A non-policy r
 */
export type SignerLimits = readonly [Option<Map<string, Option<Array<SignerKey>>>>];

/**
 * Which durability a signer entry is stored under. At most one entry exists
 * per signer key; lookups check Temporary before Persistent.
 */
export type SignerStorage = {tag: "Persistent", values: void} | {tag: "Temporary", values: void};

/**
 * Optional expiration for a signer as a UNIX timestamp in seconds, INCLUSIVE:
 * the signer is valid while `ledger timestamp <= expiration` and expired once
 * `ledger timestamp > expiration`. `None` never expires.
 * 
 * v1 breaking change: this was a ledger sequence number pre-1.0. Timestamps
 * don't drift with changes to ledger close time (e.g. CAP-0070 dynamic
 * timing), which ledger-sequence expirations did.
 */
export type SignerExpiration = readonly [Option<u64>];


/**
 * A WebAuthn assertion over the Soroban authorization payload. The signed
 * message is `authenticator_data || sha256(client_data_json)` and the
 * payload binding lives in clientDataJSON's `challenge` field.
 */
export interface Secp256r1Signature {
  authenticator_data: Buffer;
  client_data_json: Buffer;
  signature: Buffer;
}





export interface Client {
  /**
   * Construct and simulate a install transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Called by the wallet as it adds this policy as a signer.
   */
  install: ({wallet}: {wallet: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a is_payee transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_payee: ({wallet, payee}: {wallet: string, payee: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a policy__ transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Approve or reject everything this signer is trying to authorise.
   * 
   * Returning normally approves; panicking rejects. Every context in the
   * transaction is checked, so a caller cannot smuggle a forbidden call
   * through by bundling it with a permitted one.
   */
  policy__: ({source, signer, contexts}: {source: string, signer: SignerKey, contexts: Array<any>}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a configure transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set the rules for a wallet.
   * 
   * The first call needs **both** signatures: the steward's, and the
   * wallet's. That consent is the whole basis for the arrangement being
   * legitimate rather than imposed — the recipient agrees to the constraint
   * before any money arrives. Later changes need only the steward, so the
   * recipient cannot quietly raise their own cap.
   */
  configure: ({steward, wallet, token, cap, period}: {steward: string, wallet: string, token: string, cap: i128, period: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a remaining transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * How much this wallet may still spend in the current window.
   */
  remaining: ({wallet}: {wallet: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a uninstall transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Permissionless cleanup once the policy is no longer a signer.
   * 
   * The spend record is deliberately left behind. Clearing it would let a
   * wallet reset its own window by removing and re-adding the policy.
   */
  uninstall: ({wallet}: {wallet: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a deny_payee transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  deny_payee: ({steward, wallet, payee}: {steward: string, wallet: string, payee: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_policy transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_policy: ({wallet}: {wallet: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Policy>>>

  /**
   * Construct and simulate a allow_payee transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  allow_payee: ({steward, wallet, payee}: {steward: string, wallet: string, payee: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a is_installed transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_installed: ({wallet}: {wallet: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
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
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABQAAAAAAAAAAAAAABVNwZW50AAAAAAAAAQAAAAVzcGVudAAAAAAAAAQAAAAAAAAABndhbGxldAAAAAAAEwAAAAEAAAAAAAAABXBheWVlAAAAAAAAEwAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAAAAAACXJlbWFpbmluZwAAAAAAAAsAAAAAAAAAAg==",
        "AAAAAQAAADpQZXItd2FsbGV0IHJ1bGVzLiBPbmUgcG9saWN5IGNvbnRyYWN0IHNlcnZlcyBtYW55IHdhbGxldHMuAAAAAAAAAAAABlBvbGljeQAAAAAABgAAAClNb3N0IHRoYXQgbWF5IGJlIHNwZW50IHdpdGhpbiBvbmUgcGVyaW9kLgAAAAAAAANjYXAAAAAACwAAACpMZW5ndGggb2YgdGhlIHNwZW5kaW5nIHdpbmRvdywgaW4gc2Vjb25kcy4AAAAAAAZwZXJpb2QAAAAAAAYAAAA4U3BlbnQgc28gZmFyIGluIHRoZSB3aW5kb3cgdGhhdCBiZWdhbiBhdCBgd2luZG93X3N0YXJ0YC4AAAAFc3BlbnQAAAAAAAALAAAAOFdobyBtYXkgZWRpdCB0aGUgYWxsb3dsaXN0LiBEZWxpYmVyYXRlbHkgbm90IHRoZSB3YWxsZXQuAAAAB3N0ZXdhcmQAAAAAEwAAACRUaGUgb25seSBhc3NldCB0aGlzIHNpZ25lciBtYXkgbW92ZS4AAAAFdG9rZW4AAAAAAAATAAAAAAAAAAx3aW5kb3dfc3RhcnQAAAAG",
        "AAAABAAAANFOYW1lZCBgU3BlbmRFcnJvcmAgcmF0aGVyIHRoYW4gYEVycm9yYCBvbiBwdXJwb3NlOiB0aGUgc21hcnQgd2FsbGV0CmludGVyZmFjZSBleHBvcnRzIGl0cyBvd24gYEVycm9yYCwgYW5kIHR3byBzcGVjIGVudHJpZXMgdW5kZXIgb25lIG5hbWUgbWFrZQp0aGUgY29udHJhY3QncyBnZW5lcmF0ZWQgYmluZGluZ3MgYW1iaWd1b3VzIGFib3V0IHdoaWNoIGlzIHdoaWNoLgAAAAAAAAAAAAAKU3BlbmRFcnJvcgAAAAAACwAAAAAAAAANTm90Q29uZmlndXJlZAAAAAAAAAEAAAAAAAAAEUFscmVhZHlDb25maWd1cmVkAAAAAAAAAgAAAAAAAAAKTm90U3Rld2FyZAAAAAAAAwAAAERUaGUgc2lnbmVyIHRyaWVkIHRvIGF1dGhvcmlzZSBzb21ldGhpbmcgb3RoZXIgdGhhbiBhIHRva2VuIHRyYW5zZmVyLgAAAA1Gb3JiaWRkZW5DYWxsAAAAAAAABAAAADNUaGUgdHJhbnNmZXIncyBkZXN0aW5hdGlvbiBpcyBub3QgYSB2ZXJpZmllZCBwYXllZS4AAAAAD1BheWVlTm90QWxsb3dlZAAAAAAFAAAAOVRoZSB0cmFuc2ZlciB3b3VsZCBleGNlZWQgdGhlIGNhcCBmb3IgdGhlIGN1cnJlbnQgcGVyaW9kLgAAAAAAAAtDYXBFeGNlZWRlZAAAAAAGAAAAPlRoZSB0cmFuc2ZlciBtb3ZlcyBzb21lb25lIGVsc2UncyBmdW5kcywgb3IgYSBkaWZmZXJlbnQgYXNzZXQuAAAAAAARRm9yYmlkZGVuVHJhbnNmZXIAAAAAAAAHAAAAAAAAAA1JbnZhbGlkQW1vdW50AAAAAAAACAAAAAAAAAAKSW52YWxpZENhcAAAAAAACQAAAAAAAAAMQWxyZWFkeVBheWVlAAAACgAAAAAAAAAITm90UGF5ZWUAAAAL",
        "AAAABQAAAAAAAAAAAAAACkNvbmZpZ3VyZWQAAAAAAAEAAAAHY29uZmlnZAAAAAACAAAAAAAAAAZ3YWxsZXQAAAAAABMAAAABAAAAAAAAAAZwb2xpY3kAAAAAB9AAAAAGUG9saWN5AAAAAAAAAAAAAA==",
        "AAAABQAAAAAAAAAAAAAADFBheWVlQ2hhbmdlZAAAAAEAAAAFcGF5ZWUAAAAAAAADAAAAAAAAAAZ3YWxsZXQAAAAAABMAAAABAAAAAAAAAAVwYXllZQAAAAAAABMAAAABAAAAAAAAAAdhbGxvd2VkAAAAAAEAAAAAAAAAAA==",
        "AAAAAAAAADhDYWxsZWQgYnkgdGhlIHdhbGxldCBhcyBpdCBhZGRzIHRoaXMgcG9saWN5IGFzIGEgc2lnbmVyLgAAAAdpbnN0YWxsAAAAAAEAAAAAAAAABndhbGxldAAAAAAAEwAAAAA=",
        "AAAAAAAAAAAAAAAIaXNfcGF5ZWUAAAACAAAAAAAAAAZ3YWxsZXQAAAAAABMAAAAAAAAABXBheWVlAAAAAAAAEwAAAAEAAAAB",
        "AAAAAAAAAPdBcHByb3ZlIG9yIHJlamVjdCBldmVyeXRoaW5nIHRoaXMgc2lnbmVyIGlzIHRyeWluZyB0byBhdXRob3Jpc2UuCgpSZXR1cm5pbmcgbm9ybWFsbHkgYXBwcm92ZXM7IHBhbmlja2luZyByZWplY3RzLiBFdmVyeSBjb250ZXh0IGluIHRoZQp0cmFuc2FjdGlvbiBpcyBjaGVja2VkLCBzbyBhIGNhbGxlciBjYW5ub3Qgc211Z2dsZSBhIGZvcmJpZGRlbiBjYWxsCnRocm91Z2ggYnkgYnVuZGxpbmcgaXQgd2l0aCBhIHBlcm1pdHRlZCBvbmUuAAAAAAhwb2xpY3lfXwAAAAMAAAAAAAAABnNvdXJjZQAAAAAAEwAAAAAAAAAGc2lnbmVyAAAAAAfQAAAACVNpZ25lcktleQAAAAAAAAAAAAAIY29udGV4dHMAAAPqAAAH0AAAAAdDb250ZXh0AAAAAAA=",
        "AAAAAAAAAV9TZXQgdGhlIHJ1bGVzIGZvciBhIHdhbGxldC4KClRoZSBmaXJzdCBjYWxsIG5lZWRzICoqYm90aCoqIHNpZ25hdHVyZXM6IHRoZSBzdGV3YXJkJ3MsIGFuZCB0aGUKd2FsbGV0J3MuIFRoYXQgY29uc2VudCBpcyB0aGUgd2hvbGUgYmFzaXMgZm9yIHRoZSBhcnJhbmdlbWVudCBiZWluZwpsZWdpdGltYXRlIHJhdGhlciB0aGFuIGltcG9zZWQg4oCUIHRoZSByZWNpcGllbnQgYWdyZWVzIHRvIHRoZSBjb25zdHJhaW50CmJlZm9yZSBhbnkgbW9uZXkgYXJyaXZlcy4gTGF0ZXIgY2hhbmdlcyBuZWVkIG9ubHkgdGhlIHN0ZXdhcmQsIHNvIHRoZQpyZWNpcGllbnQgY2Fubm90IHF1aWV0bHkgcmFpc2UgdGhlaXIgb3duIGNhcC4AAAAACWNvbmZpZ3VyZQAAAAAAAAUAAAAAAAAAB3N0ZXdhcmQAAAAAEwAAAAAAAAAGd2FsbGV0AAAAAAATAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAAA2NhcAAAAAALAAAAAAAAAAZwZXJpb2QAAAAAAAYAAAABAAAD6QAAAAIAAAfQAAAAClNwZW5kRXJyb3IAAA==",
        "AAAAAAAAADtIb3cgbXVjaCB0aGlzIHdhbGxldCBtYXkgc3RpbGwgc3BlbmQgaW4gdGhlIGN1cnJlbnQgd2luZG93LgAAAAAJcmVtYWluaW5nAAAAAAAAAQAAAAAAAAAGd2FsbGV0AAAAAAATAAAAAQAAA+kAAAALAAAH0AAAAApTcGVuZEVycm9yAAA=",
        "AAAAAAAAAMZQZXJtaXNzaW9ubGVzcyBjbGVhbnVwIG9uY2UgdGhlIHBvbGljeSBpcyBubyBsb25nZXIgYSBzaWduZXIuCgpUaGUgc3BlbmQgcmVjb3JkIGlzIGRlbGliZXJhdGVseSBsZWZ0IGJlaGluZC4gQ2xlYXJpbmcgaXQgd291bGQgbGV0IGEKd2FsbGV0IHJlc2V0IGl0cyBvd24gd2luZG93IGJ5IHJlbW92aW5nIGFuZCByZS1hZGRpbmcgdGhlIHBvbGljeS4AAAAAAAl1bmluc3RhbGwAAAAAAAABAAAAAAAAAAZ3YWxsZXQAAAAAABMAAAAA",
        "AAAAAAAAAAAAAAAKZGVueV9wYXllZQAAAAAAAwAAAAAAAAAHc3Rld2FyZAAAAAATAAAAAAAAAAZ3YWxsZXQAAAAAABMAAAAAAAAABXBheWVlAAAAAAAAEwAAAAEAAAPpAAAAAgAAB9AAAAAKU3BlbmRFcnJvcgAA",
        "AAAAAAAAAAAAAAAKZ2V0X3BvbGljeQAAAAAAAQAAAAAAAAAGd2FsbGV0AAAAAAATAAAAAQAAA+kAAAfQAAAABlBvbGljeQAAAAAH0AAAAApTcGVuZEVycm9yAAA=",
        "AAAAAAAAAAAAAAALYWxsb3dfcGF5ZWUAAAAAAwAAAAAAAAAHc3Rld2FyZAAAAAATAAAAAAAAAAZ3YWxsZXQAAAAAABMAAAAAAAAABXBheWVlAAAAAAAAEwAAAAEAAAPpAAAAAgAAB9AAAAAKU3BlbmRFcnJvcgAA",
        "AAAAAAAAAAAAAAAMaXNfaW5zdGFsbGVkAAAAAQAAAAAAAAAGd2FsbGV0AAAAAAATAAAAAQAAAAE=",
        "AAAABAAAAVBDb250cmFjdCBlcnJvcnMuCgpEZWxpYmVyYXRlbHkgcmVudW1iZXJlZCBmb3IgdGhlIHYxIGludGVyZmFjZSBzbyB0aGUgZXJyb3Igc3BhY2UgaXMgZGlzam9pbnQKZnJvbSB0aGUgbGVnYWN5IChwcmUtMS4wKSBjb250cmFjdCdzIDEtOSByYW5nZS4gQSBjbGllbnQgZGVjb2RpbmcgYW4gZXJyb3IKY29kZSA8IDEwMCBpcyB0YWxraW5nIHRvIGEgbGVnYWN5IHdhbGxldC4KClJhbmdlczoKLSAxMDAtMTA5OiBzaWduZXIgc3RvcmFnZSAvIG1hbmFnZW1lbnQKLSAxMTAtMTE5OiBhdXRoIChgX19jaGVja19hdXRoYCkKLSAxMjAtMTI5OiBXZWJBdXRobiAoc2VjcDI1NnIxKSB2ZXJpZmljYXRpb24AAAAAAAAABUVycm9yAAAAAAAADgAAADlUaGUgcmVxdWVzdGVkIHNpZ25lciBkb2VzIG5vdCBleGlzdCBvbiB0aGlzIHNtYXJ0IHdhbGxldC4AAAAAAAAOU2lnbmVyTm90Rm91bmQAAAAAAGQAAAA+YGFkZF9zaWduZXJgIHdhcyBjYWxsZWQgd2l0aCBhIHNpZ25lciBrZXkgdGhhdCBhbHJlYWR5IGV4aXN0cy4AAAAAABNTaWduZXJBbHJlYWR5RXhpc3RzAAAAAGUAAAAxVGhlIHNpZ25lcidzIGV4cGlyYXRpb24gdGltZXN0YW1wIGlzIGluIHRoZSBwYXN0LgAAAAAAAA1TaWduZXJFeHBpcmVkAAAAAAAAZgAAA85UaGUgb3BlcmF0aW9uIHdvdWxkIHJlbW92ZSDigJQgb3IgZGVtb3RlIHZpYSBgdXBkYXRlX3NpZ25lcmAg4oCUIHRoZQp3YWxsZXQncyBMQVNUIGR1cmFibGUgYWRtaW4gc2lnbmVyOiBhIHNpZ25lciBzdG9yZWQgYFBlcnNpc3RlbnRgLApub24tZXhwaXJpbmcgKGBTaWduZXJFeHBpcmF0aW9uKE5vbmUpYCksIGFuZCBpbmRlcGVuZGVudGx5CmFkbWluLWNhcGFibGUg4oCUIGVpdGhlciB1bmxpbWl0ZWQgKGBTaWduZXJMaW1pdHMoTm9uZSlgKSBvciBob2xkaW5nIGEKbGltaXRzIGVudHJ5IGZvciB0aGUgd2FsbGV0J3Mgb3duIGFkZHJlc3Mgd2l0aCBubyByZXF1aXJlZCBjby1zaWduZXJzCihgTm9uZWAgb3IgYW4gZW1wdHkgbGlzdCkuIFdpdGggemVybyBzdWNoIHNpZ25lcnMgbm8gYGFkZF9zaWduZXJgIG9yCmB1cGdyYWRlYCBjb3VsZCBldmVyIGJlIGF1dGhvcml6ZWQgYWdhaW4sIHBlcm1hbmVudGx5IGxvY2tpbmcgdGhlCndhbGxldCBvbiBhbiBpbW11dGFibGUgbmV0d29yaywgc28gdGhlIHRyYW5zaXRpb24gaXMgcmVqZWN0ZWQuClRvIHJldGlyZSB0aGUgbGFzdCBhZG1pbiBzaWduZXIsIGFkZCAob3IgcHJvbW90ZSkgYSByZXBsYWNlbWVudApkdXJhYmxlIGFkbWluIHNpZ25lciBmaXJzdC4KCkNhc2UgdGhpcyBndWFyZCBDQU5OT1QgY2F0Y2ggKHN0YXRpY2FsbHkgdW5kZWNpZGFibGUpOiBhIFBPTElDWQpzaWduZXIgd2l0aCBhbiBhZG1pbi1zaGFwZWQgZ3JhbnQgY291bnRzIGFzIGFuIGFkbWluIGV2ZW4gaWYgaXRzCmBwb2xpY3lfX2AgcmVqZWN0cyBldmVyeSByZXF1ZXN0LiBJZiBzdWNoIGEgcG9saWN5IGlzIHlvdXIgb25seQpyZW1haW5pbmcgYWRtaW4sIHRoZSB3YWxsZXQncyBhZG1pbiBzdXJmYWNlIGlzIHVucmVjb3ZlcmFibGUgZXZlbgp0aG91Z2ggdGhlIHNpZ25lciBzdGlsbCBleGlzdHMuIEtlZXAgYSBub24tcG9saWN5IGFkbWluIChvciBhIHNlY29uZAphZG1pbikgYXQgYWxsIHRpbWVzLgAAAAAAD0xhc3RBZG1pblNpZ25lcgAAAABnAAAC0VRoZSBvcGVyYXRpb24gd291bGQgbGVhdmUgdGhlIHdhbGxldCB3aXRob3V0IGFueSBEVVJBQkxFIHNpZ25lciDigJQgb25lCnN0b3JlZCBgUGVyc2lzdGVudGAgd2l0aCBgU2lnbmVyRXhwaXJhdGlvbihOb25lKWAsIGFueSBsaW1pdHMuIEZpcmVkCmJ5IGByZW1vdmVfc2lnbmVyYCAocmVtb3ZpbmcgdGhlIGxhc3QgZHVyYWJsZSBzaWduZXIpLCBgdXBkYXRlX3NpZ25lcmAKKGRlbW90aW5nIGl0IHRvIGBUZW1wb3JhcnlgIHN0b3JhZ2Ugb3IgdG8gYW4gZXhwaXJpbmcgdmFsdWUpLCBhbmQKYF9fY29uc3RydWN0b3JgICh0aGUgd2FsbGV0J3MgZmlyc3Qgc2lnbmVyIG11c3QgYmUgZHVyYWJsZSkuCk5vbi1kdXJhYmxlIHNpZ25lcnMgY2FuIGV2aWN0IG9yIGV4cGlyZSB3aXRoIE5PIGNvbnRyYWN0CmNhbGwsIHNvIG9ubHkgYSBkdXJhYmxlIHNpZ25lciBndWFyYW50ZWVzIHRoZSB3YWxsZXQgYWx3YXlzIGtlZXBzIGF0CmxlYXN0IG9uZSBsaXZlIHNpZ25lcjsgd2l0aCB6ZXJvIGxpdmUgc2lnbmVycyBub3RoaW5nIOKAlCBub3QgZXZlbgpgYWRkX3NpZ25lcmAg4oCUIGNhbiBldmVyIGJlIGF1dGhvcml6ZWQgYWdhaW4uIFRoaXMgaXMgdGhlCmNsYXNzaWZpY2F0aW9uLWluZGVwZW5kZW50IGJhY2tzdG9wIGJlbmVhdGggYExhc3RBZG1pblNpZ25lcmAuIFRvCnJldGlyZSB0aGUgbGFzdCBkdXJhYmxlIHNpZ25lciwgYWRkIGEgZHVyYWJsZSByZXBsYWNlbWVudCBmaXJzdC4AAAAAAAAKTGFzdFNpZ25lcgAAAAAAaAAAAF1ObyBzaWduZXIgaW4gdGhlIHNpZ25hdHVyZXMgbWFwIGlzIHBlcm1pdHRlZCB0byBhdXRob3JpemUgb25lIG9mIHRoZQpyZXF1ZXN0ZWQgYXV0aCBjb250ZXh0cy4AAAAAAAAOTWlzc2luZ0NvbnRleHQAAAAAAG4AAACJQSBzaWduYXR1cmUncyB2YXJpYW50IGRvZXMgbm90IG1hdGNoIHRoZSBzdG9yZWQgc2lnbmVyIGl0IGNsYWltcyB0byBiZQpmb3IgKGUuZy4gYW4gRWQyNTUxOSBzaWduYXR1cmUgc3VibWl0dGVkIGZvciBhIFBvbGljeSBzaWduZXIga2V5KS4AAAAAAAAZU2lnbmF0dXJlS2V5VmFsdWVNaXNtYXRjaAAAAAAAAG8AAAAyY2xpZW50RGF0YUpTT04gZXhjZWVkcyB0aGUgMTAyNCBieXRlIHBhcnNlIGJ1ZmZlci4AAAAAABZDbGllbnREYXRhSnNvblRvb0xhcmdlAAAAAAB4AAAARWNsaWVudERhdGFKU09OIGlzIG5vdCBwYXJzZWFibGUgSlNPTiAob3IgaXMgbWlzc2luZyByZXF1aXJlZCBmaWVsZHMpLgAAAAAAABhDbGllbnREYXRhSnNvblBhcnNlRXJyb3IAAAB5AAAAtlRoZSBjaGFsbGVuZ2UgaW4gY2xpZW50RGF0YUpTT04gZG9lcyBub3QgbWF0Y2ggdGhlIGJhc2U2NHVybC1lbmNvZGVkCnNpZ25hdHVyZSBwYXlsb2FkLiBUaGlzIGJpbmRzIHRoZSBXZWJBdXRobiBhc3NlcnRpb24gdG8gdGhlIFNvcm9iYW4KYXV0aG9yaXphdGlvbiBlbnRyeSBhbmQgTVVTVCBOT1QgYmUgd2Vha2VuZWQuAAAAAAAgQ2xpZW50RGF0YUpzb25DaGFsbGVuZ2VJbmNvcnJlY3QAAAB6AAAALGNsaWVudERhdGFKU09OIGB0eXBlYCBpcyBub3QgIndlYmF1dGhuLmdldCIuAAAAE0ludmFsaWRXZWJBdXRoblR5cGUAAAAAewAAAGlhdXRoZW50aWNhdG9yRGF0YSBpcyBzaG9ydGVyIHRoYW4gdGhlIFdlYkF1dGhuIG1pbmltdW0gb2YgMzcgYnl0ZXMKKHJwSWRIYXNoIDMyICsgZmxhZ3MgMSArIHNpZ25Db3VudCA0KS4AAAAAAAAYSW52YWxpZEF1dGhlbnRpY2F0b3JEYXRhAAAAfAAAAkxUaGUgYXV0aGVudGljYXRvciBkaWQgbm90IHNldCB0aGUgVXNlciBQcmVzZW50IChVUCkgZmxhZy4KClVQLW9ubHkgaXMgdGhlIGRlbGliZXJhdGUgZGVmYXVsdC4gUmVxdWlyaW5nIFVQIGtlZXBzCnNpbGVudCwgbm9uLWludGVyYWN0aXZlIGFzc2VydGlvbnMgb3V0IHdoaWxlIHN0YXlpbmcgY29tcGF0aWJsZSB3aXRoCmF1dGhlbnRpY2F0b3JzIHRoYXQgY2Fubm90IGRvIFVzZXIgVmVyaWZpY2F0aW9uIChVViDigJQgYmlvbWV0cmljL1BJTikuClVWIGlzIHRoZXJlZm9yZSBOT1QgcmVxdWlyZWQgYnkgdGhpcyBjb250cmFjdC4gQSBkZXBsb3ltZW50IHRoYXQgd2FudHMKVVYtcmVxdWlyZWQgYXNzZXJ0aW9ucyBzaG91bGQgZW5mb3JjZSBpdCBhdCB0aGUgY2xpZW50L3JlbGF5ZXIgbGF5ZXIsCm9yIHZpYSBhIGZ1dHVyZSBwZXItc2lnbmVyIGZsYWcgKHdoaWNoIHdvdWxkIGJlIGEgc2lnbmVyLW1vZGVsIGNoYW5nZSwKbm90IGEgY2hhbmdlIHRvIHRoaXMgY2hlY2spOyB0aGUgY29udHJhY3QgY2Fubm90IHVwZ3JhZGUgVVAtb25seQpzaWduZXJzIHRvIFVWLXJlcXVpcmVkIHJldHJvYWN0aXZlbHkgd2l0aG91dCBzdWNoIGEgZmxhZy4AAAAUVXNlclByZXNlbmNlUmVxdWlyZWQAAAB9AAAA4mF1dGhlbnRpY2F0b3JEYXRhIGV4Y2VlZHMgdGhlIDEwMjQgYnl0ZSBjYXAgKHN5bW1ldHJpYyB3aXRoCmBDbGllbnREYXRhSnNvblRvb0xhcmdlYCkuIFJlYWwgYXNzZXJ0aW9ucyBhcmUgfjM3IGJ5dGVzOyB0aGUgY2FwCnJlamVjdHMgb3ZlcnNpemVkIGlucHV0IEJFRk9SRSBpdCBpcyBoYXNoZWQsIHNpbmNlIHRoaXMgcGF0aCBpcwpyZWFjaGFibGUgd2l0aG91dCBhIHZhbGlkIHNpZ25hdHVyZS4AAAAAABlBdXRoZW50aWNhdG9yRGF0YVRvb0xhcmdlAAAAAAAAfg==",
        "AAAAAgAAAFJGdWxsIHNpZ25lciBkZXNjcmlwdGlvbiB1c2VkIGJ5IGBfX2NvbnN0cnVjdG9yYCwgYGFkZF9zaWduZXJgIGFuZApgdXBkYXRlX3NpZ25lcmAuAAAAAAAAAAAABlNpZ25lcgAAAAAAAwAAAAEAAAAAAAAABlBvbGljeQAAAAAABAAAABMAAAfQAAAAEFNpZ25lckV4cGlyYXRpb24AAAfQAAAADFNpZ25lckxpbWl0cwAAB9AAAAANU2lnbmVyU3RvcmFnZQAAAAAAAAEAAAAAAAAAB0VkMjU1MTkAAAAABAAAA+4AAAAgAAAH0AAAABBTaWduZXJFeHBpcmF0aW9uAAAH0AAAAAxTaWduZXJMaW1pdHMAAAfQAAAADVNpZ25lclN0b3JhZ2UAAAAAAAABAAAAAAAAAAlTZWNwMjU2cjEAAAAAAAAFAAAADgAAA+4AAABBAAAH0AAAABBTaWduZXJFeHBpcmF0aW9uAAAH0AAAAAxTaWduZXJMaW1pdHMAAAfQAAAADVNpZ25lclN0b3JhZ2UAAAA=",
        "AAAAAgAAAJ1BIHNpZ25hdHVyZSBlbnRyeSBpbiB0aGUgc2lnbmF0dXJlcyBtYXAuIGBQb2xpY3lgIGNhcnJpZXMgbm8gc2lnbmF0dXJlCm1hdGVyaWFsOiBpbmNsdXNpb24gb2YgdGhlIHBvbGljeSBrZXkgYXV0aG9yaXplcyBhbiBvbi1jaGFpbiBgcG9saWN5X19gCmNoZWNrIGluc3RlYWQuAAAAAAAAAAAAAAlTaWduYXR1cmUAAAAAAAADAAAAAAAAAAAAAAAGUG9saWN5AAAAAAABAAAAAAAAAAdFZDI1NTE5AAAAAAEAAAPuAAAAQAAAAAEAAAAAAAAACVNlY3AyNTZyMQAAAAAAAAEAAAfQAAAAElNlY3AyNTZyMVNpZ25hdHVyZQAA",
        "AAAAAgAAAFlTdG9yYWdlIGtleSBpZGVudGlmeWluZyBhIHNpZ25lci4gU2VjcDI1NnIxIGNhcnJpZXMgdGhlIFdlYkF1dGhuCmNyZWRlbnRpYWwgaWQgKGBrZXlJZGApLgAAAAAAAAAAAAAJU2lnbmVyS2V5AAAAAAAAAwAAAAEAAAAAAAAABlBvbGljeQAAAAAAAQAAABMAAAABAAAAAAAAAAdFZDI1NTE5AAAAAAEAAAPuAAAAIAAAAAEAAAAAAAAACVNlY3AyNTZyMQAAAAAAAAEAAAAO",
        "AAAAAgAAAElTdG9yZWQgc2lnbmVyIHZhbHVlLiBTZWNwMjU2cjEgY2FycmllcyB0aGUgU0VDLTEgdW5jb21wcmVzc2VkIHB1YmxpYyBrZXkuAAAAAAAAAAAAAAlTaWduZXJWYWwAAAAAAAADAAAAAQAAAAAAAAAGUG9saWN5AAAAAAACAAAH0AAAABBTaWduZXJFeHBpcmF0aW9uAAAH0AAAAAxTaWduZXJMaW1pdHMAAAABAAAAAAAAAAdFZDI1NTE5AAAAAAIAAAfQAAAAEFNpZ25lckV4cGlyYXRpb24AAAfQAAAADFNpZ25lckxpbWl0cwAAAAEAAAAAAAAACVNlY3AyNTZyMQAAAAAAAAMAAAPuAAAAQQAAB9AAAAAQU2lnbmVyRXhwaXJhdGlvbgAAB9AAAAAMU2lnbmVyTGltaXRz",
        "AAAAAQAAANNUaGUgYF9fY2hlY2tfYXV0aGAgc2lnbmF0dXJlIG9iamVjdDogYSBtYXAgb2Ygc2lnbmVyIGtleXMgdG8gc2lnbmF0dXJlcy4KTWFwIG9yZGVyaW5nIGlzIHRoZSBob3N0J3MgU2NWYWwgb3JkZXJpbmcuIEVWRVJZIGVudHJ5IG11c3QgdmVyaWZ5IChwYXNzCjIgb2YgYF9fY2hlY2tfYXV0aGApIOKAlCBpbmNsdWRlIG9ubHkgc2lnbmF0dXJlcyB0aGF0IGFyZSBuZWVkZWQuAAAAAAAAAAAKU2lnbmF0dXJlcwAAAAAAAQAAAAAAAAABMAAAAAAAA+wAAAfQAAAACVNpZ25lcktleQAAAAAAB9AAAAAJU2lnbmF0dXJlAAAA",
        "AAAAAQAABABSZXN0cmljdGlvbnMgb24gd2hpY2ggYXV0aCBjb250ZXh0cyBhIHNpZ25lciBtYXkgYXV0aG9yaXplLgoKLSBgTm9uZWA6IHVubGltaXRlZC4gVGhlIHNpZ25lciBjYW4gYXV0aG9yaXplIGFueXRoaW5nLCBpbmNsdWRpbmcKYENyZWF0ZUNvbnRyYWN0KmAgKGRlcGxveSkgY29udGV4dHMgYW5kIHRoaXMgd2FsbGV0J3Mgb3duIGFkbWluCmZ1bmN0aW9ucy4KLSBgU29tZShlbXB0eSBtYXApYDogTk8gcGVybWlzc2lvbnMgKGZhaWwtY2xvc2VkKS4gVGhlIHNpZ25lciBjYW4gYXV0aG9yaXplCm5vdGhpbmcgZXhjZXB0IHJlbW92aW5nIGl0c2VsZiAoc2VlIGJlbG93KS4gdjEgYnJlYWtpbmcgY2hhbmdlOiBwcmUtMS4wCmFuIGVtcHR5IG1hcCBtZWFudCB1bmxpbWl0ZWQsIGxlYXZpbmcgdHdvIHVubGltaXRlZCBlbmNvZGluZ3MgYW5kIG5vCiJub25lIiBlbmNvZGluZy4KLSBgU29tZSh7YWRkcmVzcyAtPiBOb25lfSlgOiB0aGUgc2lnbmVyIG1heSBhdXRob3JpemUgYW55IGludm9jYXRpb24gb2YKY29udHJhY3QgYGFkZHJlc3NgLCB3aXRoIG5vIGNvLXNpZ25lcnMgcmVxdWlyZWQuCi0gYFNvbWUoe2FkZHJlc3MgLT4gU29tZShba2V5c10pfSlgOiB0aGUgc2lnbmVyIG1heSBhdXRob3JpemUgaW52b2NhdGlvbnMKb2YgY29udHJhY3QgYGFkZHJlc3NgIG9ubHkgaWYgZXZlcnkgbGlzdGVkIGtleSBhbHNvIEFQUFJPVkVTLiBUaGUgbGlzdGVkCmtleXMgYXJlIHJlcXVpcmVkIENPLVNJR05FUlMuCgojIyBSZXF1aXJlZCBjby1zaWduZXJzIGFyZSBzY29wZS1pbmRlcGVuZGVudCBhcHByb3ZlcnMKCkEgcmVxdWlyZWQgY28tc2lnbmVyJ3MgT1dOIGBTaWduZXJMaW1pdHNgIGRvIE5PVCBjb25zdHJhaW4gaXRzIGNvLXNpZ25lcgpyb2xlIOKAlCBhIGtleSdzIGxpbWl0cyBnb3Zlcm4gb25seSBpdHMgSU5ERVBFTkRFTlQgYXV0aG9yaXR5ICh3aGV0aGVyIGl0IGNhbgpjb3ZlciBhIGNvbnRleHQgb24gaXRzIG93bikuIFRoaXMgaXMgc3ltbWV0cmljIGFjcm9zcyBrZXkga2luZHM6CgotIEEgbm9uLXBvbGljeSByAAAAAAAAAAxTaWduZXJMaW1pdHMAAAABAAAAAAAAAAEwAAAAAAAD6AAAA+wAAAATAAAD6AAAA+oAAAfQAAAACVNpZ25lcktleQAAAA==",
        "AAAAAgAAAIRXaGljaCBkdXJhYmlsaXR5IGEgc2lnbmVyIGVudHJ5IGlzIHN0b3JlZCB1bmRlci4gQXQgbW9zdCBvbmUgZW50cnkgZXhpc3RzCnBlciBzaWduZXIga2V5OyBsb29rdXBzIGNoZWNrIFRlbXBvcmFyeSBiZWZvcmUgUGVyc2lzdGVudC4AAAAAAAAADVNpZ25lclN0b3JhZ2UAAAAAAAACAAAAAAAAAAAAAAAKUGVyc2lzdGVudAAAAAAAAAAAAAAAAAAJVGVtcG9yYXJ5AAAA",
        "AAAAAQAAAY5PcHRpb25hbCBleHBpcmF0aW9uIGZvciBhIHNpZ25lciBhcyBhIFVOSVggdGltZXN0YW1wIGluIHNlY29uZHMsIElOQ0xVU0lWRToKdGhlIHNpZ25lciBpcyB2YWxpZCB3aGlsZSBgbGVkZ2VyIHRpbWVzdGFtcCA8PSBleHBpcmF0aW9uYCBhbmQgZXhwaXJlZCBvbmNlCmBsZWRnZXIgdGltZXN0YW1wID4gZXhwaXJhdGlvbmAuIGBOb25lYCBuZXZlciBleHBpcmVzLgoKdjEgYnJlYWtpbmcgY2hhbmdlOiB0aGlzIHdhcyBhIGxlZGdlciBzZXF1ZW5jZSBudW1iZXIgcHJlLTEuMC4gVGltZXN0YW1wcwpkb24ndCBkcmlmdCB3aXRoIGNoYW5nZXMgdG8gbGVkZ2VyIGNsb3NlIHRpbWUgKGUuZy4gQ0FQLTAwNzAgZHluYW1pYwp0aW1pbmcpLCB3aGljaCBsZWRnZXItc2VxdWVuY2UgZXhwaXJhdGlvbnMgZGlkLgAAAAAAAAAAABBTaWduZXJFeHBpcmF0aW9uAAAAAQAAAAAAAAABMAAAAAAAA+gAAAAG",
        "AAAAAQAAAMhBIFdlYkF1dGhuIGFzc2VydGlvbiBvdmVyIHRoZSBTb3JvYmFuIGF1dGhvcml6YXRpb24gcGF5bG9hZC4gVGhlIHNpZ25lZAptZXNzYWdlIGlzIGBhdXRoZW50aWNhdG9yX2RhdGEgfHwgc2hhMjU2KGNsaWVudF9kYXRhX2pzb24pYCBhbmQgdGhlCnBheWxvYWQgYmluZGluZyBsaXZlcyBpbiBjbGllbnREYXRhSlNPTidzIGBjaGFsbGVuZ2VgIGZpZWxkLgAAAAAAAAASU2VjcDI1NnIxU2lnbmF0dXJlAAAAAAADAAAAAAAAABJhdXRoZW50aWNhdG9yX2RhdGEAAAAAAA4AAAAAAAAAEGNsaWVudF9kYXRhX2pzb24AAAAOAAAAAAAAAAlzaWduYXR1cmUAAAAAAAPuAAAAQA==",
        "AAAABQAAASBUaGUgY29udHJhY3QncyB3YXNtIHdhcyByZXBsYWNlZCB2aWEgYHVwZ3JhZGVgLiBgb2xkX2hhc2hgIGlzIGBOb25lYCBvbiBhCndhbGxldCdzIGZpcnN0LWV2ZXIgdXBncmFkZTogdGhlIGhvc3QgZXhwb3NlcyBubyB3YXkgZm9yIGEgY29udHJhY3QgdG8KcmVhZCBpdHMgb3duIGV4ZWN1dGFibGUgaGFzaCwgc28gdGhlIHdhbGxldCBjYWNoZXMgdGhlIGhhc2ggaW4gaW5zdGFuY2UKc3RvcmFnZSBhdCBlYWNoIHVwZ3JhZGUgYW5kIHRoZSBnZW5lc2lzIGhhc2ggaXMgdW5rbm93YWJsZSBpbi1jb250cmFjdC4AAAAAAAAACFVwZ3JhZGVkAAAAAQAAAAh1cGdyYWRlZAAAAAIAAAAAAAAACG9sZF9oYXNoAAAD6AAAA+4AAAAgAAAAAAAAAAAAAAAIbmV3X2hhc2gAAAPuAAAAIAAAAAAAAAAC",
        "AAAABQAAADlBIHNpZ25lciB3YXMgYWRkZWQgKHZpYSBgX19jb25zdHJ1Y3RvcmAgb3IgYGFkZF9zaWduZXJgKS4AAAAAAAAAAAAAC1NpZ25lckFkZGVkAAAAAAEAAAAMc2lnbmVyX2FkZGVkAAAAAwAAAAAAAAADa2V5AAAAB9AAAAAJU2lnbmVyS2V5AAAAAAAAAQAAAAAAAAADdmFsAAAAB9AAAAAJU2lnbmVyVmFsAAAAAAAAAAAAAAAAAAAHc3RvcmFnZQAAAAfQAAAADVNpZ25lclN0b3JhZ2UAAAAAAAAAAAAAAg==",
        "AAAABQAAAGFBIHNpZ25lciB3YXMgcmVtb3ZlZCB2aWEgYHJlbW92ZV9zaWduZXJgLiBgc3RvcmFnZWAgaXMgdGhlIGR1cmFiaWxpdHkgdGhlCmVudHJ5IHdhcyByZW1vdmVkIGZyb20uAAAAAAAAAAAAAA1TaWduZXJSZW1vdmVkAAAAAAAAAQAAAA5zaWduZXJfcmVtb3ZlZAAAAAAAAgAAAAAAAAADa2V5AAAAB9AAAAAJU2lnbmVyS2V5AAAAAAAAAQAAAAAAAAAHc3RvcmFnZQAAAAfQAAAADVNpZ25lclN0b3JhZ2UAAAAAAAAAAAAAAg==",
        "AAAABQAAADRBbiBleGlzdGluZyBzaWduZXIgd2FzIG1vZGlmaWVkIHZpYSBgdXBkYXRlX3NpZ25lcmAuAAAAAAAAAA1TaWduZXJVcGRhdGVkAAAAAAAAAQAAAA5zaWduZXJfdXBkYXRlZAAAAAAABAAAAAAAAAADa2V5AAAAB9AAAAAJU2lnbmVyS2V5AAAAAAAAAQAAAAAAAAADdmFsAAAAB9AAAAAJU2lnbmVyVmFsAAAAAAAAAAAAAAAAAAAHc3RvcmFnZQAAAAfQAAAADVNpZ25lclN0b3JhZ2UAAAAAAAAAAAAAAAAAAAtvbGRfc3RvcmFnZQAAAAfQAAAADVNpZ25lclN0b3JhZ2UAAAAAAAAAAAAAAg==" ]),
      options
    )
  }
  public readonly fromJSON = {
    install: this.txFromJSON<null>,
        is_payee: this.txFromJSON<boolean>,
        policy__: this.txFromJSON<null>,
        configure: this.txFromJSON<Result<void>>,
        remaining: this.txFromJSON<Result<i128>>,
        uninstall: this.txFromJSON<null>,
        deny_payee: this.txFromJSON<Result<void>>,
        get_policy: this.txFromJSON<Result<Policy>>,
        allow_payee: this.txFromJSON<Result<void>>,
        is_installed: this.txFromJSON<boolean>
  }
}