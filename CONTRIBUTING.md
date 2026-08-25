# Contributing to Milepost

Welcome, and thank you for your interest in contributing to Milepost! This guide covers everything you need to go from a clean checkout to an open pull request: local setup, running checks, documentation standards, and the issue workflow.

## Table of Contents
1. [Prerequisites](#1-prerequisites)
2. [Local Setup](#2-local-setup)
3. [Running Frontend Checks](#3-running-frontend-checks)
4. [Running Contract Checks](#4-running-contract-checks)
5. [Documentation Standards](#5-documentation-standards)
6. [Issue and PR Workflow](#6-issue-and-pr-workflow)
7. [Error Code Stability Policy](#7-error-code-stability-policy)
8. [Release Process](#8-release-process)

---

## 1. Prerequisites

| Tool | Minimum version | Notes |
| :--- | :--- | :--- |
| Node.js | 18+ | 22 is recommended for CI alignment |
| npm | 8+ | Do not use pnpm or yarn — it creates lockfile conflicts |
| Rust + Cargo | stable (1.74+) | Install via [rustup.rs](https://rustup.rs/) |
| wasm32-unknown-unknown | — | `rustup target add wasm32-unknown-unknown` |
| Stellar CLI | 21+ | [Installation guide](https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup) |
| Freighter wallet | latest | [freighter.app](https://www.freighter.app/) — browser extension for UI testing |

---

## 2. Local Setup

**Clone and install**
```bash
git clone https://github.com/milepost-labs/milepost.git
cd milepost

# Install frontend dependencies
cd frontend
npm install
cd ..
```

**Environment variables**
Create `frontend/.env.local` with your local or testnet configurations. Example:
```env
VITE_NETWORK=testnet
VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
```

**Start the development server**
```bash
cd frontend
npm run dev
```
Open [http://localhost:5173](http://localhost:5173/) to view the app.

---

## 3. Running Frontend Checks

All checks must pass before opening a PR. Run them from the `frontend/` directory:

```bash
# Lint the codebase
npm run lint

# Build for production
npm run build
```

**Architecture note:** The frontend is built with React, Vite, and TypeScript. We utilize a custom CSS-variable design system in `index.css`. Please ensure any new components adhere to the existing slate/navy aesthetic rather than introducing new localized colors.

---

## 4. Running Contract Checks

Milepost's Soroban contracts are structured as a workspace in the root directory (e.g., `contracts/attest`, `contracts/program`, `contracts/registry`, etc.). 

Run these checks from the **root** of the repository:

```bash
# Format check
cargo fmt --all --check

# Lint
cargo clippy --workspace -- -D warnings

# Unit tests
cargo test --workspace
```

To build the WASM artifacts for deployment:
```bash
stellar contract build
```
The compiled outputs will land in `target/wasm32-unknown-unknown/release/`.

---

## 5. Documentation Standards

* **Code comments:** Only add a comment when the *why* is non-obvious — a hidden constraint, a subtle invariant, or a workaround for a specific bug. Do not comment on what the code does; well-named identifiers already do that.
* **Contract interface changes:** Any change that touches the contract state or upgrade flow must be explicitly documented. Breaking changes require an explicit version bump and testnet verification before the PR can be merged.

---

## 6. Issue and PR Workflow

**Picking up an issue**
1. Comment on the issue to let others know you are working on it.
2. Fork the repository and clone your fork.
3. Create a branch from `main` using the convention below.

**Branch naming convention:**
`<type>/<short-description>`
Examples:
* `feat/verifier-dashboard`
* `fix/tranche-unlock-logic`
* `docs/contributing-guide`

**Commit messages**
Write imperative-mood subject lines under 72 characters. Put context in the body when needed.
> feat: add full-screen layout to the landing page
> Replaces the centered hero section with a split-screen design.

**Pull request checklist**
Before marking a PR ready for review:
* `npm run lint` passes
* `npm run build` succeeds
* Contract checks pass if Rust files were touched (`cargo fmt`, `cargo clippy`, `cargo test`)
* PR description references the issue number(s) with `Closes #<number>`

---

## 7. Error Code Stability Policy

If you are modifying the Soroban smart contracts, error codes are part of the contract's public API and are matched on by SDK consumers and off-chain monitoring tools.

**Rules**
1. **Never reassign a published discriminant.** Once an error code has been included in a release, that numeric value is permanently reserved — even if the corresponding variant is removed.
2. **Mark removed variants as reserved.** Replace a deleted variant with an underscored placeholder and annotate it with a `// (reserved — removed variant)` comment. This makes the gap self-documenting and prevents accidental reuse.
3. **Always assign new variants the next available integer.** Do not insert variants mid-sequence; append them at the end of the enum.

Why this matters: Stellar contract error codes propagate as `u32` values in the transaction result. If we reused a previously published discriminant, an indexer or bot that matches on that numeric value could silently misinterpret a new error as an old, unrelated one.

---

## 8. Release Process

Releases are tag-triggered. Pushing a tag matching `v*` runs `.github/workflows/release.yml`, which re-runs the full CI gate (`fmt`, `clippy`, `test`), builds the wasm for every contract, and publishes a GitHub Release containing:

* the `.wasm` file for each contract,
* a `checksums.txt` with the sha256 of each, and
* changelog notes generated from merged PRs since the previous tag.

**The wasm hash, not the tag, is what other teams should pin against.** A programme is instantiated on-chain from an uploaded wasm hash, so `checksums.txt` is the part of a release that matters for interop — verify a contract you depend on by its hash, not by trusting the tag name.

**Versioning**
Bumping `workspace.package.version` in the root `Cargo.toml` is a manual, reviewed part of the PR that precedes a release tag — it is not automated. Use semver:
* patch/minor for internal changes that do not affect any deployed contract's interface,
* a major bump for anything that changes a contract's interface, storage layout, or upgrade behavior, since a deployed contract cannot be patched and stale client bindings fail at runtime.

**Marking interface-breaking changes**
If your PR changes a contract's interface, storage layout, or upgrade path, label the PR `breaking-change`. The release workflow files merged PRs with that label under a dedicated "⚠ Breaking Changes" heading in the generated changelog (see `.github/release.yml`), separate from ordinary fixes and features.

**Verifying a release**
Before cutting a real version, verify the pipeline with a pre-release tag, e.g. `v0.1.1-rc.1`. Any tag containing a hyphen publishes as a GitHub pre-release rather than a full release, so it can be inspected and deleted without affecting the "latest" release teams may be watching.

**crates.io**
The contracts are not published to crates.io. Consumers depend on a deployed instance's wasm hash, not on the Rust crate — Cargo semver-checks a library API, but a Soroban contract's real interface is its ABI on-chain, which crates.io has no way to represent. If that changes (e.g. a shared client crate emerges), raise it as a new issue rather than folding it into this workflow.
