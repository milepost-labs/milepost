## What & Why

- **What changed?** 
- **Why?** 
- Closes #

## Evidence

<!-- Screenshots/clips for UI changes, or terminal output/test results for contract and tooling changes -->

## Local Checks

- [ ] `cargo test`
- [ ] `cargo clippy --all-targets -- -D warnings`
- [ ] If a contract interface or an event changed: milepost-frontend and milepost-indexer build and test against the new bindings (`./scripts/frontend-with-local-bindings.sh ../milepost-frontend ../milepost-indexer`)

## Contract Changes (if applicable)

- [ ] **WASM size:** Was there a WASM size change? (Note delta if applicable)
- [ ] **Interface impact:** Did contract interfaces or types change? If yes, confirm TS bindings in `packages/` were regenerated.
