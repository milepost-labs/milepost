.PHONY: help build test lint frontend-local-bindings deploy seed

# Default target listing all available tasks
help:
	@echo "Milepost Task Runner Commands:"
	@echo "  make build          Build contract WASM artifacts"
	@echo "  make test           Run contract tests (depends on build)"
	@echo "  make lint           Run rustfmt check and clippy (depends on build)"
	@echo "  make frontend-local-bindings Build and test the app against this checkout's bindings (FRONTEND_DIR, default frontend)"
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

# Build and test the app against the bindings built from this checkout, the
# check to run after changing a contract. The app lives in frontend/; set
# FRONTEND_DIR to point at a checkout elsewhere. `npm ci` there puts the
# published versions back afterwards.
FRONTEND_DIR ?= frontend
frontend-local-bindings:
	./scripts/frontend-with-local-bindings.sh "$(FRONTEND_DIR)"
	npm run build --prefix "$(FRONTEND_DIR)"
	npm test --prefix "$(FRONTEND_DIR)"

# Deploy contracts
deploy:
	./scripts/deploy.sh

# Seed protocol data
seed:
	./scripts/seed.sh
