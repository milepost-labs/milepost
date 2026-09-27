# Frontend Architecture Guide

This guide explains how data flows through the Milepost frontend, which hooks to use, how writes work, and what the tests guard. It is the engineering map; `CLAUDE.md` is the design brief.

---

## Data sources

All reads come from one of two places:

| Source | What it provides | Freshness |
|---|---|---|
| **On-chain reads** (Soroban RPC via `@milepost/*` bindings) | Per-address, per-key contract state | Real-time |
| **Indexer** (`milepost-indexer`, deployed to GitHub Pages) | Lists of programmes, awards, meta stats | Updated every ~3–5 hours; stale after 12 hours |

**Design rule:** lists come from the index and are labelled advisory. Anything a user acts on is re-read on-chain first. A stale index produces a visible notice.

- Indexer base URL: `https://milepost-labs.github.io/milepost-indexer/v1` (override with `VITE_INDEXER_URL`)
- Files: `meta.json`, `programmes.json`, `programmes/<id>/awards.json`
- Helper: `src/lib/indexer.ts` — `fetchMeta`, `fetchProgrammes`, `fetchAwards`, `isStale`, `STALE_AFTER_MS`

---

## Hooks

All hooks live in `src/hooks/`. Each serves a specific read pattern:

### `useContractRead<T>(call, options?)`

The primary read hook. Wraps a single Soroban RPC simulation call with loading/fetching states, stale-response protection, and abort-signal semantics.

```ts
const { data, error, loading, fetching, refetch } = useContractRead(
  () => programClient.get_award({ award_id }),
  { contract: 'program' }
);
```

- `loading` — true only on the first load; a refetch keeps existing data visible
- `fetching` — true while any request is in flight (including background refresh)
- `contract` — which contract's error table explains failures (for `explain()`)
- `enabled` — skip the call (for reads that need a connected wallet or chosen id)

**Use when:** you need one piece of state from one contract call.

### `useContractResult<T>(call, options?)`

Same as `useContractRead` but returns `data: T | null` without the `ContractRead` wrapper — a convenience alias.

### `useIndexedList<T>(fetcher, options?)`

Fetches a list from the indexer with stale-data detection and automatic refetch.

```ts
const { data, loading, error, isStale, refetch } = useIndexedList(
  () => fetchProgrammes(),
  { staleAfterMs: STALE_AFTER_MS }
);
```

- `isStale` — true if the data is older than the stale threshold
- Lists are labelled "advisory" in the UI — any action must re-read on-chain

**Use when:** you need a list of programmes, awards, or other index-served data.

### `useProgramme(id)`

Fetches a programme's on-chain state by ID. Combines `useContractRead` with the programme client.

```ts
const { data: programme, loading, error } = useProgramme(programmeId);
```

**Use when:** you need a single programme's full state for a detail page.

### `useTransaction(txn, options?)`

Tracks a Stellar transaction through its lifecycle: pending → confirmed or failed.

```ts
const { state, phase } = useTransaction(txnHash, {
  onConfirmed: () => refetch(),
  onError: (err) => announce('Transaction failed', 'alert'),
});
```

- `state` — `TransactionState` enum: `idle | pending | confirmed | failed`
- `phase` — `TransactionPhase` enum: `submitting | awaiting | confirming | done | error`
- `phaseLabel(phase)` — human-readable label for the current phase

**Use when:** you've submitted a transaction and need to show its progress.

### `useAnnounceTransaction()`

Returns an `announce` function for screen-reader announcements. Wraps `useAnnouncer` with transaction-specific context.

---

## Write path

All writes follow the same pattern:

1. **Build the transaction** using the `@milepost/*` client's method
2. **Sign and submit** via Freighter (`@stellar/freighter-api`)
3. **Track** with `useTransaction` for loading/confirmation states
4. **Announce** the result via `useAnnouncer` for screen readers
5. **Refetch** affected reads to update the UI

Example from `FundingPage.tsx`:

```ts
const { announce } = useAnnouncer();
const tx = useTransaction(null, {
  onConfirmed: () => { refetchProgramme(); announce('Contribution confirmed.'); },
  onError: (err) => announce('Contribution failed.', 'alert'),
});

async function handleContribute() {
  const built = await programClient.build_contribute({ ... });
  const signed = await signTransaction(built, { networkPassphrase });
  const result = await submitTransaction(signed);
  tx.setHash(result.hash);
}
```

---

## State components

`src/components/state/AsyncStates.tsx` provides three presentation components:

- `<LoadingState />` — spinner with optional message
- `<EmptyState message />` — "nothing here yet" message
- `<ErrorState error />` — error display with retry button (uses `explain()`)

**Use these everywhere** instead of ad-hoc loading/error/empty states.

---

## Routing

Routes are defined in `src/routes.ts` and rendered in `src/App.tsx`.

| Route | Page | Auth required |
|---|---|---|
| `/` | Home | No |
| `/directory` | ProgrammeDirectory | No |
| `/programme/:id` | ProgrammeDetail | No |
| `/funders` | FunderDashboard | Yes |
| `/recipients` | RecipientDashboard | Yes |
| `/recipients/standing` | Standing | Yes |
| `/recipients/award-progress` | AwardProgress | Yes |
| `/verifiers` | VerifierDashboard | Yes |
| `/finalize` | FinalizeAwards | Yes |
| `/policy` | SpendPolicy | Yes |
| `/admin` | RegistryAdmin | Yes (admin) |
| `/attestations` | AttestationLookup | Yes |
| `/schemas/register` | RegisterSchema | Yes (admin) |
| `/admin/payees` | PayeeManagement | Yes (admin) |
| `/keepalive` | Keepalive | Yes |

Providers wrap in order: `ThemeProvider` → `WalletProvider` → `SorobanProvider` → `ErrorBoundary` → `Router`.

---

## Adding a new screen (worked example)

1. Create `src/pages/MyPage.tsx` and `src/pages/MyPage.css`
2. Add the route to `src/routes.ts`
3. Use hooks for data: `useContractRead` for single reads, `useIndexedList` for lists
4. Use `AsyncStates` for loading/error/empty states
5. Use `useTransaction` + `useAnnouncer` for any write operations
6. Gate actions on phase — disable buttons and explain why when the wrong phase
7. Add tests in `src/pages/MyPage.test.tsx`

---

## Tests

Tests live alongside their source files as `*.test.ts` or `*.test.tsx`. Run with:

```sh
npm run test     # vitest run
npm run test:ui  # vitest with UI
```

Key test files:
- `src/hooks/useContractRead.test.ts` — hook read logic
- `src/hooks/useIndexedList.test.ts` — index list fetching
- `src/hooks/useTransaction.test.ts` — transaction lifecycle
- `src/pages/*.test.tsx` — page-level component tests
- `src/routes.test.ts` — route configuration

---

## Linked from

- [README.md](../README.md)
- [CLAUDE.md](./CLAUDE.md) (design brief)
