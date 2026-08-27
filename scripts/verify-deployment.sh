#!/usr/bin/env bash
#
# Validate the deployed contracts against local builds.
#
#   ./scripts/verify-deployment.sh [network]
#

set -euo pipefail

NETWORK="${1:-testnet}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_FILE="$ROOT/deployments/$NETWORK.json"
WASM_DIR="$ROOT/target/wasm32v1-none/release"

if [[ ! -f "$DEPLOY_FILE" ]]; then
  echo "==> Deployment file not found: $DEPLOY_FILE"
  exit 1
fi

echo "==> Verifying deployments on $NETWORK"

# Ensure we have local builds to compare against
(cd "$ROOT" && cargo build --target wasm32v1-none --release)

verify_contract() {
  local name="$1"
  local id="$2"
  local local_wasm="$WASM_DIR/milepost_${name}.wasm"

  if [[ -z "$id" || "$id" == "null" ]]; then
    echo "    $name: skipping (no id in deployment file)"
    return
  fi

  if [[ ! -f "$local_wasm" ]]; then
    echo "    $name: local build artifact not found: $local_wasm"
    exit 1
  fi

  # Upload command output is the local wasm hash
  local local_hash
  local_hash=$(stellar contract info hash --wasm "$local_wasm")

  # Fetch deployed wasm and hash it
  local fetched_wasm="/tmp/fetched_${name}.wasm"
  stellar contract fetch --id "$id" --network "$NETWORK" --out-file "$fetched_wasm" >/dev/null 2>&1 || {
    echo "    $name: failed to fetch deployed wasm for id $id"
    exit 1
  }

  local deployed_hash
  deployed_hash=$(stellar contract info hash --wasm "$fetched_wasm")
  rm "$fetched_wasm"

  if [[ "$local_hash" == "$deployed_hash" ]]; then
    echo "    $name: OK ($local_hash)"
  else
    echo "    $name: MISMATCH"
    echo "      local:    $local_hash"
    echo "      deployed: $deployed_hash"
    exit 1
  fi
}

# The deployment file has ids for attest, record, registry, policy_spend.
# It also has program_wasm. We can check program_wasm directly.
ATTEST=$(jq -r '.attest' "$DEPLOY_FILE")
RECORD=$(jq -r '.record' "$DEPLOY_FILE")
REGISTRY=$(jq -r '.registry' "$DEPLOY_FILE")
POLICY_SPEND=$(jq -r '.policy_spend' "$DEPLOY_FILE")
PROGRAM_WASM=$(jq -r '.program_wasm' "$DEPLOY_FILE")

verify_contract "attest" "$ATTEST"
verify_contract "record" "$RECORD"
verify_contract "registry" "$REGISTRY"
verify_contract "policy_spend" "$POLICY_SPEND"

# Verify program_wasm
echo "==> Verifying program wasm"
LOCAL_PROGRAM_HASH=$(stellar contract info hash --wasm "$WASM_DIR/milepost_program.wasm")
if [[ "$LOCAL_PROGRAM_HASH" == "$PROGRAM_WASM" ]]; then
  echo "    program: OK ($LOCAL_PROGRAM_HASH)"
else
  echo "    program: MISMATCH"
  echo "      local:    $LOCAL_PROGRAM_HASH"
  echo "      deployed: $PROGRAM_WASM"
  exit 1
fi

echo "==> Fetching registry configuration"
stellar contract invoke --id "$REGISTRY" --network "$NETWORK" -- get_config

echo "==> Deployment verification complete."
