#!/usr/bin/env bash
#
# Drive a complete scenario against a deployed Milepost so there is something
# real to look at: a funded programme, applicants who asked for different
# amounts, reviewers who disagreed, an attested milestone, a released tranche
# and a recipient directing it to a school.
#
#   ./scripts/seed.sh [network]
#
# Reads contract ids from deployments/<network>.json. Safe to re-run — every run
# creates a fresh programme rather than mutating the last one.

set -euo pipefail

NETWORK="${1:-testnet}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOYMENT="$ROOT/deployments/$NETWORK.json"
OUT_FILE="$ROOT/deployments/$NETWORK.seed.json"

[[ -f "$DEPLOYMENT" ]] || { echo "no deployment found: $DEPLOYMENT" >&2; exit 1; }

read_id() { python3 -c "import json,sys;print(json.load(open('$DEPLOYMENT'))['$1'])"; }
ATTEST="$(read_id attest)"
RECORD="$(read_id record)"
REGISTRY="$(read_id registry)"
DEPLOYER="$(read_id deployer)"

# The scenario's cast. Each is a real account so the frontend sees genuine
# distinct signers rather than one address playing every part.
ACTORS=(creator donor-a donor-b clinic student-ada student-kofi reviewer-1 reviewer-2 reviewer-3 school)

echo "==> Preparing accounts"
for a in "${ACTORS[@]}"; do
  key="milepost-$a"
  if ! stellar keys address "$key" >/dev/null 2>&1; then
    stellar keys generate "$key" --network "$NETWORK" --fund >/dev/null
    echo "    created $key"
  fi
done

addr() { stellar keys address "milepost-$1"; }

invoke() {
  local id="$1" source="$2"; shift 2
  stellar contract invoke --id "$id" --source-account "milepost-$source" \
    --network "$NETWORK" --send=yes -- "$@"
}

# Deadlines are relative to now so the scenario walks through its phases as the
# clock moves, rather than being pinned to timestamps that expire.
NOW="$(date +%s)"
APPLY_DEADLINE=$((NOW + 300))
REVIEW_DEADLINE=$((NOW + 600))
RELEASE_DEADLINE=$((NOW + 86400))
SWEEP_DEADLINE=$((NOW + 172800))

echo "==> Registering the attestation schema"
# Restricted: only the clinic may make this claim, so a forged attestation
# cannot come from anywhere else.
SCHEMA="$(invoke "$ATTEST" clinic register_schema \
  --authority "$(addr clinic)" \
  --definition "milepost:milestone-met:v1" \
  --revocable true \
  --restricted true | tr -d '"')"
echo "    schema: $SCHEMA"

echo "==> Creating the programme"
PROGRAMME="$(invoke "$REGISTRY" creator create \
  --creator "$(addr creator)" \
  --token "$(stellar contract id asset --asset native --network "$NETWORK")" \
  --schema "$SCHEMA" \
  --apply_deadline "$APPLY_DEADLINE" \
  --review_deadline "$REVIEW_DEADLINE" \
  --release_deadline "$RELEASE_DEADLINE" \
  --sweep_deadline "$SWEEP_DEADLINE" \
  --quorum 3 \
  --tranches 3 \
  --metadata_hash "$(printf '%064d' 1)" \
  --reviewers "[\"$(addr reviewer-1)\",\"$(addr reviewer-2)\",\"$(addr reviewer-3)\"]" \
  --verifiers "[\"$(addr clinic)\"]" \
  --name "Community health worker stipend 2026" | tr -d '"')"
echo "    programme: $PROGRAMME"

echo "==> Verifying the school as a payee"
invoke "$PROGRAMME" creator allow_payee --payee "$(addr school)" >/dev/null

echo "==> Funding"
invoke "$PROGRAMME" donor-a contribute --donor "$(addr donor-a)" --amount 6000000000 >/dev/null
invoke "$PROGRAMME" donor-b contribute --donor "$(addr donor-b)" --amount 4000000000 >/dev/null
echo "    contributed by two donors"

echo "==> Applications"
# Deliberately different asks: this is the case an equal split gets wrong.
invoke "$PROGRAMME" student-ada apply \
  --applicant "$(addr student-ada)" --requested 5000000000 \
  --metadata_hash "$(printf '%064d' 11)" >/dev/null
invoke "$PROGRAMME" student-kofi apply \
  --applicant "$(addr student-kofi)" --requested 800000000 \
  --metadata_hash "$(printf '%064d' 12)" >/dev/null
echo "    ada asked 500, kofi asked 80"

cat >"$OUT_FILE" <<EOF
{
  "network": "$NETWORK",
  "programme": "$PROGRAMME",
  "schema": "$SCHEMA",
  "attest": "$ATTEST",
  "record": "$RECORD",
  "registry": "$REGISTRY",
  "deployer": "$DEPLOYER",
  "accounts": {
$(for a in "${ACTORS[@]}"; do printf '    "%s": "%s",\n' "$a" "$(addr "$a")"; done | sed '$ s/,$//')
  },
  "deadlines": {
    "apply": $APPLY_DEADLINE,
    "review": $REVIEW_DEADLINE,
    "release": $RELEASE_DEADLINE,
    "sweep": $SWEEP_DEADLINE
  }
}
EOF

echo
echo "==> Wrote $OUT_FILE"
echo
echo "The programme is in its application window until $(date -d "@$APPLY_DEADLINE" '+%H:%M:%S')."
echo "Once it closes, run the review stage:"
echo
echo "    ./scripts/seed-review.sh $NETWORK"
