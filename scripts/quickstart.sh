#!/usr/bin/env bash
#
# Clean checkout to a working testnet deployment in one command: build, deploy,
# seed a scenario, wait out the application window, then run the review stage.
#
#   ./scripts/quickstart.sh [network] [source-account]
#
# Wraps deploy.sh, seed.sh and seed-review.sh — see each for what they do
# individually. This script only adds dependency checks, the wait between
# seed.sh and seed-review.sh, and a final summary.

set -euo pipefail

NETWORK="${1:-testnet}"
SOURCE="${2:-milepost-deployer}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOYMENT="$ROOT/deployments/$NETWORK.json"
SEED="$ROOT/deployments/$NETWORK.seed.json"

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------

if [[ -t 1 ]]; then
  RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[0;33m'
  BLUE=$'\033[0;34m'; BOLD=$'\033[1m'; NC=$'\033[0m'
else
  RED=""; GREEN=""; YELLOW=""; BLUE=""; BOLD=""; NC=""
fi

step()  { echo -e "\n${BLUE}${BOLD}==> $*${NC}"; }
ok()    { echo -e "${GREEN}✔${NC} $*"; }
warn()  { echo -e "${YELLOW}⚠${NC} $*"; }
fail()  { echo -e "${RED}${BOLD}✘ $*${NC}" >&2; exit 1; }

read_json() {
  # Walks nested keys the same way seed-review.sh does, so a missing key fails
  # loudly instead of printing "None".
  python3 - "$@" <<'PYEOF'
import json, sys
value = json.load(open(sys.argv[1]))
for key in sys.argv[2:]:
    value = value[key]
print(value)
PYEOF
}

# Stroops -> whole-unit display; falls back to the raw value if it is not a
# plain integer (e.g. a raw JSON blob from a fallback path upstream).
to_units() {
  if [[ "$1" =~ ^[0-9]+$ ]]; then
    awk -v n="$1" 'BEGIN { printf "%.2f", n / 10000000 }'
  else
    printf '%s' "$1"
  fi
}

# ---------------------------------------------------------------------------
# Step 0: Dependency checks
# ---------------------------------------------------------------------------

step "Checking dependencies"

if ! command -v stellar >/dev/null 2>&1; then
  fail "'stellar' CLI is not installed.

  Install it with:
    cargo install --locked stellar-cli

  Or see: https://developers.stellar.org/docs/tools/developer-tools/cli/install-cli"
fi
ok "stellar CLI found: $(stellar --version | head -n1)"

if ! command -v rustup >/dev/null 2>&1; then
  fail "'rustup' is not installed, so the wasm build target cannot be verified.

  Install it from: https://rustup.rs/"
fi

# The repo's rust-toolchain.toml pins wasm32v1-none (Soroban's current build
# target); older Soroban guides reference wasm32-unknown-unknown instead, so
# check the target this repo actually builds against.
REQUIRED_TARGET="wasm32v1-none"
if ! rustup target list | grep "$REQUIRED_TARGET" | grep -q installed; then
  fail "Rust target '$REQUIRED_TARGET' is not installed.

  Install it with:
    rustup target add $REQUIRED_TARGET"
fi
ok "Rust target '$REQUIRED_TARGET' installed"

if ! command -v python3 >/dev/null 2>&1; then
  fail "'python3' is not installed. deploy.sh, seed.sh and seed-review.sh all use it to read/write deployment JSON.

  Install it from: https://www.python.org/downloads/"
fi
ok "python3 found"

# ---------------------------------------------------------------------------
# Step 1: Build
# ---------------------------------------------------------------------------

step "Step 1/5: Building the Soroban contracts"
(cd "$ROOT" && stellar contract build)
ok "Build complete"

# ---------------------------------------------------------------------------
# Step 2: Deploy
# ---------------------------------------------------------------------------

step "Step 2/5: Deploying to $NETWORK"
"$ROOT/scripts/deploy.sh" "$NETWORK" "$SOURCE"
[[ -f "$DEPLOYMENT" ]] || fail "deploy.sh reported success but $DEPLOYMENT is missing"
ok "Deployed — ids written to $DEPLOYMENT"

# ---------------------------------------------------------------------------
# Step 3: Seed
# ---------------------------------------------------------------------------

step "Step 3/5: Seeding the scenario"
"$ROOT/scripts/seed.sh" "$NETWORK"
[[ -f "$SEED" ]] || fail "seed.sh reported success but $SEED is missing"
ok "Seeded — programme created, funded and applied to"

# ---------------------------------------------------------------------------
# Step 4: Wait for the application window to close
# ---------------------------------------------------------------------------

APPLY_DEADLINE="$(read_json "$SEED" deadlines apply)"
NOW="$(date +%s)"
# A few seconds of slack so we don't hand off to seed-review.sh a moment
# before its own deadline check would still refuse to run.
WAIT_UNTIL=$((APPLY_DEADLINE + 3))
REMAINING=$((WAIT_UNTIL - NOW))

step "Step 4/5: Waiting for the application window to close"

if (( REMAINING > 0 )); then
  echo "The programme accepts applications until $(date -d "@$APPLY_DEADLINE" '+%H:%M:%S' 2>/dev/null || date -r "$APPLY_DEADLINE" '+%H:%M:%S')."
  while true; do
    NOW="$(date +%s)"
    REMAINING=$((WAIT_UNTIL - NOW))
    (( REMAINING <= 0 )) && break
    printf "\r${YELLOW}⏳ waiting for review window: %02d:%02d remaining${NC}   " \
      $((REMAINING / 60)) $((REMAINING % 60))
    sleep 1
  done
  printf "\r%-60s\r" " "
fi
ok "Application window closed"

# ---------------------------------------------------------------------------
# Step 5: Review
# ---------------------------------------------------------------------------

step "Step 5/5: Running the review stage"

REVIEW_LOG="$(mktemp)"
trap 'rm -f "$REVIEW_LOG"' EXIT

# tee + pipefail: seed-review.sh's real exit code still fails the script, but
# we also keep its output to pull the award summary out of below.
"$ROOT/scripts/seed-review.sh" "$NETWORK" | tee "$REVIEW_LOG"
ok "Review stage complete"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

PROGRAMME="$(read_json "$SEED" programme)"
REGISTRY="$(read_json "$DEPLOYMENT" registry)"

ADA_AWARD_RAW="$(grep 'ada  (Allocated):' "$REVIEW_LOG" | sed 's/^.*: //' || true)"
KOFI_AWARD_RAW="$(grep 'kofi (Direct):' "$REVIEW_LOG" | sed 's/^.*: //' || true)"
TOTAL_RELEASED_RAW="$(grep 'total released:' "$REVIEW_LOG" | sed 's/^.*: //' || true)"
SPEND_LINE="$(grep 'paid to the school' "$REVIEW_LOG" || true)"

echo
echo -e "${GREEN}${BOLD}============================================================${NC}"
echo -e "${GREEN}${BOLD} 🎉 Milepost quickstart complete — $NETWORK${NC}"
echo -e "${GREEN}${BOLD}============================================================${NC}"
echo
echo -e "${BOLD}Registry:${NC}          $REGISTRY"
echo -e "${BOLD}Programme address:${NC} $PROGRAMME"
echo
echo -e "${BOLD}Awards:${NC}"
[[ -n "$ADA_AWARD_RAW" ]]  && echo "  • Ada  (Allocated to her own wallet): $(to_units "$ADA_AWARD_RAW") XLM"
[[ -n "$KOFI_AWARD_RAW" ]] && echo "  • Kofi (Direct to the school):        $(to_units "$KOFI_AWARD_RAW") XLM"
echo
echo -e "${BOLD}Released:${NC}"
echo "  • Ada's first tranche released into escrow, then she spent part of it herself"
[[ -n "$SPEND_LINE" ]] && echo "    ${SPEND_LINE#*==> }"
[[ -n "$TOTAL_RELEASED_RAW" ]] && echo "  • Total released so far: $(to_units "$TOTAL_RELEASED_RAW") XLM"
echo
echo "Full deployment details:  $DEPLOYMENT"
echo "Full seed/scenario data:  $SEED"
echo
