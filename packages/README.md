# TypeScript bindings

Generated clients for the Milepost contracts, produced by
`stellar contract bindings typescript` from the built wasm.

These are generated artefacts. Do not hand-edit them — regenerate instead:

```sh
cargo build --target wasm32v1-none --release
./scripts/generate-bindings.sh
```

That writes `packages/*/src/index.ts` from the wasm and restores each
singleton's `networks.testnet` from `packages/testnet.json`. `program` has no
deployed address — every programme is its own contract — so it is generated
without one. A naive `stellar contract bindings typescript --wasm ... --overwrite`
into `packages/` will drop those ids and wipe the rest of the package directory;
do not do that.

CI re-runs the generator and fails if the committed interface does not match.
To run the same check locally:

```sh
cargo build --target wasm32v1-none --release
./scripts/check-bindings.sh
```

Deployed contract ids are written to `deployments/<network>.json` by
`scripts/deploy.sh`; the bindings take the id at construction, so the same
package works against any network.
