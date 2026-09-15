#!/usr/bin/env bash
#
# Install the binding packages built from this checkout into a checkout of
# milepost-frontend, in place of the @milepost/* versions its package.json
# pins from npm.
#
# The app depends on published versions, so on its own it never sees a
# contract change that has not been released. Run this after changing a
# contract and regenerating the bindings to find out whether the app still
# builds and passes its tests against what the next release would publish. CI
# runs it on every PR for the same reason.
#
# Each package is built and packed with `npm pack`, and the tarballs are
# installed with `--no-save`: the app gets exactly the files a release would
# upload, and neither its package.json nor its lockfile changes. Running
# `npm ci` in the app puts the published versions back.
#
# Usage: ./scripts/frontend-with-local-bindings.sh [frontend-dir]
#
# frontend-dir defaults to ../milepost-frontend, a clone of
# milepost-labs/milepost-frontend next to this repository.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGES=(attest policy-spend program record registry)

FRONTEND_ARG="${1:-$ROOT/../milepost-frontend}"
if [[ ! -f "$FRONTEND_ARG/package.json" ]] || ! grep -q '"@milepost/program"' "$FRONTEND_ARG/package.json"; then
  echo "error: $FRONTEND_ARG is not a milepost-frontend checkout" >&2
  echo "clone https://github.com/milepost-labs/milepost-frontend next to this repository, or pass its path" >&2
  exit 1
fi
FRONTEND="$(cd "$FRONTEND_ARG" && pwd)"

TMP="$(mktemp -d "${TMPDIR:-/tmp}/milepost-local-bindings.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

echo "==> Building binding packages from this checkout"
for pkg in "${PACKAGES[@]}"; do
  echo "    $pkg"
  npm ci --prefix "$ROOT/packages/$pkg" --no-audit --no-fund --loglevel=error
  npm run build --prefix "$ROOT/packages/$pkg"
  (cd "$ROOT/packages/$pkg" && npm pack --pack-destination "$TMP" --ignore-scripts --loglevel=error >/dev/null)
done

echo "==> Installing dependencies in $FRONTEND"
npm ci --prefix "$FRONTEND" --no-audit --no-fund --loglevel=error

echo "==> Replacing the published @milepost/* with the local builds"
(cd "$FRONTEND" && npm install --no-save --no-audit --no-fund --loglevel=error "$TMP"/*.tgz)

# A registry install and a local tarball install look identical on disk, so
# compare the compiled output itself.
for pkg in "${PACKAGES[@]}"; do
  if ! cmp -s "$ROOT/packages/$pkg/dist/index.js" "$FRONTEND/node_modules/@milepost/$pkg/dist/index.js"; then
    echo "error: $FRONTEND/node_modules/@milepost/$pkg is not the build from packages/$pkg" >&2
    exit 1
  fi
done

echo "==> $FRONTEND now uses this checkout's bindings"
