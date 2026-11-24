#!/usr/bin/env bash
#
# Mutation-test the load-bearing contracts and report surviving mutants by function.
# Scope, test arguments and the explained exclusions live in .cargo/mutants.toml;
# see docs/testing-guide.md#mutation-testing.
#
#   ./scripts/mutants.sh                          # every mutant (hours)
#   ./scripts/mutants.sh -F 'Programme::refund'   # mutants whose name matches
#   ./scripts/mutants.sh --in-diff changes.diff   # only lines a diff touches
#   ./scripts/mutants.sh --shard 2/8              # one CI shard
#   ./scripts/mutants.sh --report DIR...          # report on earlier results only
#   ./scripts/mutants.sh --check-excludes         # only check .cargo/mutants.toml
#
# Any other arguments go to cargo-mutants. The report goes to stdout, and to the
# job summary when $GITHUB_STEP_SUMMARY is set.
#
# Before mutating, it builds the contracts' wasm and points MILEPOST_WASM_DIR at
# it. The registry and record tests import that wasm (see their build.rs), and
# cargo-mutants builds in a copy of the workspace that has no target/, so
# without this no mutant compiles and the run tests nothing.
#
# Exit 0 when no mutant survived; 1 when one did, when the unmutated suite
# failed, when too many mutants were unviable to trust the run, when an
# exclusion in .cargo/mutants.toml matches a different number of mutants than it
# says, or when cargo-mutants could not run.

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
unviable = by_status["Unviable"]
total = sum(len(v) for v in by_status.values())

# A mutant that does not build tests nothing. A few are normal (a replacement
# value that does not type-check), but when most are unviable the tree itself
# does not build, and a report of "0 survived" means nothing was tested. Small
# runs (a PR's changed lines) are too few to judge by share, except that every
# mutant failing to build is never a pass.
MAX_UNVIABLE_SHARE = 0.05
if total and (len(unviable) == total or (total >= 20 and len(unviable) / total > MAX_UNVIABLE_SHARE)):
    broken.append(
        f"{len(unviable)} of {total} mutants were unviable (over {MAX_UNVIABLE_SHARE:.0%}), "
        "so the run tested almost nothing; check that the unmutated tree builds in a copy of the workspace"
    )

lines = ["### Mutation testing: load-bearing contracts", ""]
lines.append(
    f"{total} mutants: {len(by_status['CaughtMutant'])} caught, {len(missed)} survived, "
    f"{len(timeouts)} timed out, {len(unviable)} unviable."
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

# Each `exclude_re` entry in .cargo/mutants.toml ends with `# N`, the number of
# mutants it is meant to exclude. Count what it matches in the unfiltered list
# and fail on a difference, so an entry neither goes stale nor quietly swallows
# a new, real mutant in the same function.
check_excludes() {
  local listing
  listing="$(mktemp)"
  # Plain text: CI sets CARGO_TERM_COLOR=always, and colour codes inside the
  # names would stop every pattern below from matching.
  if ! cargo mutants --list --no-config --colors=never >"$listing" 2>/dev/null; then
    echo "cargo mutants --list failed, so the exclusions could not be checked" >&2
    rm -f "$listing"
    return 1
  fi
  python3 - .cargo/mutants.toml "$listing" <<'EOF'
import re, sys

config, listing = sys.argv[1], sys.argv[2]
names = open(listing).read().splitlines()

entries, inside = [], False
for number, line in enumerate(open(config), 1):
    if re.match(r"\s*exclude_re\s*=\s*\[", line):
        inside = True
        continue
    if inside and line.strip().startswith("]"):
        break
    if inside:
        entry = re.match(r"\s*'([^']*)'\s*,?\s*(?:#\s*(\d+))?\s*$", line)
        if entry:
            entries.append((number, entry.group(1), entry.group(2)))
        elif line.strip() and not line.strip().startswith("#"):
            print(f".cargo/mutants.toml:{number}: write each exclude_re entry as 'pattern', # N", file=sys.stderr)
            sys.exit(1)

problems = []
print(f"Exclusions in .cargo/mutants.toml ({len(entries)} entries):")
for number, pattern, count in entries:
    matched = [name for name in names if re.search(pattern, name)]
    print(f"  {pattern}")
    for name in matched:
        print(f"    excludes {name}")
    if count is None:
        problems.append(f".cargo/mutants.toml:{number}: '{pattern}' does not say how many mutants it excludes (end the line with # N)")
    elif len(matched) != int(count):
        problems.append(
            f".cargo/mutants.toml:{number}: '{pattern}' should exclude {count} mutant(s) but matches {len(matched)}. "
            "Re-check the reasoning before changing the count: a new comparison in that function is a real mutant."
        )
for problem in problems:
    print(problem, file=sys.stderr)
sys.exit(1 if problems else 0)
EOF
  local status=$?
  rm -f "$listing"
  return $status
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

check_excludes || exit 1
[[ "${1:-}" == "--check-excludes" ]] && exit 0

# cargo-mutants copies the workspace without target/, so the tests in the copy
# read the wasm from this checkout's build, through the absolute path build.rs
# writes from MILEPOST_WASM_DIR.
echo "Building the contracts' wasm for the tests that import it"
cargo build --target wasm32v1-none --release || {
  echo "the wasm build failed, so no mutant could build either" >&2
  exit 1
}
export MILEPOST_WASM_DIR="${CARGO_TARGET_DIR:-$ROOT/target}/wasm32v1-none/release"

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
