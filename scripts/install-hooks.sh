#!/usr/bin/env bash
set -e

# Opt-in script to install git pre-commit hooks for formatting and linting.

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo ".")"
HOOKS_DIR="$REPO_ROOT/.githooks"

if [ ! -d "$HOOKS_DIR" ]; then
    echo "Error: .githooks directory not found at $HOOKS_DIR"
    exit 1
fi

chmod +x "$HOOKS_DIR/pre-commit"

# Configure git core.hooksPath
git config core.hooksPath .githooks

# Also copy to .git/hooks if .git/hooks directory exists
if [ -d "$REPO_ROOT/.git/hooks" ]; then
    cp "$HOOKS_DIR/pre-commit" "$REPO_ROOT/.git/hooks/pre-commit"
    chmod +x "$REPO_ROOT/.git/hooks/pre-commit"
fi

echo "✅ Pre-commit hooks successfully installed!"
echo "Hooks run cargo fmt and frontend lint on changed files only."
echo "To bypass hooks in emergencies, use 'git commit --no-verify'."
