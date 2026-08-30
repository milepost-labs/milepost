# Upgrade and compatibility guide

What changes when Milepost changes, what an integrator can rely on staying
put, how a breaking change is announced, and what to actually do when one
lands.

This is written for a team calling these contracts from outside the repo —
against a deployed instance, generated TypeScript bindings, or both. If
you're contributing to Milepost itself, the release mechanics (tagging,
`cliff.toml`, the workflow that builds and publishes) are covered in
[CONTRIBUTING.md](../CONTRIBUTING.md#8-release-process); this document only
restates what an integrator needs from that process, not how to run it.

---

## The one fact everything else follows from

**None of the five contracts has an upgrade function.** There is no
`upgrade()`, no `update_current_contract_wasm`, nothing that changes a
deployed contract's code in place. Once a contract instance exists on-chain,
its wasm is fixed for the life of that instance — permanently. A breaking
change is never something that happens *to* a deployment; it only ever
produces a *new* deployment, at a new place, that old integrations keep not
talking to until they deliberately switch.

This is stated as a guarantee, not just a limitation: an integration that
never calls `set_program_wasm` (registry admin only) and never manually
re-points itself at a new contract address will keep running against exactly
the code it integrated against, indefinitely, regardless of what Milepost
ships afterwards.

---

## Stability guarantees, per contract

| Contract | What's pinned | What can change without notice | What can't change at all |
|---|---|---|---|
| `program` (per programme) | The wasm hash a specific programme instance was instantiated from, and the config values (fee, deadlines, quorum, treasury, etc.) it snapshotted into its own storage at construction | Nothing — an already-deployed programme's code and snapshotted config are immutable | The programme's own address, wasm, and config for its entire lifetime |
| `registry` | Its own deployed address and wasm (immutable once deployed) | Its **mutable config** — `fee_bps`, `treasury`, `policy`, `admin`, `program_wasm` — any of these can be changed by the current admin at any time via `set_fee`/`set_treasury`/`set_policy`/`set_admin`/`set_program_wasm`, and doing so affects only *future* `create()` calls, never programmes already deployed | The registry's own address and wasm |
| `attest` | Its deployed address and wasm | Nothing programme-shaped — schemas and attestations are additive, append-only data, not configuration | Its address, wasm, and the immutability of already-registered schemas/attestations |
| `record` | Its deployed address and wasm, and its `admin` (handed to the registry once at deploy time — see `scripts/deploy.sh`) | Which addresses are authorised writers (`add_writer`/removal, admin-controlled) | Its address and wasm |
| `policy_spend` | Its deployed address and wasm | Per-wallet policy configuration (each wallet's own steward, cap, allowlist) | Its address and wasm |

**Error codes**, across all five contracts, are governed separately and more
strictly than anything above: see
[CONTRIBUTING.md §7](../CONTRIBUTING.md#7-error-code-stability-policy). Once a
numeric discriminant ships in a release, it is never reassigned, even if the
variant is later removed — the slot is marked reserved instead. This is the
one interface guarantee that survives a wasm hash change: `#14` means the same
thing across every version of `program` that has ever shipped a `#14`.

**Bindings** are not versioned or guaranteed independently at all — see
"Bindings aren't a compatibility layer" below.

**Crate versions** are not a compatibility signal. Every crate in the
workspace shares `version = "0.1.0"` and none of them are published to
crates.io (see
[CONTRIBUTING.md](../CONTRIBUTING.md#why-these-crates-are-not-published-to-cratesio)
for why) — the git tag is the only thing that means "a release," and a wasm
hash is the only thing a deployment is actually pinned to.

---

## What `set_program_wasm` does and does not do

The registry's admin can call `set_program_wasm(wasm)` to point future
`create()` calls at a different `program` wasm — for example, to roll out a
bug fix or a new feature to newly-created programmes without touching
anything already running. This is the *only* upgrade-shaped lever anywhere in
the protocol, and it deliberately does not reach backward:

- Every programme already deployed keeps running the exact wasm it was
  instantiated with. `set_program_wasm` cannot retarget them, because nothing
  in Soroban lets a deployed contract's code be swapped after the fact
  without an explicit upgrade mechanism, and this protocol has none.
- Two programmes on the same registry, created before and after a
  `set_program_wasm` call, can be running genuinely different code — this is
  by design, not a bug to route around.
- If you administer your own registry deployment, calling
  `set_program_wasm` is how you adopt a new `program` release for future
  programmes. If you integrate against someone else's registry, whether and
  when they call it is entirely their decision, and you have no way to
  observe it except that new programmes you see created there will report a
  different `program_wasm` in `get_config()` on the registry.

See [contracts/registry/src/lib.rs](../contracts/registry/src/lib.rs) (the
`set_program_wasm` doc comment) and the root
[README](../README.md#deployed-testnet) for how a programme's wasm hash is
what a downstream integration actually pins to.

---

## Bindings aren't a compatibility layer

`packages/*/src/index.ts` is generated straight from a specific built wasm
(`stellar contract bindings typescript`) and checked into the repo as-is —
it is not hand-versioned, not semver'd, and carries no compatibility
guarantee of its own. A binding generated against one wasm and pointed at a
different deployment can compile cleanly and still fail at *runtime*, because
TypeScript has no visibility into what the deployed contract on the other end
of an RPC call actually accepts. See the [integrator
FAQ](integrator-faq.md#why-do-the-generated-typescript-bindings-return-different-shapes-for-different-functions-some-need-unwrap-some-dont)
for the mixed-return-shape consequence of this, and
[packages/README.md](../packages/README.md) for how to regenerate.

Practically: pin your own integration to a specific tag's `packages/`
snapshot (via git ref, not by hand-copying `index.ts`), and regenerate
whenever you move to a new tag — never assume last week's bindings are still
correct against this week's testnet deployment just because nothing in your
own code changed.

---

## How a breaking change is signalled

A release is a pushed git tag matching `vX.Y.Z` (or a pre-release like
`v0.1.0-rc.1`), which triggers the workflow that builds wasm, hashes it into
`checksums.txt`, and publishes a GitHub Release with a changelog generated
from the commits since the previous tag. Full mechanics in
[CONTRIBUTING.md §8](../CONTRIBUTING.md#8-release-process).

The signal you're looking for is the changelog's **"⚠ Breaking changes"**
section, which the release workflow always places first, separate from
ordinary `Features`/`Fixes` entries. A commit lands there when its subject
carries a `!` after the type/scope (`feat(program)!: change award() signature`)
or its body carries a `BREAKING CHANGE:` footer. Per the project's own
convention, "breaking" means the commit touches a contract's **client-facing
functions, its error codes, or its storage/upgrade layout** — anything an
external caller's compiled integration or matched error codes could
disagree with afterwards.

Two things to watch for beyond that section heading:

- **`checksums.txt` is the ground truth, the label is not.** The breaking-change
  marker is a human decision made at commit time; the wasm hash is not. If a
  contract's hash in `checksums.txt` changed between two tags, its code
  changed — full stop — whether or not any commit in between was marked
  breaking. Treat an unexplained hash change on a contract you depend on as
  worth investigating even absent a "⚠ Breaking changes" entry naming it.
- **A pre-release tag (`vX.Y.Z-rc.N`) is a preview, not a commitment.** The
  release workflow itself is meant to be verified this way before a real tag
  — see [CONTRIBUTING.md](../CONTRIBUTING.md#verifying-the-workflow) — so
  don't treat an rc's contents as final until the corresponding non-rc tag
  ships.

---

## What to do when a breaking change lands

1. **Read the "⚠ Breaking changes" section of the release notes** for the
   tag you're moving to (GitHub Releases page). This tells you *what* broke
   and, ideally, why.
2. **Diff `checksums.txt`** between your currently-pinned tag and the new one
   for every contract you actually call. A changed hash on a contract you
   don't use is not your problem; a changed hash on one you do use is worth
   reading the commit history for, even if it wasn't flagged breaking.
3. **Decide whether you need to move at all.** If the change is to a
   singleton contract (`attest`, `record`, `registry`, `policy_spend`) you
   call by address, and you haven't chosen to point at a new deployment, you
   are still running the old code — nothing forces you onto the new release.
   If the change is to `program`, every programme you've already had created
   is similarly untouched. You only need to act if you (a) are about to
   deploy a *new* singleton instance or have a new programme *created*, or
   (b) have deliberately decided to move your integration to the new release.
4. **If you're moving a singleton integration**: there is no in-place
   migration path, because there is no upgrade function. You (or whoever
   administers the deployment you use) deploy a fresh instance from the new
   wasm, which gets a **new contract address**. Any state in the old instance
   — registered schemas and attestations in `attest`, standing records in
   `record`, policy configurations in `policy_spend`, protocol config in
   `registry` — does **not** carry over automatically; there is no migration
   tooling in this repo for that today. Plan your own data migration (or
   accept starting fresh) before switching addresses in production.
5. **If you're moving `program` for new programmes only**: nothing to do
   beyond making sure whoever administers the registry you build against has
   called `set_program_wasm` with the new hash (or doing so yourself, if you
   administer it) — existing programmes need no action at all, ever.
6. **Regenerate your bindings and recompile.**
   ```sh
   cargo build --target wasm32v1-none --release
   ./scripts/generate-bindings.sh
   ```
   A stale binding fails silently at runtime rather than at compile time (see
   the [integrator FAQ](integrator-faq.md)), so don't skip this even if
   nothing in your own TypeScript changed.
7. **Re-check error codes you match on** against
   [docs/error-code-reference.md](error-code-reference.md) for the new
   release. New variants are only ever appended with the next free number —
   never assume a code your integration already handles has been silently
   redefined; that's precisely what the stability policy in
   [CONTRIBUTING.md §7](../CONTRIBUTING.md#7-error-code-stability-policy)
   rules out. But a genuinely new code you don't yet handle will fall through
   to your default/unknown-error path until you add it.
8. **Verify against testnet before production.** Deploy the new version to
   testnet (`./scripts/deploy.sh testnet`), run your integration's own test
   suite or a manual smoke pass against it, and only then repoint anything
   that moves real funds.
