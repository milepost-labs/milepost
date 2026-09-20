# Contributing to Milepost frontend

This is the web app for [Milepost](https://github.com/milepost-labs/milepost).
Contract, bindings and protocol work happens in that repository; this one uses
the published `@milepost/*` packages.

## Prerequisites

| Tool | Version | Notes |
| :--- | :--- | :--- |
| Node.js | 24 | What CI uses. ESLint 10 needs `^20.19 \|\| ^22.13 \|\| >=24`, and Vite needs `>=22.12` |
| npm | bundled with Node | Do not use pnpm or yarn — they create lockfile conflicts |
| Freighter | latest | [freighter.app](https://www.freighter.app/) — browser wallet for trying the app on testnet |

## Local setup

```sh
git clone https://github.com/milepost-labs/milepost-frontend.git
cd milepost-frontend
npm ci
npm run dev
```

Then open http://localhost:5173.

The app targets Stellar testnet. Three optional variables in `.env.local`, which
git ignores, override its defaults:

```env
# Soroban RPC endpoint. Default: https://soroban-testnet.stellar.org
VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
# Contract id of the programme that pages fall back to. Default: the seeded testnet programme
VITE_PROGRAMME_ID=
# Published index that supplies the lists the contracts cannot answer, such as
# who holds an award. Default: https://milepost-labs.github.io/milepost-indexer/v1
VITE_INDEXER_URL=
```

The index is built by [milepost-indexer](https://github.com/milepost-labs/milepost-indexer)
and is advisory: every entry it lists is read back from the contract before the
app treats it as fact, so a list that is stale, missing or wrong can only hide
something, never show something false.

**Pre-commit hook (opt-in).** `./scripts/install-hooks.sh` lints staged files
with ESLint before each commit. Bypass it in an emergency with
`git commit --no-verify`.

## Checks

All of these must pass before a PR is ready, and CI runs the same:

```sh
npm run lint    # eslint, including React Compiler rules
npm run build   # tsc -b && vite build
npm test        # vitest
```

CI also enforces a bundle size budget (`scripts/check-bundle-size.sh`, with the
baseline in `bundle-budget.json`) and fails on npm advisories at or above high
severity in production dependencies (`scripts/check-npm-advisories.sh`). Raise
the bundle baseline only once growth is confirmed to be intentional, and record
an advisory exception only with a stated reason, in
`.github/npm-audit-exceptions.json`.

The [testing guide](docs/testing-guide.md) covers mocking a contract client,
the no-network rule, and what the reachability check means when it fires.

## Styling

Use the tokens in `src/styles/tokens.css` for colour, spacing, type, radius and
elevation. No literal hex values or pixel spacing in new CSS.

## Contract changes

If a feature needs a contract change, open the issue in
[milepost](https://github.com/milepost-labs/milepost/issues). This repository
only uses released bindings; to try the app against an unreleased change, see
"Against unreleased bindings" in the [README](README.md#running-it).

## Issues and pull requests

1. Comment on the issue before starting, so it can be assigned and nobody
   duplicates the work.
2. Fork the repository and branch from `main`, named
   `<type>/<short-description>` — for example `feat/contribute-flow` or
   `fix/address-truncation`.
3. Write imperative commit subjects under 72 characters, with context in the
   body when it helps.
4. In the PR, link the issue with `Closes #<number>`, and show the change
   working: screenshots or a short clip for UI, test output for logic.

PRs are squash-merged, so the PR title and description become the commit on
`main`.

## Security

Report vulnerabilities privately, as [SECURITY.md](SECURITY.md) describes, never
in a public issue.
