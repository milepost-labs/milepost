# Milepost frontend

React 19 + TypeScript + Vite. Talks to the Soroban contracts through the
generated bindings in [`packages/`](../packages).

## Running it

```sh
# packages/*/dist is gitignored, so the bindings must be built first or
# every import of @milepost/* fails on a missing module rather than on
# anything real.
for p in attest policy-spend program record registry; do
  npm ci --prefix "../packages/$p" && npm run build --prefix "../packages/$p"
done

npm ci
npm run dev
```

```sh
npm run build   # tsc -b && vite build
npm run lint    # eslint, including React Compiler rules
npm test        # vitest
```

Node 24. ESLint 10 requires `^20.19 || ^22.13 || >=24`.

The React Compiler lint rules are **on**, and they are not cosmetic — they catch
render-purity and cascading-setState bugs that type-check cleanly and misbehave
at runtime. Fix them rather than suppressing them.

## Contract data model

[`docs/frontend-integration.md`](../docs/frontend-integration.md) covers what the
protocol does, the deployed testnet addresses, the phase and mode enums, and
which reads back which screen. Read it if you are wiring a new contract call.

---

## Foundation — use these, do not rebuild them

The shared frontend foundation exists. A PR that reimplements any of it will be
asked to use the existing version instead, so please start here.

**Hooks** — `src/hooks/`

- `useProgramme()` — the programme address from the route, with a fallback to the
  seeded testnet programme. Never hardcode a contract id.
- `useContractRead(call, deps)` — reads returning a value directly:
  `total_contributed`, `total_released`, `allocation_of`, `is_payee`.
- `useContractResult(call, deps)` — reads the bindings wrap in a `Result`, because
  the Rust function is fallible: `budget`, `get_phase`, `get_award`,
  `get_application`, `get_config`. Using the wrong one is a compile error, not a
  runtime one.
- `useTransaction()` — **every** write. Handles no-wallet, wrong-network,
  build-and-simulate, sign, submit, and guards double submission. Do not call
  `signAndSend` yourself. `phaseLabel(phase)` gives the human string.

**Async states** — `src/components/state/AsyncStates.tsx`

- `<AsyncView {...read} onRetry={read.refetch}>{(data) => …}</AsyncView>` resolves
  loading, empty and error in one place. Contract errors that are really normal
  answers — `NothingToRefund`, `AwardNotFound` — render as empty states rather
  than failures.
- `<Success>` and `<TransactionOutcome>` — confirmation after a write.
  `TransactionOutcome` takes `useTransaction()`'s state directly, so a write
  screen wires one component instead of three conditionals it must keep
  consistent. A transaction that succeeds silently is indistinguishable from one
  that did nothing.

**UI primitives** — `src/components/ui/`

`Button`, `Card`, `Stat`, `Field`, `Badge`, `PhaseBadge`, `Table`, `Modal`, and
from `Inputs.tsx`: `Select`, `TextArea`, `RadioGroup`, `DateField`.

- `Button` has a `loading` prop that also disables it.
- `Table` stacks into cards on narrow screens. `Modal` traps and restores focus.
- `DateField` takes and returns **Unix seconds**, converting to `datetime-local`
  internally. Do not hand-roll that conversion — `toISOString()` shifts by the
  timezone offset and the bug is invisible until someone in another timezone
  uses it.
- `RadioGroup` options carry an optional `description`, for choices where a label
  cannot carry the meaning.

**Utilities** — `src/lib/`

- `formatAmount`, `formatExact`, `parseAmount`, `tryParseAmount`, `percentOf`
  from `lib/amount` — amounts are `i128` stroops arriving as `bigint`. **Never**
  convert through `Number`; it loses precision above 2^53 and the failure is
  silent.
- `formatDate`, `formatDateTime`, `timeUntil`, `hasPassed`, `truncateAddress`,
  `looksLikeAddress` from `lib/format` — deadlines are Unix **seconds**, not
  milliseconds. `truncateAddress` keeps both ends, because a prefix alone is how
  people send money to the wrong account.
- `explain(error, contract)` from `lib/errors` — turns any contract error into a
  message a person can act on, with a `kind` that decides how it should be shown.

**Wallet** — `src/context/useWallet.ts`

`useWallet()` gives `address`, `status`, `network`, `networkError` and
`signTransaction`.

**Styling** — `src/styles/tokens.css`

Spacing, type scale, radius, elevation and colour tokens. No literal hex values
or pixel spacing in new CSS.

`src/pages/ProgrammeDetail.tsx` and `src/pages/FunderDashboard.tsx` show the
whole pattern working together if you want a worked example.
