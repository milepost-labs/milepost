#!/usr/bin/env bash
#
# Compare the built frontend JavaScript bundle against the recorded baseline.
# The budget allows a small percentage of growth so CI fails on meaningful
# regressions, not on the existing bundle size itself.
#
#   ./scripts/check-frontend-bundle-size.sh [budget-file] [dist-assets-dir]

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUDGET_FILE="${1:-$ROOT/frontend-bundle-budget.json}"
ASSETS_DIR="${2:-$ROOT/frontend/dist/assets}"

[[ -f "$BUDGET_FILE" ]] || { echo "budget file not found: $BUDGET_FILE" >&2; exit 1; }
[[ -d "$ASSETS_DIR" ]] || { echo "frontend assets directory not found: $ASSETS_DIR" >&2; exit 1; }

mapfile -t js_files < <(find "$ASSETS_DIR" -maxdepth 1 -type f -name '*.js' | sort)
if (( ${#js_files[@]} == 0 )); then
  echo "no JavaScript assets found in $ASSETS_DIR" >&2
  exit 1
fi

read -r baseline growth_percent budget < <(
  node -e '
const fs = require("node:fs");
const frontend = JSON.parse(fs.readFileSync(process.argv[1], "utf8")).frontend;
const baseline = Number.parseInt(frontend.baseline_bytes, 10);
const growthPercent = Number(frontend.allowed_growth_percent);
const budget = Math.floor(baseline * (1 + growthPercent / 100));
console.log(baseline, growthPercent, budget);
' "$BUDGET_FILE"
)

size=0
gzip_size=0
for file in "${js_files[@]}"; do
  size=$((size + $(stat -c%s "$file")))
  gzip_size=$((gzip_size + $(gzip -c "$file" | wc -c)))
done

delta=$((size - baseline))
budget_delta=$((size - budget))

echo "| frontend bundle | size (bytes) | gzip size (bytes) | baseline | allowed growth | budget | delta vs baseline |"
echo "| --- | ---: | ---: | ---: | ---: | ---: | ---: |"

if (( size > budget )); then
  echo "| JavaScript assets | **$size** | $gzip_size | $baseline | ${growth_percent}% | $budget | **+$delta** |"
  echo
  echo "Frontend bundle size budget exceeded by $budget_delta bytes." >&2
  echo "Update frontend-bundle-budget.json only after confirming the growth is intentional." >&2
  exit 1
fi

if (( delta > 0 )); then
  echo "| JavaScript assets | $size | $gzip_size | $baseline | ${growth_percent}% | $budget | +$delta |"
else
  echo "| JavaScript assets | $size | $gzip_size | $baseline | ${growth_percent}% | $budget | $delta |"
fi
