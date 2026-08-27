#!/usr/bin/env bash
#
# Regenerate packages/*/src/index.ts from the built wasm, then restore each
# singleton's `networks.testnet` from packages/testnet.json. `program` has no
# deployed address and is left without a networks block.
#
# `stellar contract bindings typescript --overwrite` deletes its output
# directory, so this generates into a temp dir and copies only src/index.ts.
#
# Requires a prior `cargo build --target wasm32v1-none --release`.
#
# Usage: ./scripts/generate-bindings.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WASM_DIR="$ROOT/target/wasm32v1-none/release"
IDS="$ROOT/packages/testnet.json"

if ! command -v stellar >/dev/null 2>&1; then
  echo "error: stellar CLI not found on PATH" >&2
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "error: python3 not found on PATH" >&2
  exit 1
fi

graft_networks() {
  local index_ts="$1"
  local contract_id="$2"
  python3 - "$index_ts" "$contract_id" <<'PY'
import pathlib, re, sys

path = pathlib.Path(sys.argv[1])
contract_id = sys.argv[2]
text = path.read_text(encoding="utf-8").replace("\r\n", "\n")
text = re.sub(
    r"\n*export const networks = \{.*?\} as const\n*",
    "\n\n",
    text,
    count=1,
    flags=re.DOTALL,
)
block = f"""

export const networks = {{
  testnet: {{
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "{contract_id}",
  }}
}} as const

"""
needle = "window.Buffer = window.Buffer || Buffer;\n}\n"
idx = text.find(needle)
if idx == -1:
    raise SystemExit(f"could not find Buffer header in {path}")
insert_at = idx + len(needle)
text = text[:insert_at] + block + text[insert_at:].lstrip("\n")
path.write_text(text, encoding="utf-8", newline="\n")
PY
}

id_for() {
  local key="$1"
  python3 - "$IDS" "$key" <<'PY'
import json, sys
data = json.loads(open(sys.argv[1], encoding="utf-8").read())
print(data[sys.argv[2]])
PY
}

generate() {
  local crate="$1"
  local pkg="$2"
  local wasm="$WASM_DIR/milepost_${crate}.wasm"
  [[ -f "$wasm" ]] || {
    echo "error: missing $wasm — run: cargo build --target wasm32v1-none --release" >&2
    exit 1
  }
  local scratch dest
  scratch="$(mktemp -d "${TMPDIR:-/tmp}/milepost-gen.XXXXXX")"
  # stellar 27 validates the output directory's basename as an npm package
  # name, and mktemp's suffix contains uppercase. Generate into a lowercase
  # subdirectory named for the package instead.
  dest="$scratch/$pkg"
  stellar contract bindings typescript \
    --wasm "$wasm" \
    --output-dir "$dest" \
    --overwrite
  mkdir -p "$ROOT/packages/$pkg/src"
  cp "$dest/src/index.ts" "$ROOT/packages/$pkg/src/index.ts"
  rm -rf "$scratch"
}

echo "==> Generating TypeScript bindings from wasm"
generate attest attest
graft_networks "$ROOT/packages/attest/src/index.ts" "$(id_for attest)"

generate record record
graft_networks "$ROOT/packages/record/src/index.ts" "$(id_for record)"

generate registry registry
graft_networks "$ROOT/packages/registry/src/index.ts" "$(id_for registry)"

generate program program

generate policy_spend policy-spend
graft_networks "$ROOT/packages/policy-spend/src/index.ts" "$(id_for policy_spend)"

# `policy_spend` implements the smart wallet's PolicyInterface, whose
# `policy__` takes `Vec<Context>`. `Context` is defined in the wallet's own
# spec, not this contract's, so the generator emits `Array<Context>` and never
# declares the type — the package then fails to compile. Widen it to `any`,
# which is what the committed bindings have always carried.
# scripts/bindings-interface-equal.py applies the same substitution so the
# drift check does not report this as a mismatch.
sed -i.bak 's/contexts: Array<Context>/contexts: Array<any>/' \
  "$ROOT/packages/policy-spend/src/index.ts"
rm -f "$ROOT/packages/policy-spend/src/index.ts.bak"

echo "==> Wrote packages/*/src/index.ts (singleton networks.testnet restored from packages/testnet.json)"
