#!/usr/bin/env bash
#
# Compare built wasm sizes against the budgets in size-budgets.json.
# Exit 1 when any contract exceeds its budget; report deltas on stdout.
#
#   ./scripts/check-sizes.sh [budgets-file] [wasm-dir]

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUDGETS="${1:-$ROOT/size-budgets.json}"
WASM_DIR="${2:-$ROOT/target/wasm32v1-none/release}"

[[ -f "$BUDGETS" ]] || { echo "budgets file not found: $BUDGETS" >&2; exit 1; }

failed=0

echo "| contract | size (bytes) | budget | delta |"
echo "| --- | ---: | ---: | ---: |"

for contract in $(python3 -c "import json;print(' '.join(json.load(open('$BUDGETS')).keys()))"); do
  wasm="$WASM_DIR/${contract}.wasm"
  if [[ ! -f "$wasm" ]]; then
    echo "| $contract | **missing** | — | — |"
    continue
  fi

  size=$(stat -c%s "$wasm")
  budget=$(python3 -c "import json;print(json.load(open('$BUDGETS'))['$contract'])")
  delta=$((size - budget))

  if (( size > budget )); then
    echo "| $contract | **$size** | $budget | **+$delta** |"
    failed=1
  elif (( delta > 0 )); then
    echo "| $contract | $size | $budget | +$delta |"
  else
    echo "| $contract | $size | $budget | $delta |"
  fi
done

if (( failed )); then
  echo
  echo "Contract size budget exceeded. Raise the budget in size-budgets.json" >&2
  echo "after confirming the growth is intentional." >&2
  exit 1
fi
