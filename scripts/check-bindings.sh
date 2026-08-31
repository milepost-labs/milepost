#!/usr/bin/env bash
#
# Fail if the checked-in TypeScript bindings in packages/ do not match the
# built wasm. Address embedding (`networks.testnet` on the four singletons) is
# ignored so a wasm regeneration cannot fail for the wrong reason.
#
# Requires a prior `cargo build --target wasm32v1-none --release` and `stellar`
# on PATH.
#
# Usage: ./scripts/check-bindings.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WASM_DIR="$ROOT/target/wasm32v1-none/release"
EQUAL="$ROOT/scripts/bindings-interface-equal.py"
REGEN_CMD="./scripts/generate-bindings.sh"

fail() {
  cat >&2 <<EOF

error: committed TypeScript bindings do not match the built contracts.

The checked-in files in packages/ are stale relative to the wasm. Regenerate
them with:

  cargo build --target wasm32v1-none --release
  ${REGEN_CMD}

EOF
  exit 1
}

need_stellar() {
  if ! command -v stellar >/dev/null 2>&1; then
    echo "error: stellar CLI not found on PATH (need 27.x to generate bindings)" >&2
    exit 1
  fi
}

need_wasm() {
  local wasm="$1"
  if [[ ! -f "$wasm" ]]; then
    echo "error: missing $wasm — run: cargo build --target wasm32v1-none --release" >&2
    exit 1
  fi
}

generate_once() {
  local crate="$1"
  local dest="$2"
  local wasm="$WASM_DIR/milepost_${crate}.wasm"
  need_wasm "$wasm"
  mkdir -p "$dest"
  stellar contract bindings typescript \
    --wasm "$wasm" \
    --output-dir "$dest" \
    --overwrite
  [[ -f "$dest/src/index.ts" ]] || {
    echo "error: generator did not write $dest/src/index.ts" >&2
    exit 1
  }
}

# crate_name  package_directory
CONTRACTS=(
  "attest:attest"
  "record:record"
  "registry:registry"
  "program:program"
  "policy_spend:policy-spend"
)

# The four singleton contracts embed their deployed address as
# `networks.testnet`; `program` does not, because every programme is its own
# contract. The interface comparison deliberately ignores that block so a
# wasm-only regeneration cannot fail for a missing address — but that also
# means deleting the block entirely compares equal.
#
# That is not hypothetical. A regeneration from `--wasm` alone dropped
# `networks` from packages/registry, and the frontend shipped unable to reach
# the registry at all. So check presence separately from content.
SINGLETONS=(attest record registry policy-spend)

check_networks_present() {
  local missing=0
  echo "==> Checking singleton bindings still carry their deployed address"
  for pkg in "${SINGLETONS[@]}"; do
    if grep -q '^export const networks = {' "$ROOT/packages/$pkg/src/index.ts"; then
      echo "    $pkg"
    else
      echo "    MISSING networks: packages/$pkg/src/index.ts" >&2
      missing=1
    fi
  done
  if [[ "$missing" -ne 0 ]]; then
    cat >&2 <<'EOF'

error: a singleton binding has lost its `networks` export.

Bindings generated from `--wasm` alone carry no network information, so the
block is dropped along with the deployed contract id. The frontend reads
`networks.testnet`, and without it cannot reach the contract at all.

Regenerate with the deployed id, or restore the block from git history.

EOF
    exit 1
  fi
}

need_stellar

TMP="$(mktemp -d "${TMPDIR:-/tmp}/milepost-bindings.XXXXXX")"
TMP2="$(mktemp -d "${TMPDIR:-/tmp}/milepost-bindings.XXXXXX")"
trap 'rm -rf "$TMP" "$TMP2"' EXIT

echo "==> Regenerating bindings from wasm (pass 1, stability probe on pass 2)"

mismatched=0
for entry in "${CONTRACTS[@]}"; do
  crate="${entry%%:*}"
  pkg="${entry##*:}"
  echo "    $pkg"
  generate_once "$crate" "$TMP/$pkg"
  generate_once "$crate" "$TMP2/$pkg"

  if ! python3 "$EQUAL" "$TMP/$pkg/src/index.ts" "$TMP2/$pkg/src/index.ts"; then
    echo "error: generator output for $pkg is not byte-stable; cannot trust a diff check" >&2
    exit 1
  fi

  if ! python3 "$EQUAL" "$ROOT/packages/$pkg/src/index.ts" "$TMP/$pkg/src/index.ts"; then
    echo "    DRIFT: packages/$pkg/src/index.ts"
    mismatched=1
  fi
done

if [[ "$mismatched" -ne 0 ]]; then
  fail
fi

check_networks_present

echo "==> Bindings match the built contracts"
