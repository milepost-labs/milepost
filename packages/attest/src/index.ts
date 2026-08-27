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
    contractId: "CCOVBEADD2GEVZD3XHCKGIVWLD55CF7IF2PPA3X3LEIN3FWZKLLIJOZ4",
  }
} as const

export const Errors = {
  1: {message:"SchemaNotFound"},
  2: {message:"SchemaAlreadyExists"},
  3: {message:"AttestationNotFound"},
  4: {message:"NotRevocable"},
  5: {message:"NotAttester"},
  6: {message:"AlreadyRevoked"},
  7: {message:"ExpiryInPast"},
  /**
   * The schema restricts who may attest, and this attester is not on the list.
   */
  8: {message:"AttesterNotAuthorized"}
}


/**
 * A claim template. `definition` is an opaque, human-readable description of
 * what the claim means and how `data_hash` should be interpreted — the registry
 * never parses it.
 */
export interface Schema {
  /**
 * Who registered the schema. Only meaningful when `restricted` is set.
 */
authority: string;
  definition: string;
  /**
 * When true, only `authority` may attest under this schema. When false,
 * anyone may, and consumers are responsible for checking the attester.
 */
restricted: boolean;
  /**
 * Whether attestations under this schema may later be revoked.
 */
revocable: boolean;
  uid: Buffer;
}




export interface Attestation {
  attester: string;
  created_at: u64;
  /**
 * Hash of the off-chain payload. Kept as a hash so the registry stays cheap
 * and the payload can live anywhere the parties agree on.
 */
data_hash: Buffer;
  /**
 * Unix seconds after which the claim no longer counts as valid. `None`
 * means it never expires on its own.
 */
expires_at: Option<u64>;
  /**
 * `None` until withdrawn. Deliberately not a `0` sentinel: the ledger
 * timestamp is genuinely `0` early on, which would make the first
 * revocation indistinguishable from no revocation at all.
 */
revoked_at: Option<u64>;
  schema: Buffer;
  /**
 * Who the claim is *about*.
 */
subject: string;
  uid: Buffer;
}


export interface Client {
  /**
   * Construct and simulate a get transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Fetch a claim. Callers gating value on this **must** check `subject`,
   * `schema` and `attester` against what they expected — a valid attestation
   * by the wrong party is still a valid attestation.
   */
  get: ({uid}: {uid: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Attestation>>>

  /**
   * Construct and simulate a attest transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Make a claim about `subject`. Returns the attestation id that consumers
   * will later verify.
   */
  attest: ({attester, schema_uid, subject, data_hash, expires_at}: {attester: string, schema_uid: Buffer, subject: string, data_hash: Buffer, expires_at: Option<u64>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Buffer>>>

  /**
   * Construct and simulate a revoke transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Withdraw a claim. Only the original attester may revoke, and only if the
   * schema allowed it. Revocation is recorded rather than deleted so the
   * history stays auditable.
   */
  revoke: ({attester, uid}: {attester: string, uid: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a verify transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The check a contract gating value should actually use.
   * 
   * [`Attest::is_valid`] deliberately says nothing about who made a claim or
   * what it was about, so using it alone accepts a perfectly valid
   * attestation by the wrong party, under the wrong schema, about someone
   * else entirely. Rather than trust every caller to remember all three
   * comparisons, this does them here, in one call.
   */
  verify: ({uid, subject, schema, attester}: {uid: Buffer, subject: string, schema: Buffer, attester: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a is_valid transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Whether the claim exists, has not been revoked, and has not expired.
   * Says nothing about *who* made it or what it was about — prefer
   * [`Attest::verify`] when gating anything of value.
   */
  is_valid: ({uid}: {uid: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a keepalive transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Push a stored attestation's archival deadline further out. Permissionless
   * by design: a recipient's proof should not rot because the issuer lost
   * interest, and anyone willing to pay the fee may keep it alive.
   */
  keepalive: ({uid}: {uid: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_schema transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_schema: ({uid}: {uid: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Schema>>>

  /**
   * Construct and simulate a register_schema transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Register a claim template. The returned id is derived from the
   * definition and authority, so registering identical input twice is an
   * error rather than a silent duplicate.
   */
  register_schema: ({authority, definition, revocable, restricted}: {authority: string, definition: string, revocable: boolean, restricted: boolean}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Buffer>>>

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
      new ContractSpec([ "AAAAAAAAAMFGZXRjaCBhIGNsYWltLiBDYWxsZXJzIGdhdGluZyB2YWx1ZSBvbiB0aGlzICoqbXVzdCoqIGNoZWNrIGBzdWJqZWN0YCwKYHNjaGVtYWAgYW5kIGBhdHRlc3RlcmAgYWdhaW5zdCB3aGF0IHRoZXkgZXhwZWN0ZWQg4oCUIGEgdmFsaWQgYXR0ZXN0YXRpb24KYnkgdGhlIHdyb25nIHBhcnR5IGlzIHN0aWxsIGEgdmFsaWQgYXR0ZXN0YXRpb24uAAAAAAAAA2dldAAAAAABAAAAAAAAAAN1aWQAAAAD7gAAACAAAAABAAAD6QAAB9AAAAALQXR0ZXN0YXRpb24AAAAAAw==",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAACAAAAAAAAAAOU2NoZW1hTm90Rm91bmQAAAAAAAEAAAAAAAAAE1NjaGVtYUFscmVhZHlFeGlzdHMAAAAAAgAAAAAAAAATQXR0ZXN0YXRpb25Ob3RGb3VuZAAAAAADAAAAAAAAAAxOb3RSZXZvY2FibGUAAAAEAAAAAAAAAAtOb3RBdHRlc3RlcgAAAAAFAAAAAAAAAA5BbHJlYWR5UmV2b2tlZAAAAAAABgAAAAAAAAAMRXhwaXJ5SW5QYXN0AAAABwAAAEpUaGUgc2NoZW1hIHJlc3RyaWN0cyB3aG8gbWF5IGF0dGVzdCwgYW5kIHRoaXMgYXR0ZXN0ZXIgaXMgbm90IG9uIHRoZSBsaXN0LgAAAAAAFUF0dGVzdGVyTm90QXV0aG9yaXplZAAAAAAAAAg=",
        "AAAAAAAAAFpNYWtlIGEgY2xhaW0gYWJvdXQgYHN1YmplY3RgLiBSZXR1cm5zIHRoZSBhdHRlc3RhdGlvbiBpZCB0aGF0IGNvbnN1bWVycwp3aWxsIGxhdGVyIHZlcmlmeS4AAAAAAAZhdHRlc3QAAAAAAAUAAAAAAAAACGF0dGVzdGVyAAAAEwAAAAAAAAAKc2NoZW1hX3VpZAAAAAAD7gAAACAAAAAAAAAAB3N1YmplY3QAAAAAEwAAAAAAAAAJZGF0YV9oYXNoAAAAAAAD7gAAACAAAAAAAAAACmV4cGlyZXNfYXQAAAAAA+gAAAAGAAAAAQAAA+kAAAPuAAAAIAAAAAM=",
        "AAAAAAAAAKZXaXRoZHJhdyBhIGNsYWltLiBPbmx5IHRoZSBvcmlnaW5hbCBhdHRlc3RlciBtYXkgcmV2b2tlLCBhbmQgb25seSBpZiB0aGUKc2NoZW1hIGFsbG93ZWQgaXQuIFJldm9jYXRpb24gaXMgcmVjb3JkZWQgcmF0aGVyIHRoYW4gZGVsZXRlZCBzbyB0aGUKaGlzdG9yeSBzdGF5cyBhdWRpdGFibGUuAAAAAAAGcmV2b2tlAAAAAAACAAAAAAAAAAhhdHRlc3RlcgAAABMAAAAAAAAAA3VpZAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAXhUaGUgY2hlY2sgYSBjb250cmFjdCBnYXRpbmcgdmFsdWUgc2hvdWxkIGFjdHVhbGx5IHVzZS4KCltgQXR0ZXN0Ojppc192YWxpZGBdIGRlbGliZXJhdGVseSBzYXlzIG5vdGhpbmcgYWJvdXQgd2hvIG1hZGUgYSBjbGFpbSBvcgp3aGF0IGl0IHdhcyBhYm91dCwgc28gdXNpbmcgaXQgYWxvbmUgYWNjZXB0cyBhIHBlcmZlY3RseSB2YWxpZAphdHRlc3RhdGlvbiBieSB0aGUgd3JvbmcgcGFydHksIHVuZGVyIHRoZSB3cm9uZyBzY2hlbWEsIGFib3V0IHNvbWVvbmUKZWxzZSBlbnRpcmVseS4gUmF0aGVyIHRoYW4gdHJ1c3QgZXZlcnkgY2FsbGVyIHRvIHJlbWVtYmVyIGFsbCB0aHJlZQpjb21wYXJpc29ucywgdGhpcyBkb2VzIHRoZW0gaGVyZSwgaW4gb25lIGNhbGwuAAAABnZlcmlmeQAAAAAABAAAAAAAAAADdWlkAAAAA+4AAAAgAAAAAAAAAAdzdWJqZWN0AAAAABMAAAAAAAAABnNjaGVtYQAAAAAD7gAAACAAAAAAAAAACGF0dGVzdGVyAAAAEwAAAAEAAAAB",
        "AAAAAQAAAKtBIGNsYWltIHRlbXBsYXRlLiBgZGVmaW5pdGlvbmAgaXMgYW4gb3BhcXVlLCBodW1hbi1yZWFkYWJsZSBkZXNjcmlwdGlvbiBvZgp3aGF0IHRoZSBjbGFpbSBtZWFucyBhbmQgaG93IGBkYXRhX2hhc2hgIHNob3VsZCBiZSBpbnRlcnByZXRlZCDigJQgdGhlIHJlZ2lzdHJ5Cm5ldmVyIHBhcnNlcyBpdC4AAAAAAAAAAAZTY2hlbWEAAAAAAAUAAABEV2hvIHJlZ2lzdGVyZWQgdGhlIHNjaGVtYS4gT25seSBtZWFuaW5nZnVsIHdoZW4gYHJlc3RyaWN0ZWRgIGlzIHNldC4AAAAJYXV0aG9yaXR5AAAAAAAAEwAAAAAAAAAKZGVmaW5pdGlvbgAAAAAAEAAAAIpXaGVuIHRydWUsIG9ubHkgYGF1dGhvcml0eWAgbWF5IGF0dGVzdCB1bmRlciB0aGlzIHNjaGVtYS4gV2hlbiBmYWxzZSwKYW55b25lIG1heSwgYW5kIGNvbnN1bWVycyBhcmUgcmVzcG9uc2libGUgZm9yIGNoZWNraW5nIHRoZSBhdHRlc3Rlci4AAAAAAApyZXN0cmljdGVkAAAAAAABAAAAPFdoZXRoZXIgYXR0ZXN0YXRpb25zIHVuZGVyIHRoaXMgc2NoZW1hIG1heSBsYXRlciBiZSByZXZva2VkLgAAAAlyZXZvY2FibGUAAAAAAAABAAAAAAAAAAN1aWQAAAAD7gAAACA=",
        "AAAAAAAAALdXaGV0aGVyIHRoZSBjbGFpbSBleGlzdHMsIGhhcyBub3QgYmVlbiByZXZva2VkLCBhbmQgaGFzIG5vdCBleHBpcmVkLgpTYXlzIG5vdGhpbmcgYWJvdXQgKndobyogbWFkZSBpdCBvciB3aGF0IGl0IHdhcyBhYm91dCDigJQgcHJlZmVyCltgQXR0ZXN0Ojp2ZXJpZnlgXSB3aGVuIGdhdGluZyBhbnl0aGluZyBvZiB2YWx1ZS4AAAAACGlzX3ZhbGlkAAAAAQAAAAAAAAADdWlkAAAAA+4AAAAgAAAAAQAAAAE=",
        "AAAABQAAAAAAAAAAAAAAB1Jldm9rZWQAAAAAAQAAAAZyZXZva2UAAAAAAAIAAAAAAAAAA3VpZAAAAAPuAAAAIAAAAAEAAAAAAAAACnJldm9rZWRfYXQAAAAAAAYAAAAAAAAAAA==",
        "AAAAAAAAAM5QdXNoIGEgc3RvcmVkIGF0dGVzdGF0aW9uJ3MgYXJjaGl2YWwgZGVhZGxpbmUgZnVydGhlciBvdXQuIFBlcm1pc3Npb25sZXNzCmJ5IGRlc2lnbjogYSByZWNpcGllbnQncyBwcm9vZiBzaG91bGQgbm90IHJvdCBiZWNhdXNlIHRoZSBpc3N1ZXIgbG9zdAppbnRlcmVzdCwgYW5kIGFueW9uZSB3aWxsaW5nIHRvIHBheSB0aGUgZmVlIG1heSBrZWVwIGl0IGFsaXZlLgAAAAAACWtlZXBhbGl2ZQAAAAAAAAEAAAAAAAAAA3VpZAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAABQAAAAAAAAAAAAAACEF0dGVzdGVkAAAAAQAAAAZhdHRlc3QAAAAAAAMAAAAAAAAAB3N1YmplY3QAAAAAEwAAAAEAAAAAAAAAA3VpZAAAAAPuAAAAIAAAAAEAAAAAAAAAC2F0dGVzdGF0aW9uAAAAB9AAAAALQXR0ZXN0YXRpb24AAAAAAAAAAAA=",
        "AAAAAAAAAAAAAAAKZ2V0X3NjaGVtYQAAAAAAAQAAAAAAAAADdWlkAAAAA+4AAAAgAAAAAQAAA+kAAAfQAAAABlNjaGVtYQAAAAAAAw==",
        "AAAAAQAAAAAAAAAAAAAAC0F0dGVzdGF0aW9uAAAAAAgAAAAAAAAACGF0dGVzdGVyAAAAEwAAAAAAAAAKY3JlYXRlZF9hdAAAAAAABgAAAIFIYXNoIG9mIHRoZSBvZmYtY2hhaW4gcGF5bG9hZC4gS2VwdCBhcyBhIGhhc2ggc28gdGhlIHJlZ2lzdHJ5IHN0YXlzIGNoZWFwCmFuZCB0aGUgcGF5bG9hZCBjYW4gbGl2ZSBhbnl3aGVyZSB0aGUgcGFydGllcyBhZ3JlZSBvbi4AAAAAAAAJZGF0YV9oYXNoAAAAAAAD7gAAACAAAABnVW5peCBzZWNvbmRzIGFmdGVyIHdoaWNoIHRoZSBjbGFpbSBubyBsb25nZXIgY291bnRzIGFzIHZhbGlkLiBgTm9uZWAKbWVhbnMgaXQgbmV2ZXIgZXhwaXJlcyBvbiBpdHMgb3duLgAAAAAKZXhwaXJlc19hdAAAAAAD6AAAAAYAAAC7YE5vbmVgIHVudGlsIHdpdGhkcmF3bi4gRGVsaWJlcmF0ZWx5IG5vdCBhIGAwYCBzZW50aW5lbDogdGhlIGxlZGdlcgp0aW1lc3RhbXAgaXMgZ2VudWluZWx5IGAwYCBlYXJseSBvbiwgd2hpY2ggd291bGQgbWFrZSB0aGUgZmlyc3QKcmV2b2NhdGlvbiBpbmRpc3Rpbmd1aXNoYWJsZSBmcm9tIG5vIHJldm9jYXRpb24gYXQgYWxsLgAAAAAKcmV2b2tlZF9hdAAAAAAD6AAAAAYAAAAAAAAABnNjaGVtYQAAAAAD7gAAACAAAAAZV2hvIHRoZSBjbGFpbSBpcyAqYWJvdXQqLgAAAAAAAAdzdWJqZWN0AAAAABMAAAAAAAAAA3VpZAAAAAPuAAAAIA==",
        "AAAAAAAAAKlSZWdpc3RlciBhIGNsYWltIHRlbXBsYXRlLiBUaGUgcmV0dXJuZWQgaWQgaXMgZGVyaXZlZCBmcm9tIHRoZQpkZWZpbml0aW9uIGFuZCBhdXRob3JpdHksIHNvIHJlZ2lzdGVyaW5nIGlkZW50aWNhbCBpbnB1dCB0d2ljZSBpcyBhbgplcnJvciByYXRoZXIgdGhhbiBhIHNpbGVudCBkdXBsaWNhdGUuAAAAAAAAD3JlZ2lzdGVyX3NjaGVtYQAAAAAEAAAAAAAAAAlhdXRob3JpdHkAAAAAAAATAAAAAAAAAApkZWZpbml0aW9uAAAAAAAQAAAAAAAAAAlyZXZvY2FibGUAAAAAAAABAAAAAAAAAApyZXN0cmljdGVkAAAAAAABAAAAAQAAA+kAAAPuAAAAIAAAAAM=",
        "AAAABQAAAKdFbWl0dGVkIG9uIGV2ZXJ5IHN0YXRlIGNoYW5nZS4gT2ZmLWNoYWluIGluZGV4ZXJzIHJlY29uc3RydWN0ICJhbGwKYXR0ZXN0YXRpb25zIGZvciB0aGlzIHN1YmplY3QiIGZyb20gdGhlc2UsIHdoaWNoIGlzIHdoeSB0aGUgY29udHJhY3QgaXRzZWxmCm5ldmVyIGtlZXBzIHN1Y2ggYSBsaXN0LgAAAAAAAAAAEFNjaGVtYVJlZ2lzdGVyZWQAAAABAAAABnNjaGVtYQAAAAAAAgAAAAAAAAADdWlkAAAAA+4AAAAgAAAAAQAAAAAAAAAGc2NoZW1hAAAAAAfQAAAABlNjaGVtYQAAAAAAAAAAAAA=" ]),
      options
    )
  }
  public readonly fromJSON = {
    get: this.txFromJSON<Result<Attestation>>,
        attest: this.txFromJSON<Result<Buffer>>,
        revoke: this.txFromJSON<Result<void>>,
        verify: this.txFromJSON<boolean>,
        is_valid: this.txFromJSON<boolean>,
        keepalive: this.txFromJSON<Result<void>>,
        get_schema: this.txFromJSON<Result<Schema>>,
        register_schema: this.txFromJSON<Result<Buffer>>
  }
}