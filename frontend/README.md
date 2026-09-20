# Milepost frontend

The web app for [Milepost](../README.md), conditional disbursement on Stellar.
React 19 + TypeScript + Vite. It talks to the Soroban contracts through the
generated bindings, installed from npm as `@milepost/*` like any other
dependency; their source lives in [`packages/`](../packages) alongside this
directory.

## Running it

```sh
npm ci
npm run dev
```

**Against unreleased bindings.** `npm ci` installs the published versions that
`package.json` pins, so a contract change is invisible here until it is
released. To try one before then, run this from the repository root:

```sh
./scripts/frontend-with-local-bindings.sh frontend
```

It builds the bindings from that checkout and installs them here, leaving
`package.json` and the lockfile untouched; `npm ci` puts the published versions
back. milepost's CI does the same for every one of its PRs.

```sh
npm run build   # tsc -b && vite build
npm run lint    # eslint, including React Compiler rules
npm test        # vitest
```

Node 24. ESLint 10 requires `^20.19 || ^22.13 || >=24`.

The React Compiler lint rules are **on**, and they are not cosmetic — they catch
render-purity and cascading-setState bugs that type-check cleanly and misbehave
at runtime. Fix them rather than suppressing them.

**Testing.** The suite mocks the contract clients — nothing may touch the
network — and the reachability check fails on any module nothing imports. See
the [testing guide](docs/testing-guide.md) for how to mock
a contract client, what the reachability check means when it fires, and which
behaviours are worth testing.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md). Report vulnerabilities privately, as
[SECURITY.md](SECURITY.md) describes, never in a public issue.

## Contract data model

The repository [README](../README.md) covers what the protocol does, how money
moves and the disbursement modes.
[`docs/error-code-reference.md`](../docs/error-code-reference.md) lists every
error each contract can return, with the cause and what a caller should do
about it. The generated clients in [`packages/`](../packages) are the authority
on the exact shapes.
