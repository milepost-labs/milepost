# TypeScript bindings

Generated clients for the Milepost contracts, produced by
`stellar contract bindings typescript` from the built wasm.

## Installing

Every release tag publishes all five packages to npm, at the tag's version:

```sh
npm install @milepost/program
```

Versions track protocol releases, not individual contracts:
`@milepost/attest@0.2.0` is generated from the `v0.2.0` wasm even if `attest`
itself did not change between releases. Pre-releases go out under the `next`
dist-tag, so a plain install never picks one up.

## Testing the frontend against a change

The app in [`frontend/`](../frontend/) installs these packages from npm, so a
change here only reaches it after a release. To check one before then, from
this repository's root:

```sh
./scripts/frontend-with-local-bindings.sh frontend
npm run build --prefix frontend && npm test --prefix frontend
```

CI does the same on every PR, in the `bindings` job.

## Regenerating

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

Only `src/index.ts` is generated. Each package's `package.json`,
`tsconfig.json` and `README.md` are maintained by hand — the generator never
touches them, and the drift check compares `src/index.ts` alone.

CI re-runs the generator and fails if the committed interface does not match.
To run the same check locally:

```sh
cargo build --target wasm32v1-none --release
./scripts/check-bindings.sh
```

Deployed contract ids are written to `deployments/<network>.json` by
`scripts/deploy.sh`; the bindings take the id at construction, so the same
package works against any network.
