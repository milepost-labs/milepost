#!/usr/bin/env bash
#
# Mutation-test the programme contract and report surviving mutants by function.
# Scope, test arguments and the explained exclusions live in .cargo/mutants.toml;
# see docs/testing-guide.md#mutation-testing.
#
#   ./scripts/mutants.sh                          # every mutant (hours)
#   ./scripts/mutants.sh -F 'Programme::refund'   # mutants whose name matches
#   ./scripts/mutants.sh --in-diff changes.diff   # only lines a diff touches
#   ./scripts/mutants.sh --shard 2/8              # one CI shard
#   ./scripts/mutants.sh --report DIR...          # report on earlier results only
#
# Any other arguments go to cargo-mutants. The report goes to stdout, and to the
# job summary when $GITHUB_STEP_SUMMARY is set.
#
# Exit 0 when no mutant survived; 1 when one did, when the unmutated suite
# failed, or when cargo-mutants could not run.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

report() {
  python3 - "$@" <<'EOF'
import json, os, sys
from collections import defaultdict

outcomes, broken = [], []
for d in sys.argv[1:]:
    # A results directory, or its parent: CI artifacts unpack without the
    # `mutants.out` level.
    for path in (os.path.join(d, "outcomes.json"), os.path.join(d, "mutants.out", "outcomes.json")):
        if os.path.isfile(path):
            outcomes.extend(json.load(open(path))["outcomes"])
            break
    else:
        broken.append(f"{d}: no outcomes.json")

by_status = defaultdict(list)
for o in outcomes:
    scenario = o["scenario"]
    if scenario == "Baseline":
        if o["summary"] != "Success":
            broken.append(f"the unmutated test suite did not pass ({o['summary']}); see {o['log_path']}")
        continue
    by_status[o["summary"]].append(scenario["Mutant"])

missed = by_status["MissedMutant"]
timeouts = by_status["Timeout"]
total = sum(len(v) for v in by_status.values())

lines = ["### Mutation testing: programme", ""]
lines.append(
    f"{total} mutants: {len(by_status['CaughtMutant'])} caught, {len(missed)} survived, "
    f"{len(timeouts)} timed out, {len(by_status['Unviable'])} unviable."
)
for b in broken:
    lines += ["", f"**Did not run:** {b}"]


def by_function(mutants, heading):
    groups = defaultdict(list)
    for m in mutants:
        groups[m["function"]["function_name"] if m.get("function") else "(no function)"].append(m)
    out = ["", f"#### {heading}", "", "| function | count |", "| --- | ---: |"]
    out += [f"| `{f}` | {len(ms)} |" for f, ms in sorted(groups.items())]
    for f, ms in sorted(groups.items()):
        out += ["", f"`{f}`", ""]
        for m in sorted(ms, key=lambda m: (m["span"]["start"]["line"], m["span"]["start"]["column"])):
            start = m["span"]["start"]
            what = m["name"].split(": ", 1)[1].rsplit(" in ", 1)[0]
            out.append(f"- `{m['file']}:{start['line']}:{start['column']}` {what}")
    return out


if missed:
    lines += by_function(missed, "Surviving mutants by function")
    lines += [
        "",
        "Each one is a change to the contract that every test still passes. Add a test that",
        "fails on it, or, if it cannot change behaviour, exclude it in `.cargo/mutants.toml`",
        "with the reason.",
    ]
# A mutant that hangs the suite was noticed, so it does not fail the run, but a
# hang is worth knowing about: it can also be a test that is merely slow.
if timeouts:
    lines += by_function(timeouts, "Mutants that timed out")

text = "\n".join(lines) + "\n"
print(text)
summary = os.environ.get("GITHUB_STEP_SUMMARY")
if summary:
    with open(summary, "a") as f:
        f.write(text)
sys.exit(1 if missed or broken else 0)
EOF
}

if [[ "${1:-}" == "--report" ]]; then
  shift
  [[ $# -gt 0 ]] || { echo "usage: $0 --report DIR..." >&2; exit 1; }
  report "$@"
  exit $?
fi

command -v cargo-mutants >/dev/null || {
  echo "cargo-mutants is not installed: cargo install --locked cargo-mutants" >&2
  exit 1
}

rm -rf mutants.out mutants.out.old
cargo mutants "$@"
status=$?

# 0 all caught, 2 some survived, 3 some timed out: the report decides those.
# Anything else (a usage error, a baseline failure) means nothing trustworthy ran.
case $status in
  0 | 2 | 3) ;;
  *)
    [[ -f mutants.out/outcomes.json ]] && report mutants.out
    echo "cargo-mutants exited with status $status" >&2
    exit 1
    ;;
esac

# `--in-diff` with no mutable lines in the diff writes no results, and that is
# a pass: the change touched nothing mutation testing covers.
if [[ ! -f mutants.out/outcomes.json ]]; then
  echo "No mutants to test."
  exit 0
fi
report mutants.out
