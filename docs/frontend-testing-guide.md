# Frontend testing guide

How the frontend test suite works, and the rules that keep it honest. This is
not a general introduction to frontend testing — it is what actually matters in
this repository, and what has gone wrong when contributors skipped it.

## Run the tests

From `frontend/`:

```sh
npm test        # vitest run
npm run lint    # eslint, including React Compiler rules
npm run build   # tsc -b && vite build
```

Vitest runs in **jsdom** with the setup in `src/test/setup.ts` and
`restoreMocks: true` (see `vite.config.ts`), so every mock is reset between
tests and `cleanup()` unmounts what each test rendered.

## The no-network rule

**Tests must never reach the network.** The contract clients are mocked in
every test; a test that performs a real call will fail *intermittently* rather
than honestly — it depends on RPC latency and testnet state, which are exactly
the things a unit test must not depend on. A test that needs data gives its
mock a value; it never asks a real contract for one.

This is why the suite exists at all: the tests are what prove the read and
write hooks race-safe without a network. `restoreMocks` will not save you from
yourself — it only restores `vi.fn` state, it does not replace a call that was
never mocked.

## Mocking a contract client

The generated clients in `packages/` are plain objects, so a test supplies its
own response with a mock. A worked example from
[`useContractRead.test.ts`](../frontend/src/hooks/useContractRead.test.ts) —
a read returning a value:

```ts
const call = vi.fn().mockResolvedValue({ result: 42 });
const { result } = renderHook(() => useContractRead(call, []));
await waitFor(() => expect(result.current.data).toBe(42));
```

A read the bindings wrap in a `Result` uses `useContractResult`, so the mock
must supply the `unwrap`:

```ts
const call = vi.fn().mockResolvedValue({
  result: { unwrap: () => 'inside' },
});
```

For a write, `useTransaction` is the only path, and its mock supplies a
`signAndSend`:

```ts
await act(async () => {
  await result.current.send(async () => ({
    signAndSend: vi.fn().mockResolvedValue({ result: 'award-1' }),
  }));
});
```

To control when a promise settles — the pattern every race test needs — use a
deferred:

```ts
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}
```

To mock a module the component imports (wallet, router), use `vi.hoisted` so
the mock exists before the import runs:

```ts
const { useWallet } = vi.hoisted(() => ({ useWallet: vi.fn() }));
vi.mock('../context/useWallet', () => ({ useWallet }));
```

The wallet mock in `useTransaction.test.ts` is the worked example of the full
pattern, including the connected/declined cases.

## The reachability check

`src/test/reachable.test.ts` walks the import graph from `main.tsx` and fails
on any module nothing imports. If this test names your file, it is not a bug in
the test — it is telling you the component is **unreachable**: it compiles,
lints and passes its own tests while the bundler drops it and no user can reach
it. That has happened repeatedly here: three pages merged unreachable, then
four policy and admin components, then one more.

To satisfy it properly, add a route in `App.tsx` or render the component from
something already reachable. Do not add your file to `ALLOWED_UNREACHABLE` —
every entry there is a module the check can no longer protect.

## What is worth testing

The behaviours the suite is built to lock down are the ones that are invisible
until they break — not "does the screen render", which the reachability check
and the type-checker already cover:

- **Stale responses.** A slow read landing after a newer one must not
  overwrite it. `useContractRead.test.ts` resolves the second call first and
  asserts the older response is ignored.
- **Double submission.** A duplicated contribution is real money.
  `useTransaction.test.ts` fires a second `send` while the first is in flight
  and asserts the build ran once.
- **Declined signatures.** A signer saying no is a choice, not a failure.
  The same file asserts the phase returns to `idle` rather than showing an
  error banner.

Page tests (`src/pages/*.test.tsx`) show the component-level patterns — how to
render a page with mocked hooks and assert on the visible result.

## What is out of scope

Contract testing is a separate guide ([testing guide](../docs/testing-guide.md)).
End-to-end browser testing does not exist here, and there is no intention of
adding it — the no-network rule is what makes the suite deterministic, and e2e
tests would reintroduce exactly the flakiness it removes.
