# Integrator FAQ

Questions an integrator actually hits once they start building against Milepost,
answered with the reasoning behind the design rather than just a description of
it. Error semantics live in
[docs/error-code-reference.md](error-code-reference.md) — this document links to
it rather than repeating it.

Each answer points at the source or test that proves the claim, so the answer
stays checkable as the code moves.

---

### Why are `finalize` and `release` permissionless? Anyone can trigger a payout?

Because by the time either can succeed, the outcome is already decided by
something else: `finalize` settles an application at the median of votes
already cast, and `release` pays out against an attestation a trusted verifier
already signed. Neither call is a *decision* — it is the mechanical
consequence of a decision made earlier. Requiring a privileged caller to press
the button would let whoever holds that privilege withhold money someone has
already earned, simply by not calling it.

See the module docs at
[contracts/program/src/lib.rs:45-52](../contracts/program/src/lib.rs#L45-L52)
(`finalize`) and
[contracts/program/src/lib.rs:1041-1044](../contracts/program/src/lib.rs#L1041-L1044)
(`release`).

**The cost**: permissionlessness plus oversubscription means *call order*
decides who gets funded when approved amounts exceed the remaining budget — see
the next question.

---

### The programme is oversubscribed. Who gets funded?

Whoever's `finalize` call lands first. The contract guarantees the budget is
never exceeded and that a rejected finalisation is a pure read (the
application stays untouched and can be retried later, e.g. if the amount that
consumed the budget is finalised lower or not at all) — but it does not decide
*which* applicants win when the panel has approved more in total than the
programme can pay. That is a documented limitation, not a bug: fixing it
(priority, queueing, a fairer allocation rule) is a separate decision from the
three guarantees the contract actually makes about ordering.

See
[contracts/program/src/lib.rs:43-70](../contracts/program/src/lib.rs#L43-L70)
and the tests
`the_same_application_can_be_refused_in_one_order_and_funded_in_the_reverse`,
`a_refused_finalization_leaves_the_application_completely_unchanged`, and
`finalize_never_exceeds_the_budget_under_any_ordering` in
[contracts/program/src/test.rs](../contracts/program/src/test.rs).

---

### Why does the award settle at the median of reviewer votes, not the mean or the minimum?

The minimum lets one over-cautious reviewer dictate every outcome; the mean
lets one outlier — generous or stingy — drag the number away from what the
panel actually thinks. The median is what a committee converges on in practice
and is robust to a single vote at either extreme.

**The cost named explicitly**: computing a median needs the votes ordered,
which means holding a collection — something this protocol otherwise avoids
for cost reasons. It's acceptable here only because the vote vector is bounded
at construction by `quorum`, which is itself capped at
[`MAX_QUORUM`](../contracts/program/src/lib.rs#L136) (16), so the vector's
write cost and archival-restoration cost are both known in advance rather than
growing without bound.

See
[contracts/program/src/lib.rs:21-34](../contracts/program/src/lib.rs#L21-L34)
and the test `award_is_the_median_of_reviewer_votes` in
[contracts/program/src/test.rs:492](../contracts/program/src/test.rs#L492).

One sharp edge: the median is computed as `votes[(quorum - 1) / 2]` against
the full sorted vote list, not a slice of the first `quorum` votes. If more
than `quorum` reviewers vote before finalisation, the "median" is really the
`(quorum-1)/2`-th smallest of *all* votes cast, which is not necessarily the
statistical median of every vote. This is existing, intended behaviour — plan
around it if your programme allows more reviewers to vote than the quorum
requires.

---

### A reviewer can now change their vote. What actually happens on-chain, and can they inflate the outcome by voting late and high?

`review()` on an applicant a reviewer already voted on replaces the vote
rather than rejecting with `AlreadyReviewed`: the old value is found and
removed from the sorted vote vector, the new value is inserted in sorted
position, and a `VoteAmended` event (carrying both the previous and new value)
is published instead of `Reviewed`. Quorum still counts each reviewer exactly
once — amending doesn't add a second vote to the count. This is only possible
before finalisation; once `application.finalized` is set, `review()` refuses
with `AlreadyFinalized` regardless of whether the call would have been a new
vote or an amendment.

No, a single reviewer can't unilaterally push the outcome: the median is still
robust to any one vote, amended or not. What amending changes is *when* that
reviewer's opinion counts — a mistake can be corrected right up until the
application settles, not after.

See
[contracts/program/src/lib.rs:633-759](../contracts/program/src/lib.rs#L633-L759)
and the tests `a_reviewer_can_amend_their_vote_before_finalisation`,
`amendment_preserves_sorted_order`, `amendment_affects_the_median`,
`quorum_still_counts_each_reviewer_once_after_amendment`,
`amending_after_finalisation_is_rejected`, and
`amendment_events_record_previous_and_new_values` in
[contracts/program/src/test.rs:2255-2420](../contracts/program/src/test.rs#L2255-L2420).

---

### Why are `Direct` and `Allocated` described as "equally unbypassable"? `Allocated` looks weaker — the recipient can move the money themselves.

Because "unbypassable" here is about whether funds can reach an
*unverified* address, not about who decides the timing. In both modes the
contract itself is the only thing that can move the money — in `Direct` it
pays a payee fixed at award time, and in `Allocated` it releases into escrow
that the recipient can only direct to a payee the programme creator has
verified via `allow_payee`. Funds never leave the contract's control until
they land somewhere verified, in both cases. `Restricted` is the one that's
genuinely weaker, because it depends on wallet configuration the contract
cannot see or enforce (see the next question).

The difference between `Direct` and `Allocated` is *agency*, not
enforcement strength — a recipient in `Allocated` mode picks between two
verified bookshops, or pays rent this week instead of next, without ever
holding money that could go anywhere else.

See the `Mode` doc comments at
[contracts/program/src/lib.rs:206-240](../contracts/program/src/lib.rs#L206-L240)
and the tests `an_allocation_cannot_reach_anyone_unverified` and
`a_recipient_chooses_between_verified_payees` in
[contracts/program/src/test.rs](../contracts/program/src/test.rs).

---

### What does `Restricted` mode actually guarantee, and what does it not?

Less than the name suggests. A spend policy in `policy_spend` constrains
*one signer* on the recipient's smart wallet — it does not lock the wallet
itself. If the recipient also holds an unrestricted admin signer on the same
wallet (which is a deployment choice outside this protocol's control), they
can authorise around the policy, or remove it outright, and nothing in
`policy_spend` or `program` can stop that. Genuine enforcement requires the
wallet's own `SignerLimits` to confine the *funded* signer to the policy — a
deployment step no contract here performs.

**What `release()` actually checks**: only that a policy is *installed* on the
payee wallet before paying a `Restricted` tranche
(`PolicyClient::is_installed`), which bounds a misconfiguration to a single
tranche rather than the whole award. It does not and cannot check that the
wallet's signer limits are configured correctly.

See
[contracts/policy-spend/src/lib.rs:17-33](../contracts/policy-spend/src/lib.rs#L17-L33),
the `Mode::Restricted` doc comment at
[contracts/program/src/lib.rs:228-236](../contracts/program/src/lib.rs#L228-L236),
and the test `a_restricted_release_needs_the_policy_installed` in
[contracts/program/src/test.rs:1607](../contracts/program/src/test.rs#L1607).
The README also lists `Restricted` end-to-end (wired to a live passkey wallet)
under "Not yet done".

---

### Can the same attestation unlock a tranche in more than one programme?

Yes, and that's intended, not an oversight. `attest` is a standalone,
general-purpose registry with no knowledge of `program` at all — "one proof
unlocks one tranche" is enforced *per programme*, via each programme's own
`Used(attestation)` storage key, not by the attestation registry itself. If
two different programmes both trust the same verifier under the same schema
for the same subject, the identical attestation UID can independently unlock a
tranche in each of them.

This is deliberate reuse: a school's attestation that a student completed a
term is genuine evidence of that fact regardless of which funding round is
asking. Making the registry programme-aware to prevent reuse would also break
the "no knowledge of the rest of the protocol" property that lets `attest` be
used standalone by other Stellar teams.

**Name the cost**: a verifier who reuses a schema across unrelated programmes
without meaning to can let one attestation fund more than one pot. If your
programme's schema is meant to be exclusive to it, mint a schema you control
rather than sharing one another team also verifies under.

See the module doc at
[contracts/attest/src/lib.rs:1-23](../contracts/attest/src/lib.rs#L1-L23),
the `Key::Used` comment at
[contracts/program/src/lib.rs:451-452](../contracts/program/src/lib.rs#L451-L452),
and the release-side check at
[contracts/program/src/lib.rs:1080-1094](../contracts/program/src/lib.rs#L1080-L1094).
`verify()` versus `is_valid()` matters here too — always gate value on
`verify()`, which checks subject, schema and attester together; `is_valid()`
only checks the attestation exists and isn't revoked or expired, and says
nothing about who made the claim (doc comment at
[contracts/attest/src/lib.rs:276-282](../contracts/attest/src/lib.rs#L276-L282)).

---

### Why do the generated TypeScript bindings return different shapes for different functions? Some need `.unwrap()`, some don't.

Because the underlying Rust functions have different fallibility, and the
bindings encode that difference in their return type rather than papering
over it. A Rust function that returns `Result<T, Error>` (almost every
state-changing call, plus reads like `get_config`, `get_phase`, `budget`,
`get_award`) generates a TypeScript method whose simulated result is
`AssembledTransaction<Result<T>>` — you must call `.unwrap()` on `.result` to
get `T`, and that unwrap throws if the contract call actually failed. A
function that cannot fail — like `is_paused`, `is_verifier`, `is_reviewer`,
`total_contributed`, `allocation_of` — returns `T` directly, wrapped as
`AssembledTransaction<T>`, with no `Result` and no `.unwrap()` to call.

Concretely, compare two entries generated into the same file:

```ts
is_paused: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>
allow_payees: (...) => Promise<AssembledTransaction<Result<void>>>
```

Calling `.unwrap()` on the first is a compile error (there's no `Result` to
unwrap); forgetting it on the second compiles — `Result<T>` still has fields —
but leaves you holding an unopened `Result` instead of the value, silently
wrong rather than loudly wrong. The frontend's own hooks split on exactly this
distinction: `useContractRead` is for infallible reads, `useContractResult` is
for fallible ones and calls `.unwrap()` internally. See the doc comment at
[frontend/src/hooks/useContractRead.ts:115-123](../frontend/src/hooks/useContractRead.ts#L115-L123)
for the same warning aimed at frontend contributors, and
[packages/program/src/index.ts](../packages/program/src/index.ts) for the
generated signatures themselves (search for `is_paused`, `is_verifier`, and
`allow_payees` to see the shapes side by side).

There is no way to tell which shape a function has from its name alone —
check whether the Rust source declares it as returning `Result<_, Error>` in
[contracts/program/src/lib.rs](../contracts/program/src/lib.rs) (or the
relevant contract's `lib.rs`), or check the generated `index.ts` directly.

---

### Why does `policy-spend` use `SpendError` instead of `Error`?

Because `policy-spend` implements the smart wallet interface, and that
interface exports its own `Error` type. Two different `Error` enums in one
generated bindings package is a name collision, so `policy-spend` names its
own `SpendError` instead. The codes and semantics follow the exact same
pattern as every other contract's `Error` — this is a naming workaround, not a
different error model. Full code table in
[docs/error-code-reference.md](error-code-reference.md#why-spenderror-instead-of-error).

---

### Why can't a programme deployed outside the registry write recipient standing?

Because standing is only meaningful if it can't be manufactured. The registry
is the *admin* of the `record` contract, and it authorises a programme as a
writer (`add_writer`) at the moment it deploys that programme — never because
a programme asks. A programme instantiated some other way (deployed directly
from the wasm hash, bypassing `Registry::create`) can still take contributions
and make awards perfectly well; it simply has no path to being added as a
writer, so its `release()` calls will fail when they try to credit standing
through `StandingClient::credit`.

This is the intended failure mode, not a gap: the whole trust chain is
"registry deploys the code it knows, and vouches only for that."

See
[contracts/registry/src/lib.rs:12-22](../contracts/registry/src/lib.rs#L12-L22)
and
[contracts/registry/src/lib.rs:200-203](../contracts/registry/src/lib.rs#L200-L203).

---

### Why is there no way to list all reviewers, verifiers, or attestations for a subject on-chain?

Growing a collection inside a single ledger entry makes writes cost more over
time and eventually makes the entry unrestorable after archival — Soroban
persistent storage is priced and archived per entry, and an ever-growing list
is the shape that breaks worst under that model. Instead, membership is
checked per-address (`is_reviewer(addr)`, `is_verifier(addr)`,
`is_payee(addr)`) and full history is reconstructed off-chain from emitted
events (`Reviewed`, `Attested`, `PayeeChanged`, etc.) by an indexer. As of this
writing that indexer does not exist yet (see "Not yet done" in the root
README), so the frontend falls back to known/seeded addresses in places like
the verifier queue — check
[frontend/src/pages/VerifierDashboard.tsx](../frontend/src/pages/VerifierDashboard.tsx)
for how it currently works around this.

See the attest module's rationale at
[contracts/attest/src/lib.rs:15-23](../contracts/attest/src/lib.rs#L15-L23),
which states the general principle the other contracts follow too.

---

### Why does `pause` block `contribute`/`apply`/`review`/`finalize`/`spend`/`release` but not `refund`/`sweep_fee`/`sweep_unclaimed`?

Because pause is an emergency containment tool, and trapping donor money
during an emergency would be strictly worse than whatever the pause is
containing. Every entry point that moves money *forward* — into the programme,
into an award, into a payee's hands — checks `require_not_paused` first. The
three exits that return money to donors or the treasury deliberately do not,
so a donor can always get their money back even while the programme is
paused.

`phase()` does not report the paused state — pausing is orthogonal to the
deadline-driven phase timeline (`Open` → `Review` → `Settled`, or
`Cancelled`), so a client has to check `is_paused()` separately from
`get_phase()`, and the frontend should show both.

See the `pause`/`unpause` doc comments at
[contracts/program/src/lib.rs:1386-1425](../contracts/program/src/lib.rs#L1386-L1425)
and the tests `pausing_blocks_the_money_path` and
`pausing_does_not_trap_refunds` in
[contracts/program/src/test.rs:382-420](../contracts/program/src/test.rs#L382-L420).

---

### Who can pause a programme, and is it reversible?

Only the creator (`config.creator.require_auth()`), and yes — unlike
`cancel`, which is a one-way shutdown that opens refunds and can never be
undone, `pause`/`unpause` is a reversible toggle the creator can flip as many
times as needed. `pause` refuses if the programme is already paused or has
been cancelled; `unpause` on an already-unpaused programme is a harmless no-op
rather than an error.

See
[contracts/program/src/lib.rs:1392-1425](../contracts/program/src/lib.rs#L1392-L1425).

---

### Why does `Error::NothingToRefund` (or `NothingToSweep`, `AlreadyRefunded`) show up in normal operation? Is something broken?

No — these are in the error enum because Soroban has no separate channel for
"correct, uneventful outcome" versus "something went wrong," but several
codes mean the former. `NothingToRefund` usually means a programme paid out in
full and there's genuinely nothing left; `AlreadyRefunded` means a donor
already successfully claimed. The error-code reference marks each code's
`Kind` as **Fault** or **Expected** for exactly this reason — check that
column before building alerting or retry logic around a specific code. Full
table: [docs/error-code-reference.md](error-code-reference.md).

---

### Why does `apply()` accept any positive `requested` amount instead of a fixed award size per applicant?

Because a fixed slot ignores the only thing that actually matters: one
applicant needs 200 for exam fees, another needs 5,000 for tuition. An equal
split isn't funding, it's an accounting convenience. `apply()` lets the
applicant state what they need, each reviewer approves *up to* that amount,
and the median settles somewhere a genuine committee would land — see "Why
does the award settle at the median" above for the mechanism.

See the module doc at
[contracts/program/src/lib.rs:12-19](../contracts/program/src/lib.rs#L12-L19)
and the tests `partial_funding_awards_less_than_requested` and
`different_applicants_get_different_amounts` in
[contracts/program/src/test.rs](../contracts/program/src/test.rs).

---

### Bindings look stale (a method I expect isn't there, or a signature changed) — what's actually going on?

`packages/*/src/index.ts` is generated from the built wasm and checked into
the repo; nothing regenerates it automatically at runtime. If the contract
interface changed since you last pulled, the checked-in bindings can be
genuinely behind, and a stale binding fails at *runtime* (a call that no
longer matches the deployed contract's interface), not at build time — the
TypeScript compiler has no way to know your local `.wasm` and your local
`index.ts` have drifted apart. Regenerate with:

```sh
cargo build --target wasm32v1-none --release
./scripts/generate-bindings.sh
```

CI runs `scripts/check-bindings.sh` on every PR specifically to catch this
before it ships. See
[packages/README.md](../packages/README.md) and, for what changes across a
real release (not just a stale local checkout), the
[upgrade and compatibility guide](upgrade-and-compatibility.md).
