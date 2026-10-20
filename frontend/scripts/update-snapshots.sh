#!/usr/bin/env bash
# Update visual regression baselines.
#
# Run this after an intentional styling change to commit new reference images.
# Every image it writes will be diffed on the next CI run; review the diff
# before committing so an unintended change is not silently accepted.
#
# Usage (from frontend/):
#   ./scripts/update-snapshots.sh
#
# The script installs Playwright's browser binaries if they are not already
# present — a one-time download of roughly 150 MB for Chromium.

set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Installing Playwright browsers (skipped if already installed)"
npx playwright install chromium --with-deps

echo "==> Updating screenshot baselines"
npm run screenshots:update

echo ""
echo "Baselines updated. Review the diff with:"
echo "  git diff --stat tests/screenshots/"
echo "Then commit the images you intended to change."
