#!/usr/bin/env bash
# Fails if a development-only page reached the production build.
#
# The component gallery at /dev/ui is registered behind import.meta.env.DEV,
# so Vite drops it from `npm run build`. This checks the built output for its
# heading, which is the one string that only the gallery carries.
set -euo pipefail

dist="$(dirname "$0")/../dist"
if [ ! -d "$dist/assets" ]; then
  echo "::error::No build found in $dist; run npm run build first"
  exit 1
fi

if grep -rlq "UI Component Gallery" "$dist"; then
  echo "::error::The /dev/ui component gallery is in the production build"
  grep -rl "UI Component Gallery" "$dist"
  exit 1
fi

echo "No development-only pages in the production build."
