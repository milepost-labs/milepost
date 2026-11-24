#!/usr/bin/env bash
#
# Typecheck examples/ against the bindings built from this checkout.
#
# The examples show integrators how to call the published @milepost/*
# packages. Typechecking them against the local builds means a binding change
# that would break them fails the PR, rather than an integrator's first run.
#
# `npm ci` installs the TypeScript version pinned in examples/package-lock.json,
# then the local bindings are packed and installed over the published ones.
# A binding package without a dist/ is built first, so this runs on its own
# locally and reuses the builds CI's bindings job has already made.
#
#   ./scripts/typecheck-examples.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKGS=(attest policy-spend program record registry)
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

for pkg in "${PKGS[@]}"; do
  dir="$ROOT/packages/$pkg"
  if [ ! -d "$dir/dist" ]; then
    npm ci --prefix "$dir" --no-audit --no-fund --loglevel=error
    npm run build --prefix "$dir"
  fi
  (cd "$dir" && npm pack --pack-destination "$TMP" --ignore-scripts --loglevel=error >/dev/null)
done

npm ci --prefix "$ROOT/examples" --no-audit --no-fund --loglevel=error
npm install --prefix "$ROOT/examples" --no-save --no-audit --no-fund --loglevel=error "$TMP"/*.tgz
npm run typecheck --prefix "$ROOT/examples"
echo "Examples typecheck against the local bindings."
