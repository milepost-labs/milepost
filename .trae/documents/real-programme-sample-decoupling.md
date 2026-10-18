# Real programme vs sample: decouple the "sample" decision

## Summary

The seeded demo programme `CD6X33…XT67C6` (the default at `/programme`, a real
registry-deployed contract) is currently treated as a **sample**. The cause is
not the fixtures: it is that [`ProgrammeDetail.tsx`](file:///home/dp/Documents/milepost/frontend/src/pages/ProgrammeDetail.tsx#L721)
passes `isSample={isDefault}`, and `isDefault` is true whenever no `programme`
query param is present. As a result the Awards tab renders `FIXTURE_AWARDS`
(4 awards ≈ 36,000 XLM) with `useIndexedList` disabled, instead of the index's
two awards (≈ 380 XLM), on a programme whose on-chain budget is ~975 XLM.

Fix: make "is this a sample" a single, shared decision driven by **fixture
membership**, and make that decision **unable to claim a real contract id** even
if a fixture ever lists one. Then the demo programme is never a sample and its
awards come from the index; the true fixture programmes keep their "Sample data"
treatment untouched.

User decisions (from clarification):
- The current working tree is truth: `FIXTURE_PROGRAMMES` does **not** contain
  `CD6X33…`; do not add it. Add the guard + an enforcement test instead.
- Scope is the **programme detail page**. The directory card keeps its honest
  "Sample chain read" label because the directory performs no chain reads and
  its figures genuinely are fixtures (see CLAUDE.md §6a).

## Current State Analysis

- Sample-ness of a programme is decided in three unconnected places:
  - [`useProgrammeParam.ts`](file:///home/dp/Documents/milepost/frontend/src/hooks/useProgrammeParam.ts#L56-L58) — local `isSampleProgramme(value)` = id is in
    `FIXTURE_PROGRAMMES`.
  - [`programmeView.ts`](file:///home/dp/Documents/milepost/frontend/src/lib/programmeView.ts#L74-L86) — `mergeProgrammes` hard-codes `sample: true`
    for every fixture entry (index entries get `sample: false`).
  - [`ProgrammeDetail.tsx`](file:///home/dp/Documents/milepost/frontend/src/pages/ProgrammeDetail.tsx#L721) — `isSample={isDefault}`, unrelated to fixtures.
- [`AwardsTab.tsx`](file:///home/dp/Documents/milepost/frontend/src/components/programme/AwardsTab.tsx#L48-L65) takes `isSample` as a prop and, when true, disables
  the index fetch and returns `FIXTURE_AWARDS` (for `phase === 'Settled'`).
- Fixture ids (e.g. `CBQ4SCHOOLBURSARY2026XK3ZP7M2QWJ5T8VN4RD6HY`) are **not**
  contract-shaped: [`isProgrammeContractId`](file:///home/dp/Documents/milepost/frontend/src/lib/registryVerification.ts#L7-L11) requires `^C[A-Z2-7]{55}$`,
  while fixture ids are shorter and contain `0`. So fixture ids already cannot be
  real contracts — but nothing enforces that.
- `FIXTURE_AWARDS` lives in [`programmeFixtures.ts`](file:///home/dp/Documents/milepost/frontend/src/fixtures/programmeFixtures.ts#L30-L71).
- Tokens already provide what the a11y criteria need: `--tap-min: 44px`
  ([tokens.css](file:///home/dp/Documents/milepost/frontend/src/styles/tokens.css#L36)) and a global
  visible focus ring ([tokens.css](file:///home/dp/Documents/milepost/frontend/src/styles/tokens.css#L256-L264)).
  The one gap is the Awards "Download CSV" button, which uses
  `size="sm"` → `min-height: 36px` ([ui.css](file:///home/dp/Documents/milepost/frontend/src/components/ui/ui.css#L18)).

## Proposed Changes

### 1. `frontend/src/lib/programmeView.ts` — single, guarded sample decision

- Add (new export, near the top of the file):
  ```ts
  import { isProgrammeContractId } from './registryVerification';

  /**
   * A programme is a sample only when its id is listed in the fixture set AND
   * is not a real contract id. The second condition is the guard: a fixture can
   * never claim a registry-deployed programme, even if someone adds its id to
   * FIXTURE_PROGRAMMES by mistake.
   */
  export function isSampleProgrammeId(id: string): boolean {
    return !isProgrammeContractId(id) && FIXTURE_PROGRAMMES.some((p) => p.id === id);
  }
  ```
- In `mergeProgrammes`, replace the fixture loop's `sample: true` with
  `sample: isSampleProgrammeId(entry.id)` so the guard also protects the
  directory's `sample` flag. (Index entries stay `sample: false`, unchanged.)
- Update the `DirectoryProgramme.sample` doc comment to reference
  `isSampleProgrammeId`.

Why: this is "the isSample decision in programmeView.ts" the brief names, and it
makes the decision impossible to get wrong at any call site.

### 2. `frontend/src/hooks/useProgrammeParam.ts` — reuse the shared decision

- Delete the local `isSampleProgramme` function (lines 51–58) and its
  `FIXTURE_PROGRAMMES` import.
- Import `isSampleProgrammeId` from `'../lib/programmeView'` and use it in place
  of `isSampleProgramme` (line 68).

Why: removes the duplicate definition so the guard applies on the `?programme=`
route too. Behaviour is unchanged for today's ids (fixtures stay samples,
`CD6X33…` keeps going through registry verification).

### 3. `frontend/src/pages/ProgrammeDetail.tsx` — stop equating "default" with "sample"

- Import `isSampleProgrammeId` from `'../lib/programmeView'`.
- Line 721: change `isSample={isDefault}` → `isSample={isSampleProgrammeId(programmeId)}`.
- Leave the `isDefault` hint (lines 604–610) as-is; it still correctly tells the
  user they are on the seeded programme.

Why: this is the root cause. With it, the demo programme's Awards tab calls
`fetchAwards('CD6X33…')` and shows the index's real awards.

### 4. `frontend/src/components/programme/AwardsTab.tsx` — guard the prop, fix tap target

- Import `isSampleProgrammeId` from `'../../lib/programmeView'`.
- Compute the effective decision once and use it everywhere `isSample` is used
  today (the `useIndexedList` `enabled` gate, the `awards` `useMemo`, the
  `advisoryNote` string):
  ```ts
  const sample = isSample && isSampleProgrammeId(programmeId);
  ```
  Replace the three `isSample` reads with `sample` (add `sample` where needed to
  the `useMemo` deps).
- Change the "Download CSV" `Button` from `size="sm"` to the default `size`
  (`md`) so its tap target is `--tap-min` (44px). No new CSS values.

Why: even if a caller mislabels a real id as a sample, the tab still reads the
index; and the only interactive control in this feature meets the 44px rule.

### 5. `frontend/src/fixtures/programmes.ts` — document the invariant

- Extend the module doc comment to state that fixture ids are deliberate
  stand-ins which must **never** match a Stellar contract id, and point at
  `isSampleProgrammeId` / the test that enforces it. No data changes.

### 6. Tests

- `frontend/src/lib/programmeView.test.ts` (extend):
  - Import `isProgrammeContractId` and `DEMO_PROGRAMME_ID`.
  - `isSampleProgrammeId`: returns `false` for `DEMO_PROGRAMME_ID` (contract
    shaped) and for an arbitrary `C${'A'.repeat(55)}`; returns `true` for every
    `FIXTURE_PROGRAMMES` id.
  - Guard: `FIXTURE_PROGRAMMES.every((p) => !isProgrammeContractId(p.id))` is
    `true` — "no fixture id is a real deployed contract".
- `frontend/src/components/programme/ProgrammePanels.test.tsx` (extend the
  existing AwardsTab describe; the file already mocks `useIndexedList`):
  - **Demo programme is not a sample**: render `<AwardsTab programmeId={DEMO_PROGRAMME_ID} phase="Settled" isSample />`
    (deliberately passing the old buggy prop) with the mock returning two
    index-shaped awards; assert those render, that `FIXTURE_AWARDS`'s
    `GBB4Q2…8T19` recipient does **not**, and that the advisory note is the
    index version (`/From the public index \(awards\.json\), advisory/`).
  - **True sample keeps fixture data**: render
    `<AwardsTab programmeId={FIXTURE_PROGRAMMES[0].id} phase="Settled" isSample />`
    and assert the sample advisory note
    (`/Awards are the median of reviewer votes/`) and a `FIXTURE_AWARDS`
    recipient render.

## Assumptions & Decisions

- `CD6X33…` is not and will not be added to the fixtures (current tree is truth);
  the `isDefault` bug is the actual cause of the reported symptom.
- Directory card stays unchanged (user-selected "detail page only"): real index
  entries keep `sample: false` and therefore the "Sample chain read" label, since
  their chain figures are still fixtures per CLAUDE.md §6a.
- `isSampleProgrammeId` lives in `programmeView.ts` (the file named by the
  brief). It only needs `isProgrammeContractId`, whose `components/ui` import is
  type-only, so there is no runtime import cycle.
- No `npm run test` / `npm run build` will be executed as part of implementation
  (per the request); tests are authored but not run.
- Any value the change needs already exists as a token (`--tap-min`,
  `--text-caption`, spacing/radius tokens). No new hard-coded pixel/colour values
  are introduced; nothing new is added to `tokens.css`.

## Verification

Static (author only, do not run):
- `npm run lint`, `npm run build`, `npm run test` in `frontend/` are the stated
  gates; the change is expected to leave them green.

Manual/structural checks against the acceptance criteria:
1. `/programme` (demo, no param) → Awards tab fetches
   `.../programmes/CD6X33…/awards.json`, shows the index's two awards and the
   on-chain stat figures, and shows the index advisory note (no fixture awards).
   A fixture programme still shows `FIXTURE_AWARDS` and the sample note.
2. `isSampleProgrammeId` returns `false` for any contract-shaped id, and the
   fixture test asserts no `FIXTURE_PROGRAMMES` id matches `isProgrammeContractId`.
3. Tests added for the demo programme and a true sample pass.
4. AwardsTab uses only tokens; light/dark inherited; layout uses
   `minmax(0, 1fr)` + `overflow-wrap: anywhere` and the 480px media query, so it
   holds to 360px with no horizontal scroll.
5. Tabs are keyboard reachable with `--tap-min` height; the CSV button is now
   44px; the global focus ring from `tokens.css` applies.
6. No new hard-coded values; `tokens.css` unchanged.
