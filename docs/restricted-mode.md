# Restricted mode: wiring policy_spend to a smart wallet

`Mode::Restricted` releases a tranche into a recipient's own passkey smart
wallet rather than into escrow.  The `policy_spend` contract is installed as a
policy signer on that wallet to limit what the funded key may authorise.  This
document explains how to configure the setup so that the restriction is
genuine rather than cosmetic, and what the limits of on-chain enforcement are.

---

## How the pieces fit together

A Stellar passkey smart wallet (`stellar/passkey-kit` v1) authenticates
transactions through its `__check_auth` function.  For every authorization
context in a transaction, `__check_auth` walks the wallet's registered signers
looking for one that covers it.  When a `Policy` signer is in the signatures
map, `__check_auth` calls `policy__(wallet, signer_key, contexts)` on the policy
contract and only approves if the call returns without panicking.

`policy_spend.policy__` checks:

1. There is a configured policy for this wallet.
2. Every context is a `token.transfer(from=wallet, to=<payee>, amount)` call —
   no other function, no other contract.
3. `to` is on the policy's allowlist (set by the steward, not the recipient).
4. The cumulative transfer amount in the current window does not exceed the cap.

Returning normally approves.  Panicking with a `SpendError` rejects the whole
transaction.  Every context in the transaction is checked, so a forbidden call
cannot be smuggled alongside a permitted one.

---

## What `SignerLimits` controls

`SignerLimits` is the wallet-level constraint on a signer.  It governs which
authorization contexts that signer key is permitted to cover — completely
independently of any policy logic.

```
SignerLimits(None)
```
**Fully unlimited.** The signer may authorize anything: token transfers,
`add_signer`, `remove_signer`, `upgrade`, and `CreateContract` contexts.  This
is the admin shape.

```
SignerLimits(Some({}))   // empty map
```
**No permissions.**  The signer may authorize nothing (it can still
`remove_signer` on its own key — self-removal is always permitted — but nothing
else).  Introduced in v1; pre-1.0 an empty map meant unlimited.

```
SignerLimits(Some({ TOKEN_ADDRESS -> null }))
```
**Token-only.** The signer may authorize calls to `TOKEN_ADDRESS`.  No other
contract, no wallet administration.  The `null` value means no co-signers are
required — the policy signer covers those contexts alone.

```
SignerLimits(Some({ TOKEN_ADDRESS -> [required_cosigner_key] }))
```
**Token-only with required co-signer.** The signer may authorize token calls
only if the listed co-signer also signs.  Useful for a second-factor
requirement on the spend path.

### Which shape to use for policy_spend

Install the policy signer with `SignerLimits(Some({ TOKEN_ADDRESS -> null }))`.

This means:

- The policy signer can authorize token transfers (gated by `policy__`).
- It cannot authorize `add_signer`, `remove_signer`, `upgrade`, or any other
  wallet admin function.
- It cannot authorize calls to any contract other than the token.
- A recipient holding only this signer credential cannot modify the wallet
  configuration at all.

Do **not** install the policy with `SignerLimits(None)`.  An unlimited policy
signer can call `add_signer` to insert an unlimited Ed25519 key, then use that
key to bypass `policy__` entirely.  The wallet would *look* restricted but
would not be.

---

## Deploying the wallet: CLI encoding

The constructor and `add_signer` both take a `Signer` enum value.  The stellar
CLI accepts this as a JSON `--constructor-args` / `--signer` argument:

### Admin signer (unlimited Ed25519 — for the constructor)

```json
[{
  "Ed25519": [
    "<32-byte-raw-public-key-hex>",
    { "SignerExpiration": null },
    { "SignerLimits": null },
    "Persistent"
  ]
}]
```

`SignerLimits: null` is the unlimited shape.

### Policy signer (token-restricted)

```json
[{
  "Policy": [
    "<POLICY_SPEND_CONTRACT_ADDRESS>",
    { "SignerExpiration": null },
    { "SignerLimits": { "<TOKEN_CONTRACT_ADDRESS>": null } },
    "Persistent"
  ]
}]
```

The `SignerLimits` object maps contract addresses to either `null` (any call
allowed, no co-signer) or `["<signer_key_json>", ...]` (required co-signers).

---

## The configure call

`policy_spend.configure` requires **two** authorization signatures the first
time it is called for a wallet:

1. `steward.require_auth()` — the account that will control the allowlist
2. `wallet.require_auth()` — the recipient's one-time consent to be bound

This two-signature requirement is intentional: the steward cannot impose a
policy on a wallet whose owner has not consented.  Once configured, only the
steward can change the cap or period — the recipient cannot raise their own cap.

In the stellar CLI, pass both signers explicitly:

```sh
stellar contract invoke \
  --id "$POLICY" \
  --source-account milepost-steward \
  --auth milepost-admin \
  --network testnet \
  --send=yes \
  -- configure \
  --steward "$STEWARD_ADDR" \
  --wallet  "$WALLET" \
  --token   "$TOKEN" \
  --cap     1000 \
  --period  86400
```

`--source-account` provides the steward's signature; `--auth` provides the
wallet admin's signature for the wallet's auth entry.

---

## The trust model

### What genuinely restricts the recipient

For restriction to be real, the recipient must hold **no admin-capable
signer** on the wallet.

The following table describes the actual enforcement level for each
configuration:

| Recipient holds | Policy enforced? | Notes |
|---|---|---|
| Only a policy signer (limited to token) | **Yes** | Cannot modify wallet config, cannot call other contracts |
| A policy signer + an unlimited Ed25519 | **No** | Can call `add_signer` with the Ed25519 key to add a bypass signer |
| A policy signer + a wallet-admin-limited Ed25519 | **No** | `SignerLimits({wallet -> null})` grants full admin |
| A policy signer + the policy signer removed and re-added as unlimited | **No** | With an unlimited Ed25519 they can re-add the policy as unlimited |

The only safe configuration is: **the recipient's credential is a policy signer
with token-only limits, and the recipient does not hold an admin key**.

### Who must hold the admin key

The wallet is immutable without an admin key — Stellar smart wallets always
require at least one durable, non-expiring admin signer (`LastAdminSigner`
guard, contract error 103).  Someone must hold it.  The options are:

**Programme operator holds the admin key.**
The operator can modify the wallet but cannot spend from it (the policy controls
spending).  The recipient controls spending within the policy rules.  This is
the correct configuration for `Mode::Restricted`.

**Recipient holds the admin key.**
The restriction is cosmetic.  The recipient can remove or bypass the policy.
Do not do this.

**Multi-sig admin (e.g. operator + registry).**
The most robust configuration: no single party can unilaterally modify the
wallet.  Requires a multisig scheme on the admin path, which is more complex
to set up.  `program.release` cannot perform this step — it is a deployment
decision.

### What `program.release` checks

`release` verifies that `policy_spend.is_installed(wallet)` returns true before
releasing a `Restricted` tranche.  This is a lower bound: it confirms the
policy contract is registered as a signer on the wallet, but it cannot read the
wallet's `SignerLimits` storage or verify that no unlimited signer also exists.
A misconfiguration is bounded to a single tranche, not the entire programme.

This is documented in the contract and in the README:

> `Restricted` is weaker than it looks. A policy constrains *one signer*, not
> the wallet … Genuine enforcement requires the wallet's own `SignerLimits` to
> confine the funded signer to the policy, which is a deployment step no
> contract here can perform.

---

## End-to-end flow

The `scripts/seed-restricted.sh` script exercises the full flow:

```sh
./scripts/deploy.sh testnet           # deploy protocol contracts
./scripts/seed-restricted.sh testnet  # deploy wallet, install policy, run tests
```

The script:

1. **Deploys a smart wallet** with an Ed25519 admin signer.
2. **Calls `policy_spend.configure`** setting the steward, token, cap (1000
   stroops), and window (86400 seconds).  Both the steward and the wallet
   sign this transaction.
3. **Calls `allow_payee`** to add one verified destination.
4. **Calls `add_signer`** on the wallet to install the policy with
   `SignerLimits({ token -> null })`.
5. **Funds the wallet** with a small native XLM balance.
6. **Test 1 — allowed spend:** transfers 400 stroops to the verified payee.
   Expected: success.
7. **Test 2 — unverified payee:** transfers 100 stroops to an address not on
   the allowlist.  Expected: rejected (`PayeeNotAllowed`, error 5).
8. **Test 3 — cap enforcement:** transfers 600 more (hits cap exactly: success),
   then attempts 1 more (cap exhausted: rejected, `CapExceeded`, error 6).

Output is written to `deployments/testnet.restricted.json`.

---

## Note on passkeys vs Ed25519 keys

The admin key in `seed-restricted.sh` is an Ed25519 key generated by the
stellar CLI.  In production, the admin role would be held by a passkey or a
multisig scheme — the script uses Ed25519 because the stellar CLI can sign
without browser WebAuthn ceremonies.  Every other step is identical whether
the admin is a passkey or an Ed25519 key: the wallet contract treats them the
same way, the policy contract does not interact with the admin key at all, and
the `SignerLimits` encoding is the same.

A recipient-facing passkey would be an additional `Secp256r1` signer added
with **token-only limits**, not with the admin key.  The admin is always the
operator, never the recipient.

---

## Spend cap sizing

The `cap` and `period` in `policy_spend.configure` are denominated in the
token's smallest unit (stroops for XLM, where 1 XLM = 10,000,000 stroops).

Guidance:
- Set `cap` to the tranche amount.  A recipient whose tranche is 300 XLM
  should not be capped below that — they would not be able to spend the full
  award in one window.
- Set `period` to match the expected payment cadence.  A weekly cap (604800s)
  for a term-based stipend is reasonable; a daily cap (86400s) for a per-diem
  disbursement is appropriate there.
- The cap resets at the start of a new window, not on a rolling basis.  A
  recipient who reaches the cap at 23:00 can spend again the next morning.
- The cap persists across `uninstall` + `install` cycles — removing and
  re-adding the policy does not reset the window.  This is deliberate.

---

## Quick reference

| What | Value |
|---|---|
| smart-wallet WASM hash (testnet, v1 final) | `fdefad64b96837147e1c333e51f537b696eab925e9f147e63d597c04e3c903f0` |
| policy_spend contract (testnet) | `CAWCAOO3VYQT3LFKX4IKD6FDEPCOI3N3URPMAALO3T7G5OCMQM5IA6BQ` |
| passkey-kit commit | `9a8c9ffc7dd7669ab86378167d698e53dda82174` |
| policy signer limits (required) | `{ token_address -> null }` |
| admin signer limits (required) | `null` (unlimited) |
| configure signers required | steward + wallet |
| allow_payee signer required | steward only |
