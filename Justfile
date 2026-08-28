# Milepost Task Runner
# Listing tasks: `just` or `just --list`

set shell := ["bash", "-uc"]

# Default task: list all available tasks with descriptions
default:
    @just --list

# Build all smart contract WASM artifacts
build:
    cargo build --target wasm32v1-none --release

# Run smart contract tests (depends on build as registry tests import programme WASM)
test: build
    cargo test --all-features

# Run formatting check and clippy linter (depends on build)
lint: build
    cargo fmt --all --check
    cargo clippy --all-targets --all-features -- -D warnings

# Build TypeScript packages dist and frontend production bundle
frontend-build:
    for p in attest policy-spend program record registry; do \
        npm ci --prefix "packages/$$p"; \
        npm run build --prefix "packages/$$p"; \
    done
    npm ci --prefix frontend
    npm run build --prefix frontend

# Deploy contracts using deploy script
deploy:
    ./scripts/deploy.sh

# Seed protocol test data using seed script
seed:
    ./scripts/seed.sh
