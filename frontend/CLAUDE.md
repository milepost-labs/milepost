# Milepost frontend — project and design brief

Context for designing and building this app. Read it before changing the
interface. Everything here was checked against the contracts, the app and the
live index; where a number appears, it came from one of those and not from
memory.

---

## 1. What Milepost is

Conditional disbursement infrastructure on Stellar. A funder commits money to a
programme; recipients receive it in tranches that unlock only when a trusted
verifier attests that a condition was met; each release leaves behind a portable
record the next funder can underwrite against.

**Money moves at each milepost, and only at each milepost.**

The thing that makes it different from other grant tooling: most on-chain grant
tools stop at *selection*. They make the vote transparent, transfer a lump sum,
and end. Milepost is about everything after the transfer — did the money reach
the person, could they spend it on the thing it was for, and can anyone prove it
afterwards.

Education is the demo scenario, not the design. The contracts carry no domain
vocabulary: a *verifier* attests a *condition* about a *recipient*, and what
those mean is configured per programme. The same contracts serve health worker
stipends, agricultural inputs, vocational training, humanitarian cash and SME
microgrants.

**Design implication:** never let education vocabulary leak into shared
components. "School" and "tuition" belong in example copy only.

---

## 2. The protocol, in the detail the UI needs

Five Soroban contracts in `contracts/`, with TypeScript bindings in `packages/`
published to npm as `@milepost/*`.

| Contract | What it owns |
| --- | --- |
| `registry` | Deploys programmes; holds protocol config (treasury, fee, attest + record addresses). It is the admin of `record`, so a programme can write standing **because the registry deployed it** — never by asking. That is the whole trust chain. |
| `program` | One funding round: contributions, applications, review, awards, tranche release, refunds, sweep. |
| `attest` | General-purpose schema-based attestation registry. An *attester* makes a signed claim about a *subject* under a registered *schema*. Deliberately knows nothing about the rest of the protocol. |
| `record` | Recipient standing: portable, non-transferable aggregates of what someone has received and delivered across every programme. Counts and totals, never a list. |
| `policy_spend` | A policy signer for Stellar smart wallets. Limits a grant-funded signer to transfers of one asset, to verified payees, within a spending cap. |

### Phases

`Open` → `Review` → `Settled`, plus `Cancelled`.

Every action belongs to exactly one phase. Acting in the wrong phase returns
`WrongPhase` (error 2). **The UI must gate on phase and say why a thing is
unavailable, rather than letting a transaction fail.**

### The money path

1. **Contribute** — donors fund the programme. Budget is contributions less the
   protocol fee.
2. **Apply** — an applicant states a `requested` amount. This is the point of
   the design: one person needs 200 for exam fees, another 5,000 for tuition.
   Equal splits are not funding.
3. **Review** — each reviewer approves some amount **up to** `requested`.
   Approving more returns `ExceedsRequested` (11).
4. **Finalize** — the award is the **median** of reviewer votes. Not the minimum
   (one cautious reviewer dictates), not the mean (one outlier drags it). Needs
   `quorum` votes, which is capped at `MAX_QUORUM` (16).
5. **Attest** — a verifier signs a claim that a condition was met.
6. **Release** — one valid proof unlocks one tranche. Re-using it returns
   `AttestationAlreadyUsed` (22).
7. **Spend** — depending on mode, funds go to a verified payee, are directed by
   the recipient from escrow, or land in their own wallet behind a policy signer.

Unawarded budget is **refunded proportionally** to contributors once the release
window closes, then swept after a grace period.

### Modes — the core product idea, and worth designing carefully

| Mode | Where the money goes | Trade-off |
| --- | --- | --- |
| `Direct` | Straight to a verified payee chosen at award time. Recipient never holds it and never chooses. | Accountable but paternalistic. |
| `Allocated` | Held in escrow; the recipient picks which verified payee receives it and when. | Strongest guarantee, because it depends on nothing outside the contract. |
| `Restricted` | Recipient's own wallet, with a policy signer limiting asset, payees and cap. | Their key, their choice among verified payees, no route to a casino. Relies on the wallet being configured correctly. |

`Allocated` is stronger than `Restricted` precisely because a misconfigured
wallet quietly downgrades `Restricted` to no restriction at all. **Show this
distinction honestly; do not present them as equivalent.**

### Two limitations to surface, not hide

- **`finalize` is permissionless** on purpose, so no privileged party can strand
  an applicant by not pressing a button. Consequence: when a programme is
  oversubscribed, **whoever calls `finalize` first decides who gets funded**.
  The contract guarantees the budget is never exceeded (`InsufficientBudget`,
  14) but not fairness of ordering. This is documented, not a bug.
- **Published index lists are advisory.** Every entry must be re-checked
  on-chain before it is acted on.

### Error codes

`program` defines errors 1–30+, each with a specific meaning (`NotAuthorized` 1,
`WrongPhase` 2, `InvalidAmount` 3, … `PayeeNotVerified` 30). `frontend/src/lib/errors.ts`
maps them to human messages via `explain(error, contract)`. **Every failure path
must go through it.** A raw contract error reaching the user is a bug.

---

## 3. Where data comes from

Two sources, and the difference matters.

**On-chain reads** through the published bindings. Authoritative. Per-address
and per-key — the contracts deliberately keep **no lists**, because a growing
collection has unbounded write and archival cost.

**The indexer** (`milepost-indexer`, its own public repo) reads contract events
and publishes JSON lists, because the contracts keep none. It runs as a
scheduled GitHub Actions workflow and deploys to GitHub Pages.

- Base: `https://milepost-labs.github.io/milepost-indexer/v1`
  (override with `VITE_INDEXER_URL`)
- `meta.json`, `programmes.json`, `programmes/<id>/awards.json`
- `frontend/src/lib/indexer.ts` — `fetchMeta`, `fetchProgrammes`, `fetchAwards`,
  `isStale`, `STALE_AFTER_MS`
- **Data is treated as stale after 12 hours**, because GitHub starts scheduled
  runs hours late. Observed cadence is roughly every 3–5 hours. Never promise
  freshness in the UI.
- `meta.json` carries `unhandledEvents`, a count of event types the indexer does
  not yet handle. Currently 13.

**Design rule:** lists come from the index and are labelled advisory; anything a
user acts on is re-read on-chain first. A stale index must produce a visible
notice, not silently wrong numbers.

---

## 4. What already exists

React 19 + TypeScript + Vite. `react-router-dom` 7, `lucide-react` for icons,
`@stellar/freighter-api` for the wallet. Bindings installed from npm as
`@milepost/*` ^0.1.1.

### Routes (`src/App.tsx`)

```
/                              Home
/directory                     ProgrammeDirectory
/programme, /programme/:id     ProgrammeDetail
/funders                       FunderDashboard
/recipients                    RecipientDashboard
/recipients/standing           Standing
/recipients/award-progress     AwardProgress
/recipients/application-timeline  ApplicationTimeline
/verifiers                     VerifierDashboard
/finalize                      FinalizeAwards
/policy                        SpendPolicy
/admin                         RegistryAdmin
/admin/standing                AdminDashboard
/attestations                  AttestationLookup
/schemas/register              RegisterSchema
*                              NotFound
```

Providers wrap in this order: `ThemeProvider` → `WalletProvider` →
`SorobanProvider` → `ErrorBoundary` → `Router`.

### Building blocks — reuse these, do not reinvent

- **UI kit** (`src/components/ui/`): `Button`, `Card`, `Stat`, `Field`, `Badge`,
  `PhaseBadge`, `Table`, `Modal`, `Select`, `TextArea`, `RadioGroup`,
  `DateField`, `AddressChip`, `CopyButton`
- **Hooks** (`src/hooks/`): `useContractRead`, `useContractResult`,
  `useTransaction` (+ `phaseLabel`), `useProgramme`, `useIndexedList`
- **State** (`src/components/state/AsyncStates.tsx`): loading, empty and error
  presentation
- **Announcements** (`src/context/useAnnouncer.ts`): every async write is
  supposed to reach a screen reader at the moment pending becomes confirmed
  or fails, and a per-page live region is how that drifts. Call
  `const announce = useAnnouncer();` and then `announce('Contribution
  confirmed.')` (polite, the default) or `announce('Contribution failed.',
  'alert')` (assertive, for failures only). `AnnouncerProvider` is already
  mounted once in `Layout`, rendering the one shared line at the bottom of
  the screen — do not add another `aria-live` region per screen.
- **Libs** (`src/lib/`): `amount.ts` (stroop parsing and formatting),
  `format.ts`, `errors.ts`, `indexer.ts`, `registryVerification.ts`
- Feature areas already built: `admin/`, `funder/`, `policy/`, `programme/`,
  `keepalive/`

### Design tokens (`src/styles/tokens.css`)

Already defined, and the reason they exist is that every page CSS file was
inventing its own pixel values.

- **Spacing:** a 4px scale, `--space-1` (0.25rem) through `--space-8` (4rem).
  Anything off the scale is a mistake, not a nuance.
- **Type:** `--text-xs` … `--text-3xl` (0.75rem → 2.75rem), weights 400/500/600/700
- **Numeric font:** `--font-numeric` (IBM Plex Mono). Amounts are always
  compared vertically, so tabular figures matter more than it sounds.
- **Radius:** `--radius-sm|md|lg|full`
- **Elevation:** `--elevation-1|2|3`, redefined for dark
- **Semantic aliases:** `--accent`, `--accent-contrast`, `--danger`, `--success`,
  `--warning`, `--border`, `--border-strong`, `--surface`, `--surface-raised`.
  Components reference intent so a palette change lands in one place.
- Dark mode via `[data-theme='dark']`. Colour still lives in `index.css`.
- `prefers-reduced-motion` is already honoured. Keep it.

---

## 5. The landing page

The current `Home.tsx` is 210 lines with four sections (hero, "The Paradigm
Shift", "Protocol Mechanics", "Built for the Ecosystem"). It is too short and
too abstract. It should explain the protocol well enough that a funder,
a recipient, a verifier or a developer knows what this is and where to go.

Build these sections, in order:

1. **Hero** — the headline claim and the one-line mechanism. Primary CTA
   **Launch app**; secondary "How it works" scrolling down. Do not put a wall of
   text here.
2. **The problem** — grant tooling stops at selection. Name the three unanswered
   questions: did the money reach the person, could they spend it on the thing it
   was for, can anyone prove it afterwards.
3. **How it works** — the seven-step money path from §2 as a visual sequence.
   This is the most important section on the page. Show that money moves only at
   a milepost.
4. **Why Stellar** — anchors and SEP-24/SEP-31 off-ramps (without these the rest
   is theatre), fee sponsorship (recipients never hold XLM), passkey smart
   wallets (no seed phrase), policy signers.
5. **The three modes** — `Direct` / `Allocated` / `Restricted` compared, with the
   honest trade-off for each.
6. **One protocol, many verticals** — the table of six verticals with verifier,
   condition and who gets paid. Makes clear the contracts are domain-free.
7. **Roles** — four cards (Funder, Recipient, Verifier, Admin), each stating what
   that person does and linking to their entry route.
8. **Guarantees and limits** — budget never exceeded, permissionless finalize and
   the ordering consequence, proportional refunds, standing as portable
   underwriting, published lists advisory. Credibility comes from stating limits.
9. **Live on testnet** — real figures from `meta.json` and `programmes.json`, with
   the staleness notice. Never fabricate these.
10. **For developers** — five contracts, bindings on npm, the indexer, and links
    to `README.md`, `CONTRIBUTING.md`, `docs/glossary.md` and
    `docs/end-to-end-tutorial.md`.
11. **Footer** — repo, security policy, licence.

### Launch app

"Launch app" must not dead-end on a page that needs a wallet to show anything.

- Send it to `/directory`, which is meaningful without a wallet because it reads
  the published index.
- Offer a role chooser (in the hero or immediately after) routing to `/funders`,
  `/recipients`, `/verifiers`, `/admin`.
- Every role card and nav item must be reachable from the landing page. The
  current navbar exposes Directory, Programme, Funders, Recipients, Verifiers,
  Finalize, Policy, Admin — the landing page should not expose less.
- If a wallet is not connected, a role dashboard explains what connecting will
  show rather than rendering empty shells.

---

## 6. Non-negotiables

- **Stand-in data is expected right now — see §6a.** Design and layout come
  first; wiring to real reads happens after the wave.
- **Phase gating with reasons.** Disable an action and say which phase it needs.
- **Every error through `explain()`.**
- **Accessibility is not decoration.** Keyboard reachable, focus visible, labels
  on every control, live regions for async results, `aria-hidden` on decorative
  icons, works to 360px. There is an a11y check in CI.
- **Bundle budget.** `bundle-budget.json` sets a baseline of 869,340
  uncompressed JS bytes with 5% allowed growth. CI fails on regression. A
  heavy animation or chart library will break it — check before adding one.
- **Tokens only.** No new hard-coded pixel or colour values in page CSS.
- **Both themes.** Light and dark, every time.

### 6a. Stand-in data during the design phase

**This phase is about design and layout, not data correctness.** Several lists
are not wired to real reads yet, and that is fine: build the screens with
realistic stand-in data so the layout can be judged, and wire them up after the
wave. Currently unwired are recipient payees, a verifier's own attestations
(kept in browser storage in `VerifierDashboard.tsx`), a programme's verifier
roster, programme names, and the stale-index notice. Five of these depend on
indexer event handlers that do not exist yet, so they cannot be wired now even
in principle.

Two rules make that cheap to undo later:

1. **Mark every stand-in.** Put fixtures in one obvious place per feature and
   name them so they are greppable — `FIXTURE_`, or a `fixtures/` module. Do not
   scatter literals through JSX. One `grep` should find all of it.
2. **Shape stand-ins like the real thing.** Match the types the eventual read
   returns, so swapping in the real call is a change of source and not a
   rewrite of the component.

Two carve-outs, because they mislead rather than illustrate:

- **Do not fabricate the "Live on testnet" figures** in landing section 9. That
  section claims to show real chain state. Either read `meta.json` and
  `programmes.json`, which are live and working today, or drop the section until
  it can. The index already serves one real programme and its awards.
- **`PLACEHOLDER_HISTORY` in `Standing.tsx` is not stand-in data.** It is a
  textarea hint showing the expected JSON shape. Leave it alone.

### Commands

```sh
npm ci
npm run dev      # vite
npm run build    # tsc -b && vite build
npm run lint     # eslint, including React Compiler rules
npm run test     # vitest run
```

Against unreleased bindings, from the repository root:

```sh
./scripts/frontend-with-local-bindings.sh frontend
```

`npm ci` installs the published versions that `package.json` pins, so a contract
change is invisible here until it is released.

---

## 7. Repository context

The app lives here, in `milepost/frontend`, vendored into the monorepo for the
Drips Wave programme. Contracts are in `contracts/`, bindings in `packages/`.
The indexer is a separate public repository. `frontend/.github/` sits inert and
exists to make moving the app back out cheap — do not delete it.

Docs describe **one repository**. Do not mention the wave, the private repo or
the vendoring in anything user-facing.
