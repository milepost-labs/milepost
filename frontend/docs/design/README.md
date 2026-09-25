# Handoff: Milepost frontend rebuild

## Overview
A complete redesign of the Milepost frontend: the landing page (`/`) and every app route in `frontend/src/App.tsx`, plus one new route (`/funders/propose`) and one new screen (`/keepalive`). The goal is an app that is friendly to people who have never used crypto (plain language, passkey-first sign-in, no XLM needed) while staying honest about phase gating, advisory index data and protocol limits.

## About the design files
The files in this bundle are **design references built in HTML**. They show intended look, copy and behaviour. They are **not production code to copy**. Recreate them in the existing codebase: React 19 + TypeScript + Vite, react-router-dom 7, lucide-react, `@stellar/freighter-api`, `@milepost/*` bindings, and the existing UI kit, hooks and libs listed in the project brief.

Open any `.dc.html` file directly in a browser (keep `support.js` beside it). Routes in the app prototype are hash-based (`Milepost App.dc.html#/funders`); in the real app they are normal router paths. Append `?signedin=1` or `?theme=dark` to the app URL to open a signed-in or dark state directly.

## Fidelity
**High fidelity.** Colours, type, spacing, radii, copy and interaction states are final. Recreate them using the codebase's existing tokens and components (`src/styles/tokens.css`, `src/components/ui/*`). Where a value below has no token yet, add it to `tokens.css`; do not hard-code it in page CSS.

## Non-negotiables carried into the design (from the brief)
- **Phase gating with reasons.** Every unavailable action is rendered disabled with a sentence naming the phase it needs ("Available only while the programme is Open. This programme is Review.").
- **Every error through `explain()`.** The prototype has a small mirror of `errors.ts` (`static EXPLAIN` / `ATTEST_EXPLAIN` in `Milepost App.dc.html`). Replace with `explain(error, contract)`. Error panels show the human message, then "Nothing was transferred · program error N".
- **Index data is advisory.** Lists from the indexer are labelled so; anything acted on is re-read on-chain. Stale index (> `STALE_AFTER_MS`, 12 h) shows a visible warning banner.
- **No invented figures on "Live on testnet".** That landing section fetches `meta.json` and `programmes.json` live. It must stay that way.
- **Both themes, reduced motion, 360px, 44px tap targets, labels on every control, live regions for async results, `aria-hidden` on decorative shapes.**

## Stand-in data (FIXTURE_)
All stand-in data in the prototype lives as `static FIXTURE_*` fields at the top of the logic class in `Milepost App.dc.html` (and `FIXTURE_HERO_AWARD`, `FIXTURE_PATH_BUDGET` in `Milepost Home.dc.html`). Each is shaped like the read it stands in for, so swapping to the real call is a change of source. In the codebase, put these in a `fixtures/` module per feature and grep for `FIXTURE_`.

| Fixture | Stands in for | Real source |
|---|---|---|
| `FIXTURE_PROGRAMMES` | Extra programmes to judge layout | Remove; `programmes.json` |
| `FIXTURE_CHAIN`, `FIXTURE_CHAIN_DEFAULT` | Phase, mode, contributed, fee, awarded, released, refundable, quorum | `useProgramme` on-chain read |
| `FIXTURE_AWARDS` | Awards on sample programmes | `programmes/<id>/awards.json` (real shape: `{recipient, granted, released, tranches, tranchesReleased, payee, mode, updatedLedger}`) |
| `FIXTURE_VERIFIERS` | Programme verifier roster | Unwired (needs indexer handler) |
| `FIXTURE_ACCOUNT`, `FIXTURE_BALANCE` | Signed-in address, USDC balance | Wallet provider |
| `FIXTURE_CONTRIBUTIONS` | Funder's contributions | Per-address program reads |
| `FIXTURE_TX` | Receipt hash/ledger | `useTransaction` result |
| `FIXTURE_MY_AWARDS`, `FIXTURE_APPLICATIONS` | Recipient awards and applications | program reads + attest |
| `FIXTURE_STANDING` | Recipient standing aggregates | `record` contract |
| `FIXTURE_PAYEES` | Verified payees | Unwired |
| `FIXTURE_VERIFIER_QUEUE`, `FIXTURE_MY_ATTESTATIONS` | Verifier queue, own attestations | Unwired (currently browser storage in `VerifierDashboard.tsx`) |
| `FIXTURE_PROTOCOL_CONFIG` | Registry config | `registry` read |
| `FIXTURE_REVIEW_APPLICATIONS` | Applications + votes in review | program reads |
| `FIXTURE_SCHEMAS`, `FIXTURE_ATTESTATIONS` | Schemas, attestation lookup | `attest` reads |
| `FIXTURE_POLICY` | Spend policy state | `policy_spend` read |
| `FIXTURE_TTL` | Entry lifetimes for keepalive | TTL reads (`keepalive/`) |
| `FIXTURE_ADMIN_CONTACT` | Where proposals are sent | Deployment config (replace placeholder email and repo URL) |

Sample items are tagged in the UI with a dashed "Sample data" / "Sample chain read" pill. Remove the tag when the data is real.

## Design tokens
Map these onto the existing semantic aliases in `tokens.css` (`--accent`, `--accent-contrast`, `--danger`, `--success`, `--warning`, `--border`, `--surface`, `--surface-raised`). New aliases needed are marked *new*.

### Colour — light (`[data-theme='light']`, default)
| Token | Hex | Use |
|---|---|---|
| `--bg` *new* | `#f6f5f1` | Page ground |
| `--surface` | `#ffffff` | Cards, panels, nav pills |
| `--surface-raised` | `#eceae4` | Secondary buttons, inactive chips, tracks |
| `--text` | `#16191e` | Primary text; selected pill background |
| `--text-muted` | `#565c66` | Secondary text |
| `--accent` | `#4f55dc` | Primary buttons, released money |
| `--accent-strong` *new* | `#3a40c4` | Accent text, eyebrows, links hover |
| `--accent-contrast` | `#ffffff` | Text on accent |
| `--accent-soft` *new* | `#e6e7fc` | Selected option fill, unawarded budget, info notes |
| `--locked` *new* | `#b4b8bf` | Awarded-but-locked money |
| `--danger` / `--refund` | `#cf5a41` | Refundable money, errors |
| `--refund-soft` *new* | `#fbe6e0` | Error / cancelled panels |
| `--success` | `#23855a` | Settled phase, confirmations |
| `--success-soft` *new* | `#dcf1e6` | |
| `--warning` | `#9a6a00` | Review phase, stale index, low TTL |
| `--warning-soft` *new* | `#fbf0d4` | |

### Colour — dark (`[data-theme='dark']`)
`--bg #16191e`, `--surface #1f242b`, `--surface-raised #282e37`, `--text #edf0f3`, `--text-muted #a4aab4`, `--accent #7c82f7`, `--accent-strong #9ba1ff`, `--accent-contrast #0d0f13`, `--accent-soft rgba(124,130,247,.16)`, `--locked #4b525c`, `--refund #f0a08b`, `--refund-soft rgba(240,160,139,.14)`, `--success #6fd3a2`, `--success-soft rgba(111,211,162,.14)`, `--warning #f2c661`, `--warning-soft rgba(242,198,97,.14)`. Landing code block: `--code #16191e` / `#0f1216`, `--code-text #e6e8ec` / `#d8dce2`.

### Money colour language (use everywhere amounts are visualised)
- Unawarded budget → `--accent-soft`
- Awarded, locked until a milepost → `--locked`
- Released → `--accent`
- Refundable → `--refund`
Money is drawn as rows of small rounded squares (radius 2–5px, gap 3–6px), 20 or 40 per row, never as a gradient bar.

### Phase badge colours
Open: `--accent-soft` bg / `--accent-strong` text · Review: `--warning-soft` / `--warning` · Settled: `--success-soft` / `--success` · Cancelled: `--refund-soft` / `--refund`. Pill: 12px/700, padding 5px 10px, radius full.

### Typography
- UI: **Libre Franklin** 400/500/600/700/800.
- Numbers, addresses, ids, code: **IBM Plex Mono** 400/500/600 (`--font-numeric`). All amounts use it.
- H1 page: `clamp(30px, 4vw, 42px)`, 800, letter-spacing −0.03em. Landing hero H1: `clamp(38px, 6vw, 68px)`, 800, line-height 1.02, −0.035em, `text-wrap: balance`.
- H2 section (landing): `clamp(30px, 4vw, 44px)`, 800, line-height 1.08, −0.03em. Eyebrow above it: 13px/700 in `--accent-strong` (or `--refund` for "The problem").
- H2 panel: 18–20px/800. Card title: 16–18px/700–800.
- Body: 15–17px, line-height 1.5–1.6. Muted helper: 12–14px.
- Stat figure: IBM Plex Mono 24–32px/600.

### Spacing, radius, elevation
- Page max-width 1200px, side padding 24px, main top padding 32px, bottom 80px. Landing sections 72px vertical padding.
- Gaps in use: 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48 → map to the 4px `--space-*` scale.
- Radii: chips 8px; inputs and options 12px; list rows 14–16px; cards 18–20px; hero/major panels 22–24px; pills and buttons full (999px).
- **No borders or dividers.** Separation is by background step (`--bg` → `--surface` → `--surface-raised`) and space only. Selected options use `box-shadow: inset 0 0 0 2px var(--accent)`.
- Shadows only on floating layers: menus `0 12px 32px rgba(0,0,0,.18–.2)`; sign-in dialog `0 24px 60px rgba(0,0,0,.3)`; backdrop `rgba(10,12,16,.55)`.
- Focus: `outline: 2px solid var(--accent); outline-offset: 3px`.

### Controls
- Primary button: `--accent` bg, `--accent-contrast` text, 14–16px/700, padding 13–15px × 20–26px, radius full.
- Secondary: `--surface-raised` (or `--surface` on `--bg`) bg, `--text`.
- Disabled: `--surface-raised` bg, `--text-muted` text, the row at opacity .62 when the whole action is unavailable.
- Every tappable element min-height **44px**.
- Inputs: no border, `--bg` fill on a `--surface` card (or `--surface` on `--bg`), radius 12px, padding 12px 14px, min-height 44px. Amount inputs: IBM Plex Mono 22px/600 with a trailing "USDC" label. Invalid: `inset 0 0 0 2px var(--refund)` + message below in `--refund` 13px with `role="alert"`.
- Pending: four 12px squares pulsing (`opacity .25→1→.25`, 1.2s, 0.15s stagger). Disabled under `prefers-reduced-motion`.

## Global shell (app)
Sticky header, `--bg` with a 1px `--surface-raised` bottom shadow. Row: logo (three 9px squares: accent, accent, locked + "Milepost" 18px/800) · nav pills Programmes / Fund / Get funded / Verify / Admin (current pill `--surface`, others transparent + muted; on phones the pill row scrolls horizontally on its own line) · right group: "Testnet" dot, theme toggle (44px circle), account button.
- Signed out: account button = primary "Sign in" → opens **sign-in sheet**.
- Signed in: button shows short address on `--surface`; opens an account menu (address, "Signed in with Passkey · Testnet", My funding, My awards, Spend policy, Sign out in `--refund`).
- Every async result also goes to an `aria-live="polite"` line at the bottom of the screen.

### Sign-in sheet (modal dialog)
Centered card, max-width 440px, radius 24px. Title "Sign in", close button. Two options:
1. **Passkey** (selected-style, "Recommended" pill): "Face ID, fingerprint or device PIN. No seed phrase, nothing to install. Creates a smart wallet if you don't have one."
2. **Freighter**: "Browser extension wallet for Stellar."
Footer note: "Network fees are covered, so you won't need to hold XLM. Browsing never needs sign-in."
After choosing: waiting state with pulse, title "Confirm it's you" / "Approve in Freighter", then closes signed in. Esc and backdrop click close it.

## Screens

### 1. Home `/` — `Milepost Home.dc.html`
Header: logo, "Menu" dropdown (On this page: How it works, Modes, Roles, Developers · App: every route with its path), theme toggle, "Launch app" → `/directory`.
Sections in order:
1. **Hero** — two columns (auto-fit, min 420px). Left: testnet pill, H1 "Money moves at each milepost, and only at each milepost.", one-line mechanism, Launch app + "How it works ↓", "Browsing programmes needs no sign-in." Right: interactive demo card "Try it: one award, three tranches" — three tranche tiles (Released / Next: needs proof / Locked), condition + verifier rows, a dark button "Verifier confirms · release tranche N" that releases one tranche per press, live message below. Uses `FIXTURE_HERO_AWARD`.
2. **What brings you here?** — four role link cards (I want to fund → `/funders`, I need funding → `/recipients`, I confirm conditions → `/verifiers`, I run programmes → `/admin`).
3. **The problem** — "Most grant tools stop at selection." + three numbered questions.
4. **How it works** — tablist of seven steps (Contribute, Apply, Review, Finalize, Attest, Release, Spend); a square marker on the three where money moves. Panel: badge "Money moves" / "No money moves", step title, plain sentence, detail, Back / Next. Right: 20-square money grid + legend with amounts that recompute per step. Example budget 10,000 USDC.
5. **Why Stellar** — four cards: Cash out locally (anchors, SEP-24/31), No gas to buy (fee sponsorship), Sign in with a passkey, Spending rules in the wallet.
6. **Three modes** — three cards (Where the money goes / Who chooses the payee / Trade-off / Relies on). Allocated has a green inset ring + "Strongest guarantee". Note below on why Allocated beats Restricted.
7. **Verticals** — six-row table (Education, Health worker stipends, Agricultural inputs, Vocational training, Humanitarian cash, SME microgrants) × Verifier / Condition / Who gets paid. Example copy only.
8. **Roles** — four cards with links to every role route.
9. **Guarantees and limits** — two cards: Guaranteed (budget never exceeded, proportional refunds, portable standing) and Limits, stated (permissionless finalize ordering, advisory lists).
10. **Live on testnet** — fetches `meta.json` + `programmes.json`. Tiles: Programmes indexed, Index updated (`indexedAt`), Last ledger read (`indexedToLedger`), Event types not yet indexed (`Object.keys(unhandledEvents).length`). Programme rows: `name` + short id + "Phase read on-chain in app". Loading, error ("No figures are shown rather than guessed.") and stale banner states. Refresh button.
11. **For developers** — npm install line with Copy, doc links (README, CONTRIBUTING, glossary, end-to-end tutorial), five contracts + indexer list.
12. **Footer** — Repository, Security policy, Licence.

### 2. Programme directory `/directory`
H1 "Programmes", search (name or id), phase filter pills with counts (All/Open/Review/Settled/Cancelled), index line "N in the public index · updated X ago". Stale / error banners. Card grid (auto-fill, min 340px): name, short id, phase badge, status sentence per phase, 20-square money row, Budget / Awarded / Released, mode pill, CTA per phase (Fund or apply / Follow review / See releases / Claim refund). Loading skeletons, empty state with Clear filters. Footer note on advisory data. `/programme` with no id redirects here.

### 3. Programme detail `/programme/:id`
Back link; phase badge, mode pill; H1 name; id copy chip, creator, created ledger, on-chain read status. Phase stepper (Open / Review / Settled, current filled `--text`). Cancelled banner if cancelled. Two columns:
- Left: "Where the money is" (40 squares + four-line legend + contributed/fee/quorum), then tabs **Awards** (from awards.json; row = recipient, "1 of 3 tranches · X released", granted amount, tranche bar), **Verifiers**, **Terms** (asset, mode, quorum ≤16, median rule, refund rule, mode explanation, keepalive link).
- Right (sticky): "What you can do now" — Contribute, Apply, Finalize, Release, Claim refund, each with who, a button, and a reason line (`aria-describedby`). Signed-out prompt at top. Enabled actions route to the relevant dashboard with `?programme=<id>`.

### 4. Funding `/funders`
Propose-a-programme link card. Signed out: explainer + Sign in + Browse. Signed in: three stats (You've contributed, Programmes, Refundable now). Left: contribution cards (name, phase, amount, status note, Claim refund only when claimable). Right (sticky): **Contribute** 3-step flow — Amount (Open programmes only as radio options, amount with presets 100/500/1,000, balance, fee/budget/network-fee breakdown) → Confirm ("Checked on-chain just now: the programme is Open.", Confirm and sign) → pending → receipt (tx, ledger, what happens next) or error (explain(2) WrongPhase, Try again).

### 5. Propose a programme `/funders/propose` (new)
Only the registry admin can deploy. Four-step explainer strip. Form: name, what it pays for, condition per tranche, who could confirm (optional), mode (3 radios), planned amount (optional), tranches, contact. Review step shows a plain-text summary and three ways to send: **Email** (mailto to admin contact), **Open a GitHub issue** (pre-filled title/body, label `programme-proposal`), **Copy proposal**. The summary includes a link to `/admin?proposal=<base64 JSON>`; Deploy reads it and pre-fills name, mode and tranches, showing the proposer's details in a banner. Nothing is stored or sent on-chain.

### 6. Recipient `/recipients`, `/recipients/award-progress`, `/recipients/application-timeline`, `/recipients/standing`
Signed out: explainer. Signed in: section pills My awards / Apply / Applications / Standing (each its own route; `/recipients?programme=` opens Apply).
- **My awards**: per award — name, progress, mode pill; tranche tiles; states: proof received → "Release tranche" (pending → released; error explain(22)); waiting on verifier; Allocated → escrow amount, verified payee radio list, "Send to payee"; Restricted → policy note + link to `/policy`.
- **Apply**: Open programmes only; "How much do you need?" with the median explanation; submit → pending → done.
- **Applications**: timeline per application (Applied / Review "2 of 5 votes" / Award set = median / Tranches).
- **Standing**: aggregates only (programmes, total received, tranches delivered), TTL row with "Extend now" (warning fill under 30 days).

### 7. Verifier `/verifiers`
Signed out: explainer. Stats (waiting, signed, programmes). Queue cards: condition, programme · tranche, recipient chip; Review claim expands to schema/recipient/ledger, optional reference input, required checkbox "I checked this myself… can't be undone", Confirm and sign (disabled until ticked) → pending → moves to "Signed by you"; error explain attest 1. "Can't confirm" dismisses with no transaction. Right: signed attestations with "Used to release a tranche" / "Not used yet".

### 8. Attestation lookup `/attestations`
No sign-in. Search by id, recipient or verifier; sample id chips; result card (uid, status pill Valid / Used / Revoked, schema, attester, subject, ledger, data fields); not-found state mentions archived entries.

### 9. Spend policy `/policy`
Signed out prompt. Signed in: "No policy on this wallet" alert (Restricted = no restriction without it) with Set up policy → pending → installed. Checks list (signer installed, USDC only, verified payees only, cap). Cap bar with spent/left, allowed payees.

### 10. Admin `/admin`, `/finalize`, `/schemas/register`, `/admin/standing`, `/keepalive`
Section pills: Finalize awards / Deploy programme / Schemas / Standing / Keepalive.
- **Finalize**: note that anyone can finalize; programme select (Review first); non-Review shows the phase reason. Budget line + awarded/left bar; oversubscription warning about ordering. Rows: applicant, asked, "3 of 5 votes" + vote list, median, Finalize (disabled with "Needs N more votes"). Exceeding budget → explain(14).
- **Deploy**: pre-fill banner from proposal link; name, mode radios with trade-offs, quorum (1–16 validated), tranches, schema select; hint text; deploy → pending → done ("appears in the public index after the next indexer run"). Protocol config card (fee, treasury, attest, record, admin).
- **Schemas**: name (`lowercase-words/vN` validated), fields textarea, revocable checkbox; register → done; registered list.
- **Standing**: look up a recipient address → aggregates.
- **Keepalive** (new screen for `keepalive/`): programme select, rows for programme contract / awards / contributions / applications with days left, progress bar (warning under 30 days) and Extend; "Extend the N under 30 days".

### 11. Not found `*`
Card: three squares, "This page doesn't exist", route shown, Browse programmes + Home.

## Interactions & behaviour summary
- Navigation: router paths as listed; enabled actions deep-link with `?programme=<id>`.
- Transactions: every write goes idle → pending (pulse, `role="status"`) → success (receipt + live announcement) or error (`role="alert"`, explain() message, "Nothing was transferred · <contract> error N", retry).
- Validation is inline and immediate; submit buttons stay disabled until valid.
- Theme toggle switches `data-theme` on the root; persist it as ThemeProvider already does.
- Motion: background/width transitions .2–.4s; pulse animation; all disabled under `prefers-reduced-motion`.
- Responsive: all grids are `repeat(auto-fit|auto-fill, minmax(min(100%, Npx), 1fr))`; no horizontal overflow at 360px (checked); sticky side panels become part of the single column.

## State (per screen, from the prototype)
- Global: `theme`, `signedIn` (+ method), sign-in sheet step, account menu open, announce text.
- Directory: `phase` filter, `query`; index `{status, meta, list}`.
- Programme: `tab`; awards fetch per id.
- Fund: `{step: amount|confirm|pending|done|error, pid, amt}`; refunded ids.
- Recipient: release status per award, escrow payee pick/sent, apply `{pid, amt, step}`, standing kept.
- Verifier: queue item status, open item, checkbox, reference note, newly signed list.
- Admin: finalize status per applicant, selected programme; deploy form; schema form; lookup; TTL extended.
- Propose: form + step.
Use `useContractRead` / `useTransaction` / `useIndexedList` / `useProgramme` for the real versions.

## Assets
No images or icon files. The only graphics are CSS squares (logo, money grids, pulse). Use lucide-react for any icons you add, with `aria-hidden`. Fonts: Google Fonts Libre Franklin + IBM Plex Mono (self-host if the bundle budget allows; fonts don't count toward the JS budget).

## Files
- `screenshots/` — desktop captures of every screen: `home-*` (landing, section by section), `app-*` (signed-out states 01–07, signed-in states 10–21, one dark-theme example). Captures show the visible viewport only; open the HTML for full pages and interactions.
- `Milepost Home.dc.html` — landing page (all sections, live index fetch).
- `Milepost App.dc.html` — every app route; logic class at the bottom holds all `FIXTURE_*` data and per-screen view logic (`funderVals`, `recipientVals`, `verifierVals`, `adminVals`, `proposeVals`, `lookupVals`, `policyVals`).
- `Milepost Phone Check.dc.html` — all screens side by side at 360px.
- `reference/Milepost Rebuild Wireframes.dc.html` — the low-fi directions explored first (for context only).
- `support.js` — runtime needed to open the `.dc.html` files in a browser. Not part of the implementation.

## Suggested prompt for Claude Code
> Read `design_handoff_milepost_frontend/README.md` and open the HTML references. Rebuild `frontend/src` to match them using the existing UI kit, hooks, `tokens.css` and `errors.ts`. Put stand-in data in `fixtures/` modules named `FIXTURE_*`, shaped like the real reads. Start with tokens and the app shell, then Home, then routes in this order: directory, programme, funders, propose, recipients, verifiers, admin, attestations, policy, keepalive, not found. Keep within `bundle-budget.json`.
