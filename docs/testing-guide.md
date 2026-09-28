# Testing guide for contributors

How contract tests in this repository actually work, and the traps that have
already cost review rounds. This is not a general introduction to Rust testing —
it records what goes wrong here, drawn from real cases.

## The build ordering rule: wasm before clippy and tests

Two suites instantiate the programme from its built artifact — `registry`'s, and
the integration crate's:

```rust
soroban_sdk::contractimport!(file = "../../target/wasm32v1-none/release/milepost_program.wasm");
```

That file does not exist on a fresh checkout. Running `cargo test --workspace`
(or `cargo clippy --all-targets`) before building it fails with errors that look
like unrelated logic errors — and if a stale artifact from an earlier build is
present, the tests silently exercise the *old* contract. Both failures are the
same root cause: the wasm build must come first.

The exact order CI runs, in CI and locally:

```sh
cargo build --target wasm32v1-none --release
cargo fmt --all --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-features
```

`just test` and `just lint` encode this ordering for you; use them if you do not
want to think about it.

## Which suite a test belongs in

A contract's own suite tests that contract, with its neighbours replaced by
whatever is convenient: `program`'s suite registers a `FakePolicy`, because all a
programme asks of a policy is whether one is installed. That is the right way to
write a unit test, and it is also why a claim about the *arrangement* has nowhere
to live there.

A claim that only becomes true when several real contracts are deployed the way a
deployment deploys them belongs in `crates/integration`. It has no doubles: real
`attest`, `record`, `registry` and `policy-spend`, and programmes instantiated from
the built wasm through the registry. Money reaching a treasury, standing
accumulating across two programmes, a programme the registry never deployed being
unable to pay — none of those is a property of one contract.

That crate is behind a `testutils` feature, because `cargo build --target
wasm32v1-none --release` walks every workspace member and a crate built on the
SDK's test utilities cannot be built for a contract. So it needs `--all-features`,
which the gate above already passes: plain `cargo test` reports nothing from
`milepost-integration` rather than failing, and that is expected.

## Regenerate bindings after any interface change

Changing a contract's public interface — function signatures, error enums,
types — and not regenerating the TypeScript bindings is invisible until
runtime. The bindings in `packages/` are checked in, and a stale one compiles
fine; the frontend only finds out a transaction is malformed after it is
submitted.

After any interface change:

```sh
cargo build --target wasm32v1-none --release
./scripts/check-bindings.sh
```

If the check reports drift, regenerate and commit the result:

```sh
./scripts/generate-bindings.sh
```

Never regenerate bindings directly with `stellar contract bindings typescript
--wasm ... --overwrite` into `packages/` — that drops each singleton's deployed
address from `networks.testnet` and wipes the rest of the package directory. Use
the script.

## Generated files: which are committed and which are ignored, and why

- `test_snapshots/` is **generated and gitignored**. Soroban writes a
  ledger-state JSON per test run; they regenerate on every `cargo test`, and one
  parameterised test can emit hundreds. Tracking them would mean constant churn
  for no review value. Never commit them.
- `proptest-regressions/` is **generated and committed**. It records the seeds
  for cases proptest has already found, so those cases are re-run before any
  novel ones on every machine. Deleting or ignoring it discards that history and
  lets old bugs regress silently.

The two differ because their contents differ: a snapshot is disposable output,
a regression seed is a memory of a failure.

## The shared fixture: add a helper, do not change the default

`crates/test-utils/src/lib.rs` exists because every suite used to declare its
own copy of the deadline schedule and the environment setup, and a config change
meant editing several near-identical fixtures. Its `schedule` constants
(`APPLY_DEADLINE`, `REVIEW_DEADLINE`, `RELEASE_DEADLINE`, `SWEEP_DEADLINE`,
`FEE_BPS`) are imported by the programme and registry suites alike.

That is exactly why changing a shared default is dangerous: one PR changed a
shared fixture's default and broke thirty-five unrelated tests at once, when the
feature had a fixture helper of its own available. The rule:

- If a test needs a value different from the shared default, **parameterise or
  build a local fixture** for it.
- If a test genuinely needs a different global default, expect every suite that
  imports it to move — and say so in the PR.

## Constructor events cannot be asserted

The test environment does not record events emitted from a contract's
constructor (`__constructor`). Do not write a test that tries to assert on them
— it will fail for reasons unrelated to your change. Test constructor behaviour
through its effects instead: the state it set, the clients it handed back, the
subsequent calls that succeed or fail because of it.

## Asserting events

Every event a contract publishes is consumed by something that cannot call the
contract, so each one is worth an exact assertion: topics, every field, the
amounts. `milepost_test_utils::assert_events` is the shared form of that, and it
filters by contract id because the event buffer holds the events of the last
top-level call *and every call nested inside it* — a programme releasing a
tranche also transfers a token and credits standing.

```rust
let uid = proof(&f, &recipient, 1);
f.client.release(&recipient, &uid, &f.verifier);
assert_events(
    &f.env,
    &f.client.address,
    &[Released { /* … */ }.to_xdr(&f.env, &f.client.address)],
);
```

Two traps that cost an afternoon each if you do not know them:

- **Any later call empties the buffer, including a getter.** Compute everything
  the expected event needs *before* the call under test: the attestation uid, the
  next `history_root`, the award. Reading state back to build the expectation
  empties the buffer and the assertion then sees nothing.
- **A field published with a placeholder is worse than no event at all.**
  `release_batch` once published one `Released` per tranche with `amount: 0`
  because the per-tranche amounts were never tracked. An indexer summing the
  event amounts got a total of zero and no way to tell the difference between a
  broken contract and a paused programme.

## Mutation testing

Line coverage on the programme is about 98%, and that figure says only that the
tests *ran* each line. Mutation testing asks the question that matters for the
contract holding the money: if this line were wrong, would a test fail?
[cargo-mutants](https://mutants.rs) makes one small change at a time — `>`
becomes `>=`, `-` becomes `+`, a function returns `Ok(0)` — rebuilds, and runs
the programme's suite. A mutant the suite fails on is **caught**. One the suite
still passes on has **survived**, and each survivor is a specific change to the
contract that no test would notice.

Scope is `contracts/program` only, configured in
[`.cargo/mutants.toml`](../.cargo/mutants.toml), so a bare `cargo mutants` at the
repository root targets nothing else.

### Running it

```sh
cargo install --locked cargo-mutants

# The functions you are changing: minutes.
./scripts/mutants.sh -F 'Programme::execute_refund'

# Exactly what CI runs on your pull request: the lines you changed.
git diff main... > /tmp/pr.diff
./scripts/mutants.sh --in-diff /tmp/pr.diff

# Everything: about 270 mutants, around 90 minutes with four jobs on a laptop.
./scripts/mutants.sh --jobs 4
```

`just mutants …` and `make mutants ARGS="…"` do the same. The script passes its
arguments to cargo-mutants, then prints the survivors grouped by function, with
the file position and the change for each:

```text
#### Surviving mutants by function

| function | count |
| --- | ---: |
| `Programme::finalize` | 1 |

`Programme::finalize`

- `contracts/program/src/lib.rs:1008:22` replace > with >=
```

Everything else — every mutant's diff and build and test log — is in
`mutants.out/`, which is gitignored. `mutants.out/diff/` shows exactly what was
changed.

### In CI

The [`mutants`](../.github/workflows/mutants.yml) workflow runs two ways:

- **On every pull request**, it mutates only the lines the PR changed in the
  programme, against the merge base, and **fails if any of those mutants
  survives**. A PR that touches no programme code finds nothing to mutate and
  passes in seconds.
- **Weekly (Mondays), and on demand** from the Actions tab, it mutates the whole
  programme across eight shards and writes one survivors-by-function report to
  the run summary. It fails if anything survived anywhere. This is what catches a
  test being weakened or deleted, which a changed-lines run never mutates.

The unmutated suite has to pass first; if it does not, the run fails rather than
reporting every mutant as caught. A mutant that hangs the suite until it times
out counts as caught — a hang is noticed — but is listed in the report, because
it can also mean a test is merely slow.

### The proptests are skipped

Mutation runs skip `test::proptests` (`additional_cargo_test_args` in the
config). With random inputs, a mutant can be caught on one run and survive the
next, which would make the verdict — and the PR check — flap. So a mutant counts
as caught only when a deterministic example test catches it. That also means a
survivor is always fixed the same way: an example that names the case.

### When a mutant survives

Read the change (`mutants.out/diff/`, or the line and replacement in the report)
and decide which of two things it is:

1. **A missing test.** The mutant changes what the contract does and nothing
   checks it. Nearly always a boundary: `>` against `>=` survives when no test
   sits exactly on the limit. Write the test that sits on it. The tests added
   when this was introduced are examples:
   `awards_can_commit_the_budget_exactly`,
   `a_partial_refund_can_take_exactly_what_is_left`,
   `a_zero_fee_sweep_moves_no_tokens`,
   `sweeping_unclaimed_closes_out_an_unswept_fee`,
   `batch_release_accepts_the_maximum_size`.
2. **An equivalent mutant.** It cannot change behaviour, because the case it
   differs on cannot happen. Add it to `exclude_re` in `.cargo/mutants.toml`
   with a comment explaining why it is unreachable. An exclusion without a reason
   will be sent back in review.

When in doubt it is (1). "No test would notice" is the finding; "it cannot
happen" needs an argument.

### Explained survivors

| Mutant | Why it is excluded |
| :--- | :--- |
| `release_batch`: `award.tranches > 0` → `>=` | Differs only for an award with zero tranches. The constructor refuses `tranches == 0`, and every award copies the config's value, so the branch is unreachable. |
| `review` (both branches): `approved < existing` → `<=` | Changes only whether a vote is inserted before or after an equal vote. Equal `i128`s are indistinguishable, so the sorted votes and the median are identical. |

## The full gate

Before opening a PR that touches contract code, run the same gate CI does, in
this order:

```sh
cargo build --target wasm32v1-none --release
cargo fmt --all --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-features
./scripts/check-bindings.sh   # if you changed a contract's interface
```

Frontend testing has its own guide: [frontend/docs/testing-guide.md](../frontend/docs/testing-guide.md).