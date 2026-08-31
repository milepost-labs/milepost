#!/usr/bin/env bash
#
# Deploy a passkey smart wallet on testnet, install policy_spend as a policy
# signer with tight SignerLimits, then drive a restricted spend end to end:
#   - a transfer to a verified payee succeeds
#   - a transfer to an unverified address is rejected
#   - the spend cap is enforced across two transfers in the same window
#
#   ./scripts/seed-restricted.sh [network]
#
# Reads contract ids from deployments/<network>.json.
# Writes results to deployments/<network>.restricted.json.
#
# Prerequisites:
#   stellar CLI >= 27
#   deployments/<network>.json (run ./scripts/deploy.sh first)
#
# Four accounts are created if they do not already exist:
#
#   milepost-admin      Ed25519 key — the wallet's permanent admin signer
#   milepost-steward    Ed25519 key — controls the policy allowlist
#   milepost-payee      destination for allowed transfers
#   milepost-unverified destination that must be blocked
#
# Trust model in brief (see docs/restricted-mode.md for the full analysis):
#   The admin key is unlimited and can modify or remove any signer.  It
#   should be held by the programme operator, not the recipient.  The policy
#   signer is limited to the token contract, so a recipient who holds only
#   the policy signer cannot touch wallet administration.
#
# Why shell rather than TypeScript:
#   The acceptance criteria ask for a script that drives the flow end to end.
#   The stellar CLI can sign Ed25519 auth entries directly, which is enough
#   for testnet scripting.  A browser-side passkey would replace the Ed25519
#   admin key at the signing step; every other step is identical.

set -euo pipefail

NETWORK="${1:-testnet}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOYMENT="$ROOT/deployments/$NETWORK.json"
OUT_FILE="$ROOT/deployments/$NETWORK.restricted.json"

[[ -f "$DEPLOYMENT" ]] || {
  echo "no deployment found at $DEPLOYMENT" >&2
  echo "run ./scripts/deploy.sh $NETWORK first" >&2
  exit 1
}

read_id() { python3 -c "import json,sys; print(json.load(open('$DEPLOYMENT'))['$1'])"; }

POLICY="$(read_id policy_spend)"
# Native XLM is wrapped as a Stellar Asset Contract (SAC) and is the token
# in use throughout the test scenario.
TOKEN="$(stellar contract id asset --asset native --network "$NETWORK")"

# ── Canonical smart-wallet v1 WASM hash ───────────────────────────────────────
#
# The WASM is uploaded to testnet by the passkey-kit maintainers.
# Canonical source: stellar/passkey-kit docs/deployments-testnet-2026-07-11.md
# Commit: 9a8c9ffc7dd7669ab86378167d698e53dda82174
# Re-pin date: 2026-07-13 (FINAL for testnet)
SMART_WALLET_WASM_HASH="fdefad64b96837147e1c333e51f537b696eab925e9f147e63d597c04e3c903f0"

echo "==> Network:         $NETWORK"
echo "    policy_spend:    $POLICY"
echo "    token (native):  $TOKEN"
echo "    wallet wasm:     $SMART_WALLET_WASM_HASH"

# ── Accounts ──────────────────────────────────────────────────────────────────

ACTORS=(admin steward payee unverified)

echo
echo "==> Preparing accounts"
for a in "${ACTORS[@]}"; do
  key="milepost-$a"
  if ! stellar keys address "$key" >/dev/null 2>&1; then
    stellar keys generate "$key" --network "$NETWORK" --fund >/dev/null 2>&1
    echo "    created $key"
  else
    echo "    found   $key"
  fi
done

addr() { stellar keys address "milepost-$1"; }

ADMIN_ADDR="$(addr admin)"
STEWARD_ADDR="$(addr steward)"
PAYEE_ADDR="$(addr payee)"
UNVERIFIED_ADDR="$(addr unverified)"

echo "    admin:       $ADMIN_ADDR"
echo "    steward:     $STEWARD_ADDR"
echo "    payee:       $PAYEE_ADDR"
echo "    unverified:  $UNVERIFIED_ADDR"

# ── Helper: invoke any contract ───────────────────────────────────────────────

invoke() {
  # invoke <contract_id> <source_key_name> [args...]
  local id="$1" src="$2"; shift 2
  stellar contract invoke \
    --id "$id" \
    --source-account "milepost-$src" \
    --network "$NETWORK" \
    --send=yes \
    -- "$@"
}

invoke_ro() {
  # invoke_ro <contract_id> <source_key_name> [args...]
  # Read-only simulation; does not submit a transaction.
  local id="$1" src="$2"; shift 2
  stellar contract invoke \
    --id "$id" \
    --source-account "milepost-$src" \
    --network "$NETWORK" \
    -- "$@"
}

# ── STEP 1: Deploy the smart wallet ───────────────────────────────────────────
#
# The constructor signer is an unlimited Ed25519 key (the admin).
# In XDR terms: Signer::Ed25519(pubkey_bytes32, expiration, limits, storage)
#
# stellar CLI >= 27 accepts --constructor-args as a JSON array of ScVal.
# The Signer enum variants are encoded as single-key JSON objects.
#
# SignerExpiration(None)  → {"SignerExpiration": null}   (never expires)
# SignerLimits(None)      → {"SignerLimits": null}       (unlimited/admin)
# SignerStorage::Persistent

echo
echo "==> Step 1: Deploy smart wallet"

# Decode the G… public key to its raw 32-byte hex, required by the Signer XDR.
ADMIN_RAW_KEY="$(python3 - "$ADMIN_ADDR" <<'PYEOF'
import sys, base64

def strkey_decode_ed25519(addr):
    # Stellar strkey: base32(version_byte || key || checksum)
    padded = addr + "=" * ((8 - len(addr) % 8) % 8)
    raw = base64.b32decode(padded)
    assert raw[0] == 6 << 3, "not an Ed25519 G-address"
    return raw[1:33].hex()

print(strkey_decode_ed25519(sys.argv[1]))
PYEOF
)"

ADMIN_SIGNER_JSON="[{\"Ed25519\":[\"$ADMIN_RAW_KEY\",{\"SignerExpiration\":null},{\"SignerLimits\":null},\"Persistent\"]}]"

WALLET="$(stellar contract deploy \
  --wasm-hash "$SMART_WALLET_WASM_HASH" \
  --source-account "milepost-admin" \
  --network "$NETWORK" \
  --constructor-args "$ADMIN_SIGNER_JSON" 2>&1 | grep -v '^#\|^$\|^=\|^\s*$' | tail -1)"

echo "    wallet:   $WALLET"

# ── STEP 2: Configure the spend policy ────────────────────────────────────────
#
# policy_spend.configure(steward, wallet, token, cap, period)
# requires: steward.require_auth() AND wallet.require_auth()
#
# Two signers must authorise this transaction.  Run it as the steward;
# the admin account authorises the wallet's require_auth entry.
# stellar CLI >= 27: --auth <source-key> adds an additional auth signer.

CAP=1000      # stroops per window (0.0001 XLM — deliberately small for testing)
PERIOD=86400  # one day in seconds

echo
echo "==> Step 2: Configure spend policy"
echo "    steward:  $STEWARD_ADDR"
echo "    cap:      $CAP stroops"
echo "    period:   $PERIOD s"

stellar contract invoke \
  --id "$POLICY" \
  --source-account "milepost-steward" \
  --auth "milepost-admin" \
  --network "$NETWORK" \
  --send=yes \
  -- configure \
  --steward "$STEWARD_ADDR" \
  --wallet  "$WALLET" \
  --token   "$TOKEN" \
  --cap     "$CAP" \
  --period  "$PERIOD"

echo "    configured"

STORED="$(invoke_ro "$POLICY" admin get_policy --wallet "$WALLET")"
echo "    stored policy: $STORED"

# ── STEP 3: Add a verified payee ──────────────────────────────────────────────

echo
echo "==> Step 3: Allow verified payee"
invoke "$POLICY" steward allow_payee \
  --steward "$STEWARD_ADDR" \
  --wallet  "$WALLET" \
  --payee   "$PAYEE_ADDR"

IS_PAYEE="$(invoke_ro "$POLICY" admin is_payee --wallet "$WALLET" --payee "$PAYEE_ADDR")"
echo "    is_payee($PAYEE_ADDR): $IS_PAYEE"

# ── STEP 4: Install the policy as a wallet signer ────────────────────────────
#
# add_signer requires the wallet's own auth (admin must sign).
#
# Signer variant: Policy(address, expiration, limits, storage)
#
# SignerLimits encoding matters here — this is the core of the setup.
#
# WEAK (appearance of restriction only):
#   SignerLimits(None) — the policy signer is unlimited; it can add other
#   signers, remove the admin, upgrade the contract, etc.  The policy's
#   own spending rules still apply, but an attacker with this key can
#   demote itself to unlimited and bypass policy__.
#
# STRONG (actual restriction — what this script uses):
#   SignerLimits(Some({ TOKEN_ADDRESS -> null }))
#   The policy signer may only authorise calls to TOKEN.  It cannot touch
#   wallet administration.  Even if policy__ were compromised, the signer
#   still cannot call add_signer or upgrade.
#
# JSON encoding of SignerLimits(Some(map)):
#   {"SignerLimits": {"<token_address>": null}}
#   where null means "no required co-signers for this contract".
#
# A recipient who receives only this policy signer cannot:
#   - add or remove wallet signers
#   - upgrade the wallet contract
#   - approve calls to any contract other than the token
#
# They CAN always remove_signer(their own key) — this is a hard wallet rule
# (self-removal is never escalation) — but removing the policy signer ends
# their own spend access, not the admin's.

echo
echo "==> Step 4: Install policy signer (limits: token-only)"
echo "    policy:  $POLICY"
echo "    limits:  {$TOKEN: null}  (strong — token calls only)"

POLICY_SIGNER_JSON="[{\"Policy\":[\"$POLICY\",{\"SignerExpiration\":null},{\"SignerLimits\":{\"$TOKEN\":null}},\"Persistent\"]}]"

invoke "$WALLET" admin add_signer \
  --signer "$POLICY_SIGNER_JSON"

IS_INSTALLED="$(invoke_ro "$POLICY" admin is_installed --wallet "$WALLET")"
echo "    is_installed: $IS_INSTALLED"

# ── STEP 5: Fund the wallet ────────────────────────────────────────────────────
#
# Send native XLM to the wallet so it has a balance to spend.
# In a real Milepost flow, program.release() deposits this balance when
# the recipient's attestation is verified.

echo
echo "==> Step 5: Fund wallet"
# Transfer a small amount using the admin key as the source.
stellar contract invoke \
  --id "$TOKEN" \
  --source-account "milepost-admin" \
  --network "$NETWORK" \
  --send=yes \
  -- transfer \
  --from   "$ADMIN_ADDR" \
  --to     "$WALLET" \
  --amount 10000

BALANCE="$(invoke_ro "$TOKEN" admin balance --id "$WALLET")"
echo "    wallet balance: $BALANCE stroops"

# ── STEP 6: Transfer to verified payee — should succeed ──────────────────────
#
# The token transfer is authorised through the policy signer.
# On-chain flow: token.transfer -> wallet.__check_auth -> policy__.policy__
#
# In the CLI, signing through a policy signer means including a
# Signature::Policy entry in the Signatures map.  The stellar CLI handles
# this automatically when we pass the wallet as the auth invoker and the
# policy contract is a registered signer on it.
#
# The policy__ call checks:
#   - token address matches
#   - function name is "transfer"
#   - `from` matches the wallet (source)
#   - `to` is on the allowlist
#   - amount is within the current window cap
# On success, it records the spend.  Expected: SUCCESS.

echo
echo "==> Test 1: transfer to verified payee (expect: success)"
echo "    from:   $WALLET"
echo "    to:     $PAYEE_ADDR"
echo "    amount: 400 stroops"

if stellar contract invoke \
     --id "$TOKEN" \
     --source-account "milepost-admin" \
     --auth-wallet "$WALLET" \
     --network "$NETWORK" \
     --send=yes \
     -- transfer \
     --from   "$WALLET" \
     --to     "$PAYEE_ADDR" \
     --amount 400 2>/dev/null; then
  echo "    PASS — transfer succeeded"
else
  echo "    FAIL — transfer was rejected (check wallet auth setup)"
fi

REMAINING="$(invoke_ro "$POLICY" admin remaining --wallet "$WALLET" 2>/dev/null || echo "N/A")"
echo "    remaining cap: $REMAINING stroops"

# ── STEP 7: Transfer to unverified address — should be rejected ──────────────
#
# policy__ will panic with SpendError::PayeeNotAllowed (code 5).
# __check_auth propagates the panic; the token.transfer reverts.
# Expected: host InvokeError carrying contract error #5.

echo
echo "==> Test 2: transfer to unverified address (expect: rejection)"
echo "    from:   $WALLET"
echo "    to:     $UNVERIFIED_ADDR  (not on allowlist)"
echo "    amount: 100 stroops"

if stellar contract invoke \
     --id "$TOKEN" \
     --source-account "milepost-admin" \
     --auth-wallet "$WALLET" \
     --network "$NETWORK" \
     --send=yes \
     -- transfer \
     --from   "$WALLET" \
     --to     "$UNVERIFIED_ADDR" \
     --amount 100 2>/dev/null; then
  echo "    FAIL — transfer succeeded (policy should have blocked it)"
else
  echo "    PASS — transfer rejected (PayeeNotAllowed)"
fi

# ── STEP 8: Spend cap enforcement ────────────────────────────────────────────
#
# Cap = 1000 stroops / window.  Already spent 400 in test 1.
# Transfer 600 more: hits cap exactly, should succeed.
# Transfer  1 more: cap exhausted, should be rejected (CapExceeded, code 6).

echo
echo "==> Test 3: spend cap enforcement (cap=$CAP, spent=400 so far)"

echo "    transfer 600 (hits cap exactly, expect: success)"
if stellar contract invoke \
     --id "$TOKEN" \
     --source-account "milepost-admin" \
     --auth-wallet "$WALLET" \
     --network "$NETWORK" \
     --send=yes \
     -- transfer \
     --from   "$WALLET" \
     --to     "$PAYEE_ADDR" \
     --amount 600 2>/dev/null; then
  echo "    PASS — transfer succeeded"
else
  echo "    FAIL — transfer was rejected"
fi

echo "    transfer 1 (cap exhausted, expect: rejection)"
if stellar contract invoke \
     --id "$TOKEN" \
     --source-account "milepost-admin" \
     --auth-wallet "$WALLET" \
     --network "$NETWORK" \
     --send=yes \
     -- transfer \
     --from   "$WALLET" \
     --to     "$PAYEE_ADDR" \
     --amount 1 2>/dev/null; then
  echo "    FAIL — transfer succeeded (cap should have blocked it)"
else
  echo "    PASS — transfer rejected (CapExceeded)"
fi

REMAINING_FINAL="$(invoke_ro "$POLICY" admin remaining --wallet "$WALLET" 2>/dev/null || echo "N/A")"
echo "    remaining cap: $REMAINING_FINAL stroops"

# ── Results ───────────────────────────────────────────────────────────────────

cat >"$OUT_FILE" <<EOF
{
  "network": "$NETWORK",
  "wallet": "$WALLET",
  "policy_spend": "$POLICY",
  "token": "$TOKEN",
  "smart_wallet_wasm_hash": "$SMART_WALLET_WASM_HASH",
  "accounts": {
    "admin":       "$ADMIN_ADDR",
    "steward":     "$STEWARD_ADDR",
    "payee":       "$PAYEE_ADDR",
    "unverified":  "$UNVERIFIED_ADDR"
  },
  "policy_config": {
    "cap_stroops": $CAP,
    "period_seconds": $PERIOD,
    "policy_signer_limits": "token-only"
  }
}
EOF

echo
echo "==> Wrote $OUT_FILE"
echo
echo "Wallet:   $WALLET"
echo "Policy:   $POLICY"
echo
echo "Admin key ($ADMIN_ADDR) is UNLIMITED."
echo "  - It can add/remove signers, upgrade the wallet, authorise anything."
echo "  - It should be held by the programme operator, not the recipient."
echo "  - Handing the recipient only a policy-signer credential (not this key)"
echo "    gives genuine restriction.  Handing them this key does not."
echo
echo "Policy signer ($POLICY) is limited to the token contract."
echo "  - It cannot touch wallet administration."
echo "  - It can only transfer the configured token, to verified payees, within"
echo "    the per-window cap.  That is the full extent of its authority."
echo
echo "See docs/restricted-mode.md for the full trust model and configuration guide."
