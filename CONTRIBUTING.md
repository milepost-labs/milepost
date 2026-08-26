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

A release is a git tag. Pushing a tag matching `vX.Y.Z` (or a pre-release like
`v0.1.0-rc.1`) triggers [`.github/workflows/release.yml`](.github/workflows/release.yml),
which:

1. Builds every contract to `wasm32v1-none` release wasm — the same build CI
   already verified on the PR that merged.
2. Hashes each `.wasm` with SHA-256 (`checksums.txt`). A programme is
   instantiated from a wasm hash (see the root [README](README.md#deployed-testnet)),
   so the hash *is* what downstream teams pin to — not a crate version.
3. Generates a changelog from the commits since the previous tag
   ([git-cliff](https://git-cliff.org/), configured in [`cliff.toml`](cliff.toml)) and
   publishes a GitHub Release with the wasm files, `checksums.txt`, and the
   changelog as the release body. `v*-*` tags (e.g. `-rc.1`, `-beta.2`) are
   published as pre-releases.

Nothing in the workflow edits `Cargo.toml` or commits back to the repo —
tagging is a manual, deliberate act, not an automated bump.

### Tagging a release

```sh
git tag v0.2.0
git push origin v0.2.0
```

Pick the version by ordinary semver judgement (see below); nothing derives it
for you from commit history.

### Marking interface-breaking changes

Commit subjects already follow `<type>(<scope>): <description>`. To flag a
commit as breaking a contract's public interface — its client-facing
functions, its error codes (section 7), or its storage/upgrade layout — do
either of:

* Append `!` after the type/scope: `feat(program)!: change award() signature`
* Add a `BREAKING CHANGE: <explanation>` footer to the commit body.

Either form makes git-cliff place that commit in its own "⚠ Breaking changes"
section at the top of the release notes, separate from ordinary `Features`/
`Fixes` entries, so a downstream integrator scanning a release can see at a
glance whether upgrading is safe. A deployed Soroban contract can't be
patched in place — a breaking release means existing callers need to
re-integrate against a new deployment, so treat this marker as required, not
decorative.

### Versioning crates vs. tagging releases

The workspace's crates all share `version = "0.1.0"` in the root
`Cargo.toml` and none are bumped automatically by this workflow — the git
tag, not the crate version field, is the source of truth for what a release
is. Bump the workspace version by hand when a tag represents a meaningful
jump (e.g. the first `1.0.0`), but a mismatch between the tag and the crate
field is expected and not a bug: contracts here are consumed as compiled
wasm pinned by hash and as the generated TypeScript bindings in `packages/`
(see the [README](README.md#typescript-bindings)), not as a Rust library
dependency.

### Why these crates are not published to crates.io

This release process produces GitHub Release artifacts only; nothing here
publishes to crates.io. That's a deliberate choice, not a gap:

* `milepost-policy-spend` depends on `smart-wallet-interface` pinned to a git
  revision (see its `Cargo.toml`) because that crate isn't published either —
  crates.io rejects git dependencies, so this crate can't be published as-is.
* The actual integration surface for another Stellar team is a deployed wasm
  hash plus the generated TS bindings, not `cargo add milepost-attest`. None
  of the five contracts expose a Rust API meant to be depended on externally.
* All crates are pre-1.0 and workspace-versioned together; publishing now
  would mean maintaining crates.io semver guarantees before the interfaces
  (and this release process itself) have stabilized.

If a real Rust-dependency use case shows up later, revisit this — starting
with `milepost-types`, the one crate with no unpublished dependency in its
way — but raise it as its own issue rather than folding it into this
workflow.

### Verifying the workflow

Push a pre-release tag (`vX.Y.Z-rc.N`) on your own fork before trusting a
change to this workflow, and check the Actions run produces a pre-release
with wasm files, `checksums.txt`, and a non-empty changelog attached.
