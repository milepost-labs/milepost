# Contributing to Milepost frontend

This is the web app for [Milepost](https://github.com/milepost-labs/milepost).
It lives in `frontend/` and uses the published `@milepost/*` packages. Contract,
bindings and protocol work happens in the same repository, outside this
directory.

## Prerequisites

| Tool | Version | Notes |
| :--- | :--- | :--- |
| Node.js | 24 | What CI uses. ESLint 10 needs `^20.19 \|\| ^22.13 \|\| >=24`, and Vite needs `>=22.12` |
| npm | bundled with Node | Do not use pnpm or yarn — they create lockfile conflicts |
| Freighter | latest | [freighter.app](https://www.freighter.app/) — browser wallet for trying the app on testnet |

## Local setup

```sh
git clone https://github.com/milepost-labs/milepost.git
cd milepost/frontend
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

`VITE_NETWORK` picks the network for the whole build; unset means testnet. With
`VITE_NETWORK=mainnet` there are no defaults, and `vite build` fails naming any of
these that is missing: `VITE_MAINNET_RPC_URL`, `VITE_MAINNET_INDEXER_URL`,
`VITE_MAINNET_REGISTRY_ID`, `VITE_MAINNET_ATTEST_ID`, `VITE_MAINNET_RECORD_ID`
and `VITE_MAINNET_POLICY_ID`. The code reads all of it from `src/config/network.ts`.

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

### Accessibility checks

Every route in `src/routes.ts` is rendered in jsdom, in both themes, and checked
with [axe-core](https://github.com/dequelabs/axe-core). A serious or critical
violation fails the suite, and therefore CI. The contract clients, the wallet
and the index are mocked, so the check never touches the network.

```sh
npm run test:a11y   # every route, light and dark
```

The `accessibility` job in the repository's `.github/workflows/ci.yml` runs this
on every pull request to `dev` and on pushes to `dev` and `main`.

The route check sees every page at rest, so each write sheet (contribute,
release, batch release, partial refund, vote, attest, finalize, deploy) is also
opened and walked through its steps (form, confirm, pending, done, failed, as
far as the sheet has them), with axe run at every step and focus checked going
into the sheet and back to whatever opened it. The helpers are in
`src/test/sheetAccessibility.ts`; the checks sit beside each sheet's tests, and
the sheets with no test file of their own are in
`src/test/sheets.accessibility.test.tsx`. They run with `npm test`. A new sheet
gets the same: open it from a button, call `expectSheetAccessible(step)` at each
step, and `expectFocusReturnedTo(opener)` once it closes.

A rule that genuinely cannot be fixed is recorded in
`ACCESSIBILITY_EXCEPTIONS` in `src/test/accessibility.test.tsx`, with a `route`
(optional), the `rule` id and a `reason`. The suite fails on an entry with no
reason, and review treats the list as something that should stay empty. Prefer
fixing the page.

### Console errors in tests

`npm test` fails any test that logs a `console.error` it did not expect (#690).
React reports render, `act()` and prop-type problems this way, and a test can
pass while one is logged. The guard is installed once for every test file, in
`src/test/setup.ts`, and implemented in `src/test/consoleErrors.ts`.

A test that logs an error on purpose says so first, with the message it expects
and the reason:

```ts
import { expectConsoleError } from '../test/consoleErrors';

expectConsoleError(/Loading chunk 123 failed/, 'the lazy chunk fails on purpose');
```

Call it in the test body, before the code that logs. The pattern is matched
against the whole message, and a reason of ten characters or fewer throws. The
opt-ins reset before each test. The error still prints, so it stays visible in
the log. `console.warn` is not checked.

To run it locally:

```sh
cd frontend
npm ci            # first time, or after a dependency change
npm test          # every test, including the console guard
```

### Network setting

The app has one network setting, `src/config/network.ts`, fixed per build by
`VITE_NETWORK`. Two checks keep it that way, and the `network` job in
`.github/workflows/ci.yml` runs both on every pull request to `dev` and on
pushes to `dev` and `main`.

**No testnet outside the setting.** `npm run lint` fails on `networks.testnet`
(or any `…Networks.testnet` from a binding) and on a string or template literal
containing `testnet.stellar.org` or `stellar.expert/explorer/testnet`, anywhere
except `src/config/` and tests (`*.test.ts(x)` and `src/test/`). Read the
passphrase, RPC, contract ids and explorer from `NETWORK` instead. The rule is
`no-restricted-syntax` in `eslint.config.js`.

```sh
npm run lint                 # the whole app
npx eslint src/path/to/file  # one file
```

**The mainnet build.** `npm run check:mainnet-build` builds with
`VITE_NETWORK=mainnet` and placeholder, valid-format values for every mainnet
variable, into `dist-mainnet/` (git ignores it, and it leaves a testnet
`dist/` alone). It then fails if any account or contract id written in
`src/fixtures/` appears in the output, because sample data must not ship to
mainnet. A mainnet build drops it through `SAMPLES_IN_BUILD`
(`src/fixtures/inBuild.ts`), a build-time constant: a fixture export that holds
an id is written as `SAMPLES_IN_BUILD ? [...] : []`. A new one needs the same,
or this check names the id and the file it reached.

```sh
npm run check:mainnet-build            # build for mainnet, then check
bash scripts/check-mainnet-build.sh --no-build   # check an existing dist-mainnet/
```

### Test coverage

CI runs the suite with coverage and writes the totals and the ten
lowest-covered files to the job summary, whether the run passes or fails.
Every file under `src/` is counted, including ones no test imports, so an
untested screen shows up at 0% instead of being left out. Tests, `src/test/`,
`src/fixtures/` and `src/main.tsx` are excluded.

The build fails if statement, branch, function or line coverage falls below
the floors in `coverage.thresholds` in `vite.config.ts`. Each floor sits just
under the figure measured when it was set. If your change raises coverage,
raise the floors to match; do not lower them to get a PR through.

To run it locally:

```sh
npm run test:coverage                # prints a summary; fails below a floor
node scripts/coverage-summary.mjs    # the Markdown tables CI shows
```

`npm run test:coverage` writes its report to `coverage/`, which git ignores.

### Sample data

Every stand-in value on screen carries a "Sample data" tag, so a fixture is
never mistaken for a live figure. Stand-ins are `FIXTURE_*` exports, mostly in
`src/fixtures/`. CI fails if a component (any `.tsx` under `src/` other than
tests) imports a `FIXTURE_*` export and does not render the tag itself:

```tsx
<Badge tone="neutral">Sample data</Badge> Sample awards for the design phase.
```

The tag counts as JSX text or a string literal, not as a comment. Type-only
imports do not count as reads.

A few components may skip the tag, such as the landing page illustrations,
which never claim to show real figures. They are listed in
`scripts/sample-tag-allowlist.json`, and each entry needs a `reason`:

```json
{ "file": "src/components/landing/HeroDemo.tsx", "reason": "Landing illustration: ..." }
```

The check fails on an entry with no reason, and on one that is no longer
needed because the file now renders the tag, reads no fixture, or is gone.
Fix the component before you reach for the allowlist.

To run it locally:

```sh
npm run check:sample-tags   # the check CI runs
npm run test:sample-tags    # the check's own tests
```

The check only looks at the component that imports the fixture. A component
that gets fixture values through a hook or a prop has to tag them by hand,
and review is still what catches that.

The [testing guide](docs/testing-guide.md) covers mocking a contract client,
the no-network rule, and what the reachability check means when it fires.

## Use what is already here

`src/hooks/` covers reads, writes and wallet state, `src/components/state/` and
`src/components/ui/` cover loading, empty, error and every input, and `src/lib/`
covers amounts, dates, addresses and error messages. Use them rather than
writing a second version; `src/pages/ProgrammeDetail.tsx` shows the pattern end
to end.

## Styling
 
Use the tokens in `src/styles/tokens.css` for colour, spacing, type, radius and
elevation. No literal hex values or pixel spacing in new CSS.

### Design-system guard

CI scans every page and component CSS file (`src/pages/` and `src/components/`)
over whole files to prevent hard-coded colours or off-scale spacing from slipping in.
Colours must use design tokens from `src/styles/tokens.css` (or semantic variables
from `index.css`), and spacing properties must sit on the 4px scale.

If a genuine one-off value is strictly necessary (e.g. alignment centering or
visually-hidden clip margins), use the documented escape hatch above the declaration:

```css
/* design-system-guard: allow spacing */
margin: -1px;
```

To run the check locally:

```sh
npm run check:design-system                          # scans all page and component CSS files
node scripts/check-design-system.mjs --diff-base dev # scans only lines changed against dev
npm run test:design-system                           # runs the guard's own test suite
```


## Contract changes

If a feature needs a contract change, open the issue in
[milepost](https://github.com/milepost-labs/milepost/issues). This repository
only uses released bindings; to try the app against an unreleased change, see
"Against unreleased bindings" in the [README](README.md#running-it).

## Issues and pull requests

1. Comment on the issue before starting, so it can be assigned and nobody
   duplicates the work.
2. Fork the repository and branch from `dev`, named
   `<type>/<short-description>` — for example `feat/contribute-flow` or
   `fix/address-truncation`.
3. Write imperative commit subjects under 72 characters, with context in the
   body when it helps.
4. Open the PR against `dev`, link the issue with `Closes #<number>`, and show
   the change working: screenshots or a short clip for UI, test output for logic.

PRs are squash-merged, so the PR title and description become the commit on
`dev`, which is released to `main`.

## Security

Report vulnerabilities privately, as [SECURITY.md](SECURITY.md) describes, never
in a public issue.
