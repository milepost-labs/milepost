#!/usr/bin/env bash
#
# Sync packages/testnet.json from deployments/testnet.json.
#
# These files hold the same contract addresses, but deployments/ is gitignored
# (environment-specific) and packages/ is tracked (repo documentation). This
# script keeps the tracked copy in sync, preventing silent drift.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOYMENTS_FILE="$ROOT/deployments/testnet.json"
PACKAGES_FILE="$ROOT/packages/testnet.json"

if [[ ! -f "$DEPLOYMENTS_FILE" ]]; then
  echo "error: $DEPLOYMENTS_FILE not found" >&2
  echo "Run ./scripts/deploy.sh to generate it." >&2
  exit 1
fi

# Copy the deployment config to packages, ensuring it matches what the registry published
cp "$DEPLOYMENTS_FILE" "$PACKAGES_FILE"

echo "Synced $PACKAGES_FILE from $DEPLOYMENTS_FILE"
