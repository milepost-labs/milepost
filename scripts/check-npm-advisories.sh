#!/usr/bin/env bash
#
# Fail if any npm lockfile has a known advisory at or above a severity
# threshold, minus deliberate exceptions recorded with a stated reason.
#
# Scope
# -----
# Six lockfiles are audited independently: frontend/ and the five binding
# packages in packages/. Each is audited with `--omit=dev`: the shipped
# surface is production dependencies, and dev-only advisories (build
# tooling) tend to be unfixable transitive noise that gets ignored. The
# frontend handles wallet signing, so a compromised production dependency
# there reaches transaction construction — that is the failure this check
# exists for.
#
# Threshold
# ---------
# The default severity is "high" (fails on high and critical). Passing a
# different threshold is a deliberate, visible decision:
#
#   ./scripts/check-npm-advisories.sh moderate
#
# Anything below the threshold is reported in the audit output but does not
# fail the job.
#
# Exceptions
# ----------
# An advisory at or above the threshold can be recorded as a deliberate
# exception in .github/npm-audit-exceptions.json, keyed by advisory URL
# with the reason as the value:
#
#   {
#     "https://github.com/advisories/GHSA-xxxx-xxxx-xxxx": "no fix upstream; affects only a dev flow"
#   }
#
# Every exception must carry a stated reason. A stale exception (one whose
# advisory is no longer present in any lockfile) is reported as a warning
# so it can be removed rather than accumulated.
#
# Usage: ./scripts/check-npm-advisories.sh [low|moderate|high|critical]

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
THRESHOLD="${1:-high}"
EXCEPTIONS_FILE="$ROOT/.github/npm-audit-exceptions.json"
LOCKFILE_DIRS=(frontend packages/attest packages/policy-spend packages/program packages/record packages/registry)

case "$THRESHOLD" in
  low | moderate | high | critical) ;;
  *)
    echo "error: invalid severity '$THRESHOLD' (expected low, moderate, high, or critical)" >&2
    exit 1
    ;;
esac

TMP="$(mktemp -d "${TMPDIR:-/tmp}/milepost-npm-audit.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

for dir in "${LOCKFILE_DIRS[@]}"; do
  if [[ ! -f "$ROOT/$dir/package-lock.json" ]]; then
    echo "error: missing $ROOT/$dir/package-lock.json" >&2
    exit 1
  fi
  name="$(basename "$dir")"
  # `|| true`: npm audit exits nonzero when it finds vulnerabilities at or
  # above the audit level, which is the normal path and is parsed below. A
  # failed run that produced no JSON at all (offline, broken lockfile) is
  # different and reported immediately.
  if ! (cd "$ROOT/$dir" && npm audit --omit=dev --json >"$TMP/$name.json" 2>"$TMP/$name.err"); then
    if [[ ! -s "$TMP/$name.json" ]]; then
      echo "error: npm audit failed for $dir:" >&2
      cat "$TMP/$name.err" >&2
      exit 1
    fi
  fi
done

python3 - "$THRESHOLD" "$EXCEPTIONS_FILE" "$TMP" <<'PYEOF'
import json
import os
import sys

threshold, exceptions_file, tmpdir = sys.argv[1], sys.argv[2], sys.argv[3]
severities = ["low", "moderate", "high", "critical"]
min_rank = severities.index(threshold)

exceptions = {}
if os.path.exists(exceptions_file):
    with open(exceptions_file) as f:
        try:
            exceptions = json.load(f)
        except json.JSONDecodeError as exc:
            print(f"error: {exceptions_file} is not valid JSON: {exc}", file=sys.stderr)
            sys.exit(1)
    if not isinstance(exceptions, dict):
        print(f"error: {exceptions_file} must contain a JSON object", file=sys.stderr)
        sys.exit(1)

seen_urls = set()
findings = []
scanned = 0

reports = sorted(name for name in os.listdir(tmpdir) if name.endswith(".json"))
for name in reports:
    pkg = name[: -len(".json")]
    with open(os.path.join(tmpdir, name)) as f:
        report = json.load(f)
    scanned += 1
    for vuln in report.get("vulnerabilities", {}).values():
        for via in vuln.get("via", []):
            if not isinstance(via, dict):
                continue
            url = via.get("url", "")
            if not url:
                continue
            seen_urls.add(url)
            severity = via.get("severity", "low")
            if severities.index(severity) < min_rank:
                continue
            if url in exceptions:
                continue
            findings.append((pkg, severity, via.get("title", "advisory"), url))

if scanned != len(reports):
    print(f"error: expected {len(os.listdir(tmpdir))} audit reports", file=sys.stderr)
    sys.exit(1)

if findings:
    print(f"::error::npm advisories at or above '{threshold}' severity (not excepted):")
    for pkg, severity, title, url in findings:
        print(f"  {pkg}: [{severity}] {title} ({url})")
    print()
    print("To record a deliberate exception, add the advisory URL with a stated")
    print(f"reason to {os.path.relpath(exceptions_file, os.getcwd())}:")
    for pkg, severity, title, url in findings[:3]:
        print(f'  {{ "{url}": "why this one is accepted" }}')
    sys.exit(1)

stale = sorted(url for url in exceptions if url not in seen_urls)
for url in stale:
    print(f"warning: exception no longer needed (advisory not present in any lockfile): {url}")

print(f"ok: {scanned} lockfiles audited, no un-excepted advisories at or above '{threshold}'")
PYEOF
