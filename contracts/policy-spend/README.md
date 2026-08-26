# Milepost Restricted-Spend Policy

`milepost-policy-spend` is a standalone policy signer for Stellar smart
wallets. It permits one signer to authorize transfers of one asset only to
steward-approved payees and only within a configured cap and time window.

One deployed policy contract can serve many wallets; configuration, payees,
installation state, and spending counters are stored per wallet.

## Public interface

| Entry point | Parameters | Behaviour and authorization |
| --- | --- | --- |
| `configure` | `steward`, `wallet`, `token`, `cap`, `period` | Creates or replaces a wallet policy. Initial configuration requires both steward and wallet authorization; later changes require the same steward. `cap` and `period` must be positive. |
| `allow_payee` | `steward`, `wallet`, `payee` | Adds an approved destination. The configured steward must authorize. |
| `deny_payee` | `steward`, `wallet`, `payee` | Removes an approved destination. The configured steward must authorize. |
| `get_policy` | `wallet` | Returns the wallet's policy and current spend-window state. |
| `is_payee` | `wallet`, `payee` | Reports whether a destination is approved. |
| `is_installed` | `wallet` | Reports whether the wallet has called the policy installation hook. |
| `remaining` | `wallet` | Returns the amount still available in the active window, or the full cap when the previous window has elapsed. |
| `policy__` | `source`, `signer`, `contexts` | Smart-wallet policy hook. It accepts only transfers of the configured token from `source` to approved payees within the cap. The wallet calls this hook; users normally do not invoke it directly. |
| `install` | `wallet` | Smart-wallet installation hook. The wallet must authorize. |
| `uninstall` | `wallet` | Permissionless cleanup of installation state. Spending history is deliberately retained. |

## Build, deploy, and configure

The commands below use Stellar CLI 27.x. Set `TOKEN_ID` to the contract address
of the Stellar asset that this signer may transfer. The example uses one
identity as both wallet and steward so its first configuration can satisfy both
authorization requirements:

```sh
stellar keys generate alice --network testnet --fund
stellar contract build

ALICE="$(stellar keys address alice)"
TOKEN_ID="C..."  # replace with a deployed Stellar asset contract address
POLICY_ID="$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/milepost_policy_spend.wasm \
  --source-account alice \
  --network testnet)"

stellar contract invoke \
  --id "$POLICY_ID" \
  --source-account alice \
  --network testnet \
  -- configure \
  --steward "$ALICE" \
  --wallet "$ALICE" \
  --token "$TOKEN_ID" \
  --cap 100000000 \
  --period 86400

stellar contract invoke \
  --id "$POLICY_ID" \
  --source-account alice \
  --network testnet \
  -- remaining --wallet "$ALICE"
```

`cap` is expressed in the token contract's smallest unit, and `period` is in
seconds. Run the crate tests with:

```sh
cargo test -p milepost-policy-spend
```

## Security and integration notes

- This policy constrains **one signer**, not the entire wallet. Wallet signer
  thresholds and limits must prevent an unrestricted signer from authorizing
  around it or removing it.
- The wallet cannot edit its own payee allowlist. That power belongs to the
  steward so a recipient cannot approve itself and bypass the restriction.
- Initial `configure` requires both wallet consent and steward authorization.
  Later reconfiguration resets the active spend window and requires the same
  steward.
- `policy__` rejects non-transfer calls, a different token, transfers from a
  different source, non-positive amounts, unapproved payees, and cap overruns.
- `uninstall` does not erase the spending record. Removing and reinstalling the
  signer therefore cannot reset the current allowance.
