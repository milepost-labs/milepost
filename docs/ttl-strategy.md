# TTL strategy

Soroban entries expire. A persistent entry that is not bumped eventually
archives; an archived entry reads as absent, so a recipient can silently lose
access to money or a verifier can become unresolvable. This document is the
defensible policy for every persistent entry across the five contracts, plus
the tests that pin it.

State archival applies to all five contracts. Protocol 23 auto-restores
archived entries, but restoration costs the caller and the failure mode is
poor timing rather than permanent loss — so the goal is to keep the entries a
live reader needs from ever archiving in the first place.

## Constants

Every contract uses the same bump window, defined locally as:

```rust
const DAY_IN_LEDGERS: u32 = 17_280;          // ~5s close time
const BUMP_LEDGERS: u32 = 90 * DAY_IN_LEDGERS;   // 90 days
const BUMP_THRESHOLD: u32 = 60 * DAY_IN_LEDGERS; // 60 days
```

The meaning of `extend_ttl(key, BUMP_THRESHOLD, BUMP_LEDGERS)` is: if the
entry's remaining life is already under 60 days, push it out to 90 days from
now. **The extension is capped at 90 days from the moment of the call**, so
calling it in a loop cannot push an entry's lifetime out without bound — there
is no griefing path.

## Policy by write-path

The default rule: **every entry is bumped on every write that touches it.**
That covers the vast majority of entries, because an active programme is
constantly writing — contributions, reviews, releases, awards. The interesting
cases are the entries that are written once and only read afterwards.

### `program`

| Entry | Written | Bumped | Lifetime decision |
| --- | --- | --- | --- |
| `Config`, `Contributed`, `Granted`, `Released` (instance) | constructor | constructor + every contribution/finalize/release/sweep via instance `extend_ttl` | Instance sub-keys share the instance TTL and are re-bumped on every write. Constructor also bumps explicitly. |
| `Reviewer(addr)`, `Verifier(addr)` | constructor | constructor + on use (`review` bumps `Reviewer`, `release` bumps `Verifier`) | Written once; read on every review/release, so use-time bumps keep them alive for the programme's active life. |
| `Application(addr)` | `apply`/`review`/`withdraw`/`finalize` | each of those writes | Active until finalised. |
| `Award(addr)` | `finalize`/`release` | each of those writes | Active until fully released. |
| `Allocation(addr)` | `release`/`spend` | each of those writes | Active until directed/emptied. |
| `Donor(addr)`, `Refunded(addr)` | `contribute`/`refund` | each of those writes | Active through the refund window. |
| `Payee(addr)` | `allow_payee`/`deny_payee`/`allow_payees`/`deny_payees` | each of those writes | Active while the payee list changes. |
| `Voted(applicant, reviewer)`, `Used(attestation)` | `review`/`release` | on write | Short-lived by nature. |

**Long-lived entries with no write of their own** — an `Application` after the
programme settles, an `Award` after it is fully released, an `Allocation` that
is never directed, a `Donor` who never claims a refund — have no further write
to ride on. For these the contract now exposes a **permissionless `keepalive`
mirroring `attest` and `record`**:

```rust
pub fn keepalive(env: Env, subject: Address) -> Result<(), Error>
```

It bumps the contract-wide instance state (config and the running totals) and,
for the given `subject`, any of `Application`, `Award`, `Allocation`, `Donor`,
and `Refunded` that exist. Anyone — a donor, a recipient, an observer
rebuilding history — may pay to keep an entry alive. This is the deliberate
decision for `program`'s long-lived entries: rather than change their storage
tier, we give them a keepalive and document that an archived entry is a
recoverable (auto-restored) miss, not a loss.

### `attest`

`Attestation(uid)` and `Schema(uid)` are bumped on every write and on read
(`schema` bumps its `Schema` on access). `Nonce` is written once at
construction and bumped there. `keepalive(uid)` (permissionless) bumps a single
attestation, exactly so a recipient's proof does not rot because the issuer
lost interest.

### `record`

`Standing(subject)` and `Seen(subject, programme)` are bumped on every
`credit` and on read. `Writer(addr)` and `Admin` are bumped on write.
`keepalive(subject)` (permissionless) bumps a subject's standing.

### `registry`

`Config` and `Nonce` are instance entries, re-bumped on the writes that touch
them. `Programme(addr)` is bumped when registered and when its status changes.
Long-lived but always either freshly written or read via the registry's own
operations, which bump it. No separate keepalive is required because the
registry is the always-active entry point for programmes.

### `policy-spend`

`Policy(wallet)`, `Payee(wallet, payee)`, and `Installed(wallet)` are all
bumped on every write that touches them; the policy entry is also bumped when
a payee is added or removed. Active only while a wallet is being configured or
used, which is write-heavy.

## Tests

The `program` contract tests pin the behaviour:

- `construction_emits_a_programme_created_event` — construction bumps the
  instance and the `Reviewer`/`Verifier` entries (issue #115); the reviewer
  entry must survive past the 60-day threshold.
- `reviewer_entry_resolves_after_the_bump_threshold` — the constructor bump
  keeps the trust set resolvable well into the programme's life.
- `keepalive_is_permissionless_and_refreshes_a_subject` — `keepalive` is
  callable by anyone, is a no-op for a subject with no entries, and leaves the
  subject's entries readable deep into the programme's life.

These advance the ledger far enough to exercise the bump windows. Where an
entry would otherwise have archived, the bump (constructor, use-time, or
`keepalive`) keeps it alive; the tests assert the entry remains readable rather
than going missing.

## Out of scope

- Restoring already-archived entries (Protocol 23 does this automatically).
- Changing storage tiers of existing entries without justification.
- Frontend TTL surfacing (a separate concern).
