#!/usr/bin/env bash
#
# Install the binding packages built from this checkout into one or more
# consumers — milepost-frontend, milepost-indexer — in place of the @milepost/*
# versions their package.json pins from npm.
#
# Consumers depend on published versions, so on their own they never see a
# contract change that has not been released. Run this after changing a
# contract and regenerating the bindings to find out whether they still build
# and pass their tests against what the next release would publish. CI runs it
# on every PR for the same reason.
#
# Each package is built and packed with `npm pack`, and the tarballs are
# installed with `--no-save`: the app gets exactly the files a release would
# upload, and neither its package.json nor its lockfile changes. Running
# `npm ci` in the app puts the published versions back.
#
# Usage: ./scripts/frontend-with-local-bindings.sh [consumer-dir...]
#
# consumer-dir defaults to ../milepost-frontend, a clone of
# milepost-labs/milepost-frontend next to this repository. Pass several to
# install one set of builds into each of them, which is what CI does for
# milepost-frontend and milepost-indexer.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGES=(attest policy-spend program record registry)

CONSUMERS=()
for arg in "${@:-$ROOT/../milepost-frontend}"; do
  if [[ ! -f "$arg/package.json" ]] || ! grep -q '"@milepost/program"' "$arg/package.json"; then
    echo "error: $arg does not depend on @milepost/*" >&2
    echo "pass a checkout of milepost-frontend or milepost-indexer, or clone one next to this repository" >&2
    exit 1
  fi
  CONSUMERS+=("$(cd "$arg" && pwd)")
done

TMP="$(mktemp -d "${TMPDIR:-/tmp}/milepost-local-bindings.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

echo "==> Building binding packages from this checkout"
for pkg in "${PACKAGES[@]}"; do
  echo "    $pkg"
  npm ci --prefix "$ROOT/packages/$pkg" --no-audit --no-fund --loglevel=error
  npm run build --prefix "$ROOT/packages/$pkg"
  (cd "$ROOT/packages/$pkg" && npm pack --pack-destination "$TMP" --ignore-scripts --loglevel=error >/dev/null)
done

for consumer in "${CONSUMERS[@]}"; do
  echo "==> Installing dependencies in $consumer"
  npm ci --prefix "$consumer" --no-audit --no-fund --loglevel=error

  echo "==> Replacing the published @milepost/* with the local builds"
  (cd "$consumer" && npm install --no-save --no-audit --no-fund --loglevel=error "$TMP"/*.tgz)

  # A registry install and a local tarball install look identical on disk, so
  # compare the compiled output itself.
  for pkg in "${PACKAGES[@]}"; do
    if ! cmp -s "$ROOT/packages/$pkg/dist/index.js" "$consumer/node_modules/@milepost/$pkg/dist/index.js"; then
      echo "error: $consumer/node_modules/@milepost/$pkg is not the build from packages/$pkg" >&2
      exit 1
    fi
  done

  echo "==> $consumer now uses this checkout's bindings"
done
