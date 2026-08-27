#!/usr/bin/env bash
#
# Second half of the seeded scenario, run once the application window has
# closed: reviewers disagree, awards settle at the median, the clinic attests a
# milestone, a tranche releases and the recipient directs it to the school.
#
#   ./scripts/seed-review.sh [network]

set -euo pipefail

NETWORK="${1:-testnet}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SEED="$ROOT/deployments/$NETWORK.seed.json"

[[ -f "$SEED" ]] || { echo "run ./scripts/seed.sh first" >&2; exit 1; }

# Walks nested keys without building a Python expression out of shell strings,
# which is how the first version of this managed to break on its own quoting.
read_json() {
  python3 - "$SEED" "$@" <<'PYEOF'
import json, sys
value = json.load(open(sys.argv[1]))
for key in sys.argv[2:]:
    value = value[key]
print(value)
PYEOF
}

PROGRAMME="$(read_json programme)"
ATTEST="$(read_json attest)"
RECORD="$(read_json record)"
SCHEMA="$(read_json schema)"
APPLY_DEADLINE="$(read_json deadlines apply)"

NOW="$(date +%s)"
if (( NOW < APPLY_DEADLINE )); then
  echo "applications close in $((APPLY_DEADLINE - NOW))s — wait, then re-run" >&2
  exit 1
fi

addr() { stellar keys address "milepost-$1"; }
invoke() {
  local id="$1" source="$2"; shift 2
  stellar contract invoke --id "$id" --source-account "milepost-$source" \
    --network "$NETWORK" --send=yes -- "$@"
}

echo "==> Reviewing"
# Reviewers disagree about Ada. The median holds at 300 rather than being
# dragged to 100 by the cautious reviewer or up to 500 by the generous one.
invoke "$PROGRAMME" reviewer-1 review \
  --reviewer "$(addr reviewer-1)" --applicant "$(addr student-ada)" --approved 3000000000 >/dev/null
invoke "$PROGRAMME" reviewer-2 review \
  --reviewer "$(addr reviewer-2)" --applicant "$(addr student-ada)" --approved 1000000000 >/dev/null
invoke "$PROGRAMME" reviewer-3 review \
  --reviewer "$(addr reviewer-3)" --applicant "$(addr student-ada)" --approved 5000000000 >/dev/null
echo "    ada: reviewers said 300 / 100 / 500"

# Kofi's ask is modest and the panel agrees, so he is funded in full.
for r in reviewer-1 reviewer-2 reviewer-3; do
  invoke "$PROGRAMME" "$r" review \
    --reviewer "$(addr $r)" --applicant "$(addr student-kofi)" --approved 800000000 >/dev/null
done
echo "    kofi: unanimous at 80"

echo "==> Settling awards"
ADA_AWARD="$(invoke "$PROGRAMME" creator finalize \
  --applicant "$(addr student-ada)" --payee "$(addr student-ada)" --mode '"Allocated"')"
echo "    ada  (Allocated): $(python3 -c "import json,sys;print(json.loads('''$ADA_AWARD''')['granted'])" 2>/dev/null || echo "$ADA_AWARD")"

KOFI_AWARD="$(invoke "$PROGRAMME" creator finalize \
  --applicant "$(addr student-kofi)" --payee "$(addr school)" --mode '"Direct"')"
echo "    kofi (Direct):    $(python3 -c "import json,sys;print(json.loads('''$KOFI_AWARD''')['granted'])" 2>/dev/null || echo "$KOFI_AWARD")"

echo "==> Clinic attests Ada met her first milestone"
ADA_PROOF="$(invoke "$ATTEST" clinic attest \
  --attester "$(addr clinic)" \
  --schema_uid "$SCHEMA" \
  --subject "$(addr student-ada)" \
  --data_hash "$(printf '%064d' 21)" \
  --expires_at null | tr -d '"')"
echo "    proof: $ADA_PROOF"

echo "==> Releasing her first tranche"
invoke "$PROGRAMME" creator release \
  --recipient "$(addr student-ada)" \
  --attestation "$ADA_PROOF" \
  --attester "$(addr clinic)" >/dev/null
echo "    released into escrow, allocated to Ada"

echo "==> Ada directs part of it to the school"
invoke "$PROGRAMME" student-ada spend \
  --recipient "$(addr student-ada)" \
  --payee "$(addr school)" \
  --amount 200000000 >/dev/null
echo "    20 paid to the school, by Ada's own choice"

echo
echo "==> Final state"
echo "    ada allocation:  $(invoke "$PROGRAMME" creator allocation_of --recipient "$(addr student-ada)")"
echo "    ada standing:    $(invoke "$RECORD" creator get --subject "$(addr student-ada)")"
echo "    total released:  $(invoke "$PROGRAMME" creator total_released)"
echo
echo "Programme: $PROGRAMME"
