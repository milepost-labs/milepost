# Milepost Attest

`milepost-attest` is a standalone, schema-based attestation registry for
Soroban. An authority defines what a claim means, an attester makes a claim
about a subject, and consumers verify a specific claim on-chain.

The contract stores attestations by content-derived identifier and emits events
for discovery. It deliberately does not maintain growing on-chain lists; an
indexer should build listings from events.

## Public interface

| Entry point | Parameters | Behaviour and authorization |
| --- | --- | --- |
| `register_schema` | `authority`, `definition`, `revocable`, `restricted` | Registers a claim template and returns its 32-byte UID. `authority` must authorize. If `restricted` is true, only that authority may issue attestations under the schema. |
| `attest` | `attester`, `schema_uid`, `subject`, `data_hash`, `expires_at` | Creates a claim and returns its UID. `attester` must authorize. `expires_at` is an optional Unix timestamp and, when present, must be in the future. |
| `revoke` | `attester`, `uid` | Revokes an existing claim. The original attester must authorize, and the schema must be revocable. |
| `get` | `uid` | Returns the stored `Attestation`, including subject, schema, attester, timestamps, and payload hash. |
| `get_schema` | `uid` | Returns the stored `Schema`. |
| `verify` | `uid`, `subject`, `schema`, `attester` | Returns true only when the claim exists, is unrevoked and unexpired, and all three expected identities match. |
| `is_valid` | `uid` | Returns true only when the claim exists, is unrevoked, and is unexpired. It does **not** check who made the claim or what it is about. |
| `keepalive` | `uid` | Permissionlessly extends the persistent storage TTL of an existing attestation. |

## Build, deploy, and invoke

The commands below use Stellar CLI 27.x, the version expected by the repository.
They assume a funded testnet identity named `alice`:

```sh
stellar keys generate alice --network testnet --fund
stellar contract build

ALICE="$(stellar keys address alice)"
ATTEST_ID="$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/milepost_attest.wasm \
  --source-account alice \
  --network testnet)"

SCHEMA_UID="$(stellar contract invoke \
  --id "$ATTEST_ID" \
  --source-account alice \
  --network testnet \
  -- register_schema \
  --authority "$ALICE" \
  --definition "Proof of course completion, version 1" \
  --revocable true \
  --restricted true)"

stellar contract invoke \
  --id "$ATTEST_ID" \
  --source-account alice \
  --network testnet \
  -- get_schema --uid "$SCHEMA_UID"
```

Run the crate tests with:

```sh
cargo test -p milepost-attest
```

## Important verification rule

Do not use `is_valid` alone to gate money, access, or another valuable action.
It only checks existence, revocation, and expiry, so a valid claim by the wrong
attester, under the wrong schema, or about another subject would still pass.
Use `verify` with the expected `subject`, `schema`, and `attester` instead.

The `definition` and `data_hash` payload are opaque to this contract. Producers
and consumers must agree off-chain on their encoding and meaning. Listing and
search also belong off-chain and should be reconstructed from contract events.
