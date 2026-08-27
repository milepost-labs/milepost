#!/usr/bin/env bash
#
# Upgrades the singleton contracts in place.
# 
#   ./scripts/upgrade.sh [network] [source-account]
#

set -euo pipefail

NETWORK="${1:-testnet}"
SOURCE="${2:-milepost-deployer}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_FILE="$ROOT/deployments/$NETWORK.json"
WASM_DIR="$ROOT/target/wasm32v1-none/release"

if [[ ! -f "$DEPLOY_FILE" ]]; then
  echo "==> Deployment file not found: $DEPLOY_FILE"
  exit 1
fi

echo "==> Building contracts"
(cd "$ROOT" && cargo build --target wasm32v1-none --release)

upgrade_contract() {
  local name="$1"
  local id="$2"
  local local_wasm="$WASM_DIR/milepost_${name}.wasm"

  if [[ -z "$id" || "$id" == "null" ]]; then
    echo "    $name: skipping (no id in deployment file)"
    return
  fi

  # Fetch old hash
  local fetched_wasm="/tmp/fetched_old_${name}.wasm"
  stellar contract fetch --id "$id" --network "$NETWORK" --out-file "$fetched_wasm" >/dev/null 2>&1 || {
    echo "    $name: ERROR fetching deployed contract"
    exit 1
  }
  local old_hash
  old_hash=$(stellar contract info hash --wasm "$fetched_wasm")
  rm "$fetched_wasm"

  local local_hash
  local_hash=$(stellar contract info hash --wasm "$local_wasm")

  if [[ "$old_hash" == "$local_hash" ]]; then
    echo "    $name: already up to date ($local_hash)"
    return
  fi

  echo "    $name: upgrading $old_hash -> $local_hash"
  
  # Upload new wasm to the network
  echo "      Uploading new wasm..."
  local uploaded_hash
  uploaded_hash=$(stellar contract upload --wasm "$local_wasm" --source-account "$SOURCE" --network "$NETWORK")
  
  if [[ "$uploaded_hash" != "$local_hash" ]]; then
    echo "      ERROR: uploaded hash ($uploaded_hash) does not match local hash ($local_hash)"
    exit 1
  fi

  # Invoke upgrade function
  echo "      Invoking upgrade..."
  stellar contract invoke --id "$id" --source-account "$SOURCE" --network "$NETWORK" -- upgrade --new_wasm_hash "$uploaded_hash" >/dev/null || {
    echo "      ERROR: upgrade failed."
    exit 1
  }

  # Verify it worked
  stellar contract fetch --id "$id" --network "$NETWORK" --out-file "/tmp/fetched_new_${name}.wasm" >/dev/null 2>&1
  local new_hash
  new_hash=$(stellar contract info hash --wasm "/tmp/fetched_new_${name}.wasm")
  rm "/tmp/fetched_new_${name}.wasm"

  if [[ "$new_hash" != "$local_hash" ]]; then
    echo "      ERROR: verification failed. Contract still on $new_hash"
    exit 1
  fi

  echo "      SUCCESS."
}

REGISTRY=$(jq -r '.registry' "$DEPLOY_FILE")
RECORD=$(jq -r '.record' "$DEPLOY_FILE")

echo "==> Upgradable contracts:"
upgrade_contract "registry" "$REGISTRY"
upgrade_contract "record" "$RECORD"

echo ""
echo "==> Non-upgradable contracts:"
echo "    - attest:       No admin authority to gate upgrades safely."
echo "    - policy_spend: No admin authority to gate upgrades safely."
echo "    - program:      Not a singleton; each programme is an instantiated contract, registry merely points to its wasm."

# Update program wasm in registry since it's non-upgradable but new deployments should use it
PROGRAM_WASM=$(jq -r '.program_wasm' "$DEPLOY_FILE")
LOCAL_PROGRAM_HASH=$(stellar contract info hash --wasm "$WASM_DIR/milepost_program.wasm")

if [[ "$LOCAL_PROGRAM_HASH" != "$PROGRAM_WASM" ]]; then
  echo ""
  echo "==> Updating program wasm in registry ($PROGRAM_WASM -> $LOCAL_PROGRAM_HASH)..."
  UPLOADED_PROGRAM_HASH=$(stellar contract upload --wasm "$WASM_DIR/milepost_program.wasm" --source-account "$SOURCE" --network "$NETWORK")
  stellar contract invoke --id "$REGISTRY" --source-account "$SOURCE" --network "$NETWORK" -- set_program_wasm --wasm "$UPLOADED_PROGRAM_HASH" >/dev/null
  echo "    Done."
  
  # Update deployment file in-place
  jq --arg hash "$UPLOADED_PROGRAM_HASH" '.program_wasm = $hash' "$DEPLOY_FILE" > "${DEPLOY_FILE}.tmp" && mv "${DEPLOY_FILE}.tmp" "$DEPLOY_FILE"
  echo "==> Updated $DEPLOY_FILE"
fi

echo "==> Upgrade complete."
