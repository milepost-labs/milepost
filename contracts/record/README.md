# Milepost Record

`milepost-record` is a standalone, non-transferable record of recipient
standing. Authorized writers credit completed tranches, while any consumer can
read aggregate participation, tranche count, total received, and a
tamper-evident `history_root`.

The contract stores aggregates rather than an ever-growing transaction list.
Detailed history is reconstructed from `Credited` events and verified by
recomputing the hash chain against the on-chain root.

## Public interface

| Entry point | Parameters | Behaviour and authorization |
| --- | --- | --- |
| `__constructor` | `admin` | Sets the initial administrator when the contract is deployed. |
| `add_writer` | `writer` | Allows an address or contract to credit standing. The current admin must authorize. |
| `remove_writer` | `writer` | Removes an authorized writer without rewriting existing standing. The current admin must authorize. |
| `set_admin` | `new_admin` | Transfers administration. The current admin must authorize. |
| `is_writer` | `addr` | Reports whether an address is currently authorized to write. |
| `get_admin` | none | Returns the current administrator. |
| `credit` | `writer`, `subject`, `programme`, `amount`, `attestation` | Adds one positive tranche to a recipient's standing and returns the updated value. `writer` must authorize and already be registered. |
| `get` | `subject` | Returns the recipient's `Standing` aggregate. |
| `next_root` | `root`, `programme`, `amount`, `attestation`, `timestamp` | Pure helper that computes the next history root for off-chain verification. |
| `keepalive` | `subject` | Permissionlessly extends the persistent storage TTL of existing standing. |

`Standing` contains the subject, number of distinct programmes, number of
tranches, total received, first and latest timestamps, and `history_root`.

## Build, deploy, and invoke

The commands below use Stellar CLI 27.x. The same testnet identity is used as
administrator and as a demonstration writer:

```sh
stellar keys generate alice --network testnet --fund
stellar contract build

ALICE="$(stellar keys address alice)"
RECORD_ID="$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/milepost_record.wasm \
  --source-account alice \
  --network testnet \
  -- --admin "$ALICE")"

stellar contract invoke \
  --id "$RECORD_ID" \
  --source-account alice \
  --network testnet \
  -- add_writer --writer "$ALICE"

stellar contract invoke \
  --id "$RECORD_ID" \
  --source-account alice \
  --network testnet \
  -- is_writer --addr "$ALICE"
```

Run the crate tests with:

```sh
cargo test -p milepost-record
```

## Operational notes

- Only registered writers can call `credit`; allowing an untrusted writer lets
  it manufacture standing and destroys the value of downstream underwriting.
- `amount` must be strictly positive. Credits are append-only and cannot be
  transferred, approved, or reversed.
- `programmes` counts distinct programme addresses, while `tranches` counts
  every credit.
- The contract does not store a detailed history. Index `Credited` events in
  order and feed their exact values into `next_root`; a mismatch with the
  stored `history_root` means the off-chain history is incomplete or altered.
- `keepalive` is permissionless, but it fails when the subject has no standing.
