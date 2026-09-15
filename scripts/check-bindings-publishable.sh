#!/usr/bin/env bash
#
# Fail if a binding package would publish a broken tarball.
#
# `npm pack --dry-run` lists exactly what `npm publish` would upload, and
# nothing else in CI looks at that list. A package that ships without dist/
# installs cleanly and only fails when a consumer imports it, which is far too
# late to find out. For each package this checks that the tarball:
#
#   - contains dist/index.js and dist/index.d.ts, the files `exports` and
#     `typings` point at
#   - contains nothing from src/ and no tsconfig.json — the generated source is
#     not part of the API, and the emitted declarations already describe it
#
# and that package.json carries a licence and the repository metadata npm
# provenance is checked against.
#
# Requires every package to be built first (`npm run build`).
#
# Usage: ./scripts/check-bindings-publishable.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGES=(attest policy-spend program record registry)

TMP="$(mktemp -d "${TMPDIR:-/tmp}/milepost-pack.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

failed=0
for pkg in "${PACKAGES[@]}"; do
  dir="$ROOT/packages/$pkg"
  echo "==> $pkg"

  if ! (cd "$dir" && npm pack --dry-run --json --ignore-scripts) >"$TMP/$pkg.json" 2>"$TMP/$pkg.err"; then
    echo "    npm pack failed in packages/$pkg:" >&2
    sed 's/^/      /' "$TMP/$pkg.err" >&2
    failed=1
    continue
  fi

  if ! python3 - "$TMP/$pkg.json" "$dir/package.json" "$pkg" <<'PY'
import json, sys

pack = json.load(open(sys.argv[1], encoding="utf-8"))[0]
manifest = json.load(open(sys.argv[2], encoding="utf-8"))
pkg = sys.argv[3]
paths = {f["path"] for f in pack["files"]}
problems = []

for required in ("dist/index.js", "dist/index.d.ts"):
    if required not in paths:
        problems.append(f"tarball is missing {required} (was the package built?)")

leaked = sorted(p for p in paths if p.startswith("src/") or p == "tsconfig.json")
if leaked:
    problems.append("tarball ships files that are not API: " + ", ".join(leaked))

repo = manifest.get("repository") or {}
if "github.com/milepost-labs/milepost" not in (repo.get("url") or ""):
    problems.append("repository.url must point at milepost-labs/milepost (npm provenance checks it)")
if repo.get("directory") != f"packages/{pkg}":
    problems.append(f"repository.directory must be packages/{pkg}")
if not manifest.get("license"):
    problems.append("package.json has no license")

for problem in problems:
    print(f"    {problem}", file=sys.stderr)
if not problems:
    print(f"    {len(paths)} files, dist/ present")
sys.exit(1 if problems else 0)
PY
  then
    failed=1
  fi
done

if [[ "$failed" -ne 0 ]]; then
  cat >&2 <<'EOF'

error: a binding package would publish a broken tarball.

Build every package (`npm run build` in packages/<name>), then check the
`files`, `repository` and `license` fields in its package.json.

EOF
  exit 1
fi

echo "==> Binding packages are publishable"
