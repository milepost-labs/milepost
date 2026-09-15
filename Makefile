.PHONY: help build test lint frontend-build frontend-local-bindings deploy seed

# Default target listing all available tasks
help:
	@echo "Milepost Task Runner Commands:"
	@echo "  make build          Build contract WASM artifacts"
	@echo "  make test           Run contract tests (depends on build)"
	@echo "  make lint           Run rustfmt check and clippy (depends on build)"
	@echo "  make frontend-build Build the frontend against the published @milepost/* bindings"
	@echo "  make frontend-local-bindings Build and test the frontend against this checkout's bindings"
	@echo "  make deploy         Deploy contracts using scripts/deploy.sh"
	@echo "  make seed           Seed protocol data using scripts/seed.sh"

# Build all smart contract WASM artifacts
build:
	cargo build --target wasm32v1-none --release

# Run smart contract tests (requires WASM build first as registry tests import programme WASM)
test: build
	cargo test --all-features

# Run formatting check and clippy linter (requires WASM build first)
lint: build
	cargo fmt --all --check
	cargo clippy --all-targets --all-features -- -D warnings

# Build the frontend against the @milepost/* versions it pins from npm
frontend-build:
	npm ci --prefix frontend
	npm run build --prefix frontend

# Build and test the frontend against the bindings built from this checkout —
# the check to run after changing a contract. `npm ci --prefix frontend` puts
# the published versions back afterwards.
frontend-local-bindings:
	./scripts/frontend-with-local-bindings.sh
	npm run build --prefix frontend
	npm test --prefix frontend

# Deploy contracts
deploy:
	./scripts/deploy.sh

# Seed protocol data
seed:
	./scripts/seed.sh
