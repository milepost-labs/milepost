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

# Build the frontend against the @milepost/* versions it pins from npm
frontend-build:
    npm ci --prefix frontend
    npm run build --prefix frontend

# `npm ci --prefix frontend` puts the published versions back afterwards.
# Build and test the frontend against this checkout's bindings, after changing a contract
frontend-local-bindings:
    ./scripts/frontend-with-local-bindings.sh
    npm run build --prefix frontend
    npm test --prefix frontend

# Deploy contracts using deploy script
deploy:
    ./scripts/deploy.sh

# Seed protocol test data using seed script
seed:
    ./scripts/seed.sh
