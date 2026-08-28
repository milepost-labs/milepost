.PHONY: help build test lint frontend-build deploy seed

# Default target listing all available tasks
help:
	@echo "Milepost Task Runner Commands:"
	@echo "  make build          Build contract WASM artifacts"
	@echo "  make test           Run contract tests (depends on build)"
	@echo "  make lint           Run rustfmt check and clippy (depends on build)"
	@echo "  make frontend-build Build packages and frontend app"
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

# Build all TypeScript packages and frontend production assets
frontend-build:
	@for p in attest policy-spend program record registry; do \
		npm ci --prefix "packages/$$p" && \
		npm run build --prefix "packages/$$p"; \
	done
	npm ci --prefix frontend
	npm run build --prefix frontend

# Deploy contracts
deploy:
	./scripts/deploy.sh

# Seed protocol data
seed:
	./scripts/seed.sh
