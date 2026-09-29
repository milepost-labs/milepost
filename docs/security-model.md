# Security Model and Trust Assumptions

Milepost separates the flow of funds from the verification of milestones. That
separation is only worth anything if the document saying who can do what matches
what the contracts actually enforce, so this one describes powers as they are
implemented — including the ones that are uncomfortable, because a reader
deciding whether to trust a programme with money needs the sharp edges, not a
reassuring summary.

The protocol holds two things: token balances in escrow, and standing credited to
recipients. Almost every question below reduces to *who can move the first*, and
*who can write the second*.

## The only routes money takes

A programme's balance changes in exactly six ways, and each has a check attached
that is enforced on-chain:

| Movement | Authorised by | Bounded by |
| --- | --- | --- |
| `contribute` | anyone | the donor's own balance, before the apply deadline |
| `release` / `release_batch` | anyone | one attestation per tranche, from a verifier the programme trusts, about that recipient, before the release deadline |
| `spend` | the recipient | their own `Allocated` escrow, to a payee the creator has verified |
| `refund` / `refund_partial` | anyone | the donor's proportional share, after the release deadline or on cancel |
| `sweep_fee` | anyone | `fee_bps` of contributions, once, to the treasury |
| `sweep_unclaimed` | anyone | after the sweep deadline, whatever is left, to the treasury |

There is no seventh route, and no role can move a balance directly — not the
protocol admin, not the treasury it configures, not the creator. Where released
money *lands* is a property of the mode the award was finalized in, and each mode
fixes it: `Direct` to a payee the creator verified, `Open` to the applicant,
`Restricted` to the payee's wallet, `Allocated` to escrow the recipient then
directs. A programme's standing is written by exactly one contract, `record`, and
only for writers `record` has been told about.

## Roles

### Protocol admin (the registry's `admin`)

**Holds**: `set_fee` (up to 10%), `set_treasury`, `set_policy`, `set_program_wasm`,
`set_admin`, and `upgrade` on the registry itself.

**Does not hold**: the ability to create a programme — `create` takes the
*creator's* signature, and the admin's config is what a programme inherits
rather than something the admin chooses per programme. Nor can the admin change an
existing programme's rules, deadlines, balance or payee list, present an
attestation, or release anything. Existing programmes are unaffected by every
config call, because each one is deployed with a copy of the configuration as it
stood at that moment.

**The wide reach, stated plainly**: `set_program_wasm` decides the code of every
programme created *after* it, and the registry will still authorise those
programmes to write standing. A compromised admin key is therefore a key to all
future standing, and to nothing already funded.

`upgrade` replaces the registry's own code. The registry is `record`'s admin, and
`record` is the only contract that can write standing, so this is the widest power
in the protocol: replacing the registry puts a new contract in the position of
`record`'s admin. The current registry code exposes no call that upgrades
`record`, so today the only route runs through an upgraded registry — which is a
statement about today's code, not a guarantee about tomorrow's. **This is the key
to protect, and rotating it means `set_admin` to an address the old admin does not
control.** There is no two-key delay, no timelock and no veto anywhere in the
chain.

### Record admin (in practice, the registry)

**Holds**: `add_writer`, `remove_writer`, `set_admin`, `upgrade`.

A writer may credit arbitrary standing to arbitrary subjects for arbitrary
amounts. Writer status is therefore a claim-making power, not a bookkeeping one —
the reason `add_writer` is not permissionless is the whole reason standing means
anything. `record`'s history is append-only: a writer that is later removed, or a
programme that is cancelled, cannot walk back the standing already credited.
`record` has no `remove_standing`.

### Creator

The creator does **not** have "no capabilities after deployment". They hold five
ongoing powers, and two of them matter:

- `allow_payee` / `deny_payee` (and the batch forms) — the list of addresses this
  programme is willing to pay.
- `add_verifier` / `remove_verifier` — who may attest. The reviewer panel, by
  contrast, is fixed at deployment: there is no way to add a reviewer later.
- `cancel` (only before any release has happened), `extend_release_deadline`
  (only before refunds open), `pause` / `unpause`.

**What that adds up to.** The creator cannot move a programme's balance. They can
change who is allowed to unlock a tranche, and change where an `Allocated` tranche
may be sent — a `deny_payee` after a recipient has chosen strands the escrow they
were entitled to direct. And in `Direct` mode the destination of a tranche is an
address from a list only the creator maintains, chosen at `finalize`: a creator
who allow-lists themselves and finalizes an approved award to themselves gets paid.

**The sharpest edge in the system** is the composition: a compromised creator can
`add_verifier` an address they control, have it attest, and unlock a tranche of
an award the panel approved. What still stands between that and a programme's
balance is the review quorum and the deadline ordering. Treat a creator the way
you would treat a treasury: as a party whose key is trusted with the programme's
purpose, not merely with its configuration.

`Mode` narrows this, and each mode says who the money belongs to at the moment of
release: `Open` pays the applicant — `finalize` refuses any other payee — so it
cannot be used to reach an address the creator picked. `Allocated` escrows to the
recipient, who then chooses a verified payee. `Restricted` pays the payee the
creator named, which is meant to be the recipient's own smart wallet, and the
release checks that a policy is installed there. Only `Direct` pays an address the
creator named with no check on what that address is — the one mode where the
creator's payee list decides where money goes.

### Reviewers

**Holds**: one vote per application, amendable until the quorum is reached. With
quorum 1 that is the whole approval.

**Does not hold**: any way to release, any way to bypass the verifier check, any
access to a balance. A vote only sets an amount; the money still needs a
tranche's worth of attestations from a verifier the creator put in the programme,
and only before the release deadline. Compromised reviewers can admit applicants
who do not deserve funding — that is the damage — and nothing more.

### Verifiers

**Holds**: `attest` under the programme's schema. A schema registered as
restricted accepts an attestation only from the authority named at registration;
an unrestricted one accepts them from anyone at all. The programme is the filter
that matters: it honours an attestation only when the attester is a verifier it
trusts, and only when the attestation is really about this recipient under this
programme's schema.

`release` itself is permissionless — anyone can present a valid proof, which is
deliberate, because a privileged trigger would let its holder withhold money a
recipient has already earned.

**Compromise**: attesting to milestones that have not happened, which releases
money early. A verifier cannot choose a destination (see `Mode` above), cannot
change the programme, and cannot spend a recipient's money.

**One thing an attestation is not**: it is not bound to a programme. Its identity
is `(attester, schema, subject, data hash)` and each programme keeps its own
record of spent proofs, so one attestation can release a tranche in *every*
programme that trusts the same verifier under the same schema. That is intended —
`attest` is a standalone registry with no knowledge of the programme contract —
and the cost is named in
[integrator-faq.md](integrator-faq.md#can-the-same-attestation-unlock-a-tranche-in-more-than-one-programme):
a schema shared across unrelated funding rounds lets one proof pay for more than
one of them. Mint a schema of your own if a proof is meant to fund a single pot.

### Policy steward

**Holds**: `configure` (asset, cap, period), `allow_payee` / `deny_payee`,
`install` / `uninstall` for each wallet. The first `configure` for a wallet also
requires the *wallet's* signature, so a recipient agrees to being governed before
any money arrives; later changes need only the steward, so the recipient cannot
quietly raise their own cap.

**Does not hold**: any way to move money. A steward sets the rules of a wallet
they do not control, which is enough to do damage — allow-listing a venue they
profit from, or setting a cap and period that leaves the money unusable — and
not enough to take it.

### Donors

**Holds**: `contribute` (anyone may), and a claim on a proportional share of what
is left after the release deadline, or immediately if the programme is cancelled.
`refund` needs no signature at all: anyone may trigger it, and the money can only
go back to the donor who contributed it. A donor cannot refuse their own refund
either.

**Does not hold**: any claim on money contributed by somebody else, and any
sweep. Unclaimed money is not the donors' to route — `sweep_unclaimed` sends it
to the treasury, as does the fee. The fee is not refundable either: every refund
share is computed from contributions *less* the fee, capped at 10% by
`MAX_FEE_BPS`, so the protocol's cut comes off the top before any donor gets a
share back.

### Recipients

**Holds**: `apply`, `withdraw` (before their application is finalized), `spend`
(their own `Allocated` escrow, to a currently-verified payee, before the sweep
deadline), and their own wallet and standing.

**Does not hold**: any ability to unlock a tranche faster than the schedule allows
— or, in fact, any special ability to unlock it at all, since `release` is
permissionless. They cannot manufacture an attestation, and a programme cannot
credit them standing for a tranche they never received.

## Codes that cannot be upgraded, and code that can

| Contract | Upgradeable | By whom |
| --- | --- | --- |
| `registry` | yes | its own admin |
| `record` | yes | its own admin — in practice the registry, which exposes no call that does it today |
| `programme` | no | deployed from a wasm hash and immutable; new code means a new deployment |
| `attest` | no | no upgrade entry point exists |
| `policy-spend` | no | no upgrade entry point exists |

## Programmes the registry did not deploy

The programme wasm is public, so anyone can deploy a copy of it with any
configuration they like, and such a programme will run: it will collect
contributions, review applications, settle awards and hold money.

It cannot do the one thing that makes a Milepost programme worth having. Standing
is written through `record`, which only accepts writers the registry introduced
it to, so the release fails — and because the payout and the standing credit are a
single call, the refusal reverts the payout too. A programme outside the registry
can pay nobody and stand nobody up, which is a useful property: its money stays
put rather than being laundered into a track record.

The check belongs to `record`, not to the programme: a programme constructed with
a different `record` address is wired to a different standing contract and gets
whatever powers that one grants it, so "it is a programme" is a claim about a
deployment, never about a contract's own storage.

Consumers must not take a contract's word for it. `registry.is_programme(address)`
is the check: nothing in a programme's own storage says who deployed it.

## Restricted Mode vs. Wallet Control

Milepost uses a policy signer (`policy-spend`) to restrict how a `Restricted`
recipient can spend (the `Restricted` tranche mode).

**A policy constrains *one signer*, not the wallet.** The policy ensures that a
specific grant-funded signer can only authorise transfers of one asset to
steward-verified payees, within a cap that resets each period. It says nothing
about the wallet's other signers, and it cannot: signer configuration lives in the
wallet's own storage, which no contract in this protocol can read.

So if the recipient also holds an unrestricted admin signer on the same wallet,
they can authorise around the policy or remove the funded signer entirely. **The
smart wallet's signer configuration is what confines the funded signer to the
policy.** A deployment that leaves the recipient an unrestricted key over the
grant funds has the *appearance* of restriction, not the fact of it — which is
what `Allocated` mode exists for, and why `release` refuses a `Restricted` tranche
whose payee has no policy installed for it, one release at a time.
