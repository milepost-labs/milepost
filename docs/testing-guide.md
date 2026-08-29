# Testing guide for contributors

How contract tests in this repository actually work, and the traps that have
already cost review rounds. This is not a general introduction to Rust testing —
it records what goes wrong here, drawn from real cases.

## The build ordering rule: wasm before clippy and tests

`registry`'s test suite instantiates the programme from its built artifact:

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

Frontend testing has its own guide: [frontend testing](frontend-testing-guide.md).