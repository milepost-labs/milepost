#!/usr/bin/env bash
#
# Install the binding packages built from this checkout into frontend/, in
# place of the @milepost/* versions frontend/package.json pins from npm.
#
# The frontend depends on published versions, so on its own it never sees a
# contract change that has not been released. Run this after changing a
# contract and regenerating the bindings to find out whether the frontend still
# builds and passes its tests against what the next release would publish. CI
# runs it on every PR for the same reason.
#
# Each package is built and packed with `npm pack`, and the tarballs are
# installed with `--no-save`: the frontend gets exactly the files a release
# would upload, and neither frontend/package.json nor its lockfile changes.
# `npm ci --prefix frontend` puts the published versions back.
#
# Usage: ./scripts/frontend-with-local-bindings.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGES=(attest policy-spend program record registry)

TMP="$(mktemp -d "${TMPDIR:-/tmp}/milepost-local-bindings.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

echo "==> Building binding packages from this checkout"
for pkg in "${PACKAGES[@]}"; do
  echo "    $pkg"
  npm ci --prefix "$ROOT/packages/$pkg" --no-audit --no-fund --loglevel=error
  npm run build --prefix "$ROOT/packages/$pkg"
  (cd "$ROOT/packages/$pkg" && npm pack --pack-destination "$TMP" --ignore-scripts --loglevel=error >/dev/null)
done

echo "==> Installing frontend dependencies"
npm ci --prefix "$ROOT/frontend" --no-audit --no-fund --loglevel=error

echo "==> Replacing the published @milepost/* with the local builds"
(cd "$ROOT/frontend" && npm install --no-save --no-audit --no-fund --loglevel=error "$TMP"/*.tgz)

# A registry install and a local tarball install look identical on disk, so
# compare the compiled output itself.
for pkg in "${PACKAGES[@]}"; do
  if ! cmp -s "$ROOT/packages/$pkg/dist/index.js" "$ROOT/frontend/node_modules/@milepost/$pkg/dist/index.js"; then
    echo "error: frontend/node_modules/@milepost/$pkg is not the build from packages/$pkg" >&2
    exit 1
  fi
done

echo "==> frontend/ now uses this checkout's bindings"
