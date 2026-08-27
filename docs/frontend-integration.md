# Frontend integration

Everything needed to wire the web app to the live contracts, with real data
already on testnet to render against.

## What this protocol actually doess

A **funder** creates a *programme* and puts money in. **Applicants** ask for the
amount they actually need. **Reviewers** each approve some amount up to that,
and the award settles at the *median* of their votes — so partial funding is
normal and an equal split never happens. The award is then paid out in
**tranches**, and each tranche only releases when a trusted **verifier** signs
an attestation that a milestone was met.

Where the money goes depends on the award's `Mode`. That choice is the heart of
the product, so the UI should make it legible rather than hiding it behind a
dropdown.

## Deployed contracts (testnet)

Already embedded in each binding package as `networks.testnet`, so you should
not need to paste these anywhere.

| Package | Contract | Id |
| --- | --- | --- |
| `@milepost/attest` | attestation registry | `CCOVBEADD2GEVZD3XHCKGIVWLD55CF7IF2PPA3X3LEIN3FWZKLLIJOZ4` |
| `@milepost/record` | recipient standing | `CCNOJI7LNHQBQFFOQRB3B5CAABRNOXYCGLJTVWRMS7AMOMDGKNY324ZO` |
| `@milepost/registry` | factory + protocol config | `CA7HUSERUURI6OIV7T22RI3J2BB2BIGC3A7QZCVLY2EKDZANYEDIAHUQ` |
| `@milepost/policy-spend` | wallet spend policy | `CAWCAOO3VYQT3LFKX4IKD6FDEPCOI3N3URPMAALO3T7G5OCMQM5IA6BQ` |

`@milepost/program` has **no** embedded id: every programme is its own deployed
contract, so you pass `contractId` per programme.

Machine-readable copies: `deployments/testnet.json` and
`packages/testnet.json`.

## Seeded data to render against

There is a real, funded programme on testnet that has already run end to end.

```
programme  CD236SGR4CHW3N5WA5REW7CDLCS4ZLDEX6JVEAIHZK7NSN4W7WD7YDAL
schema     7648441cc4224ab7f6956fbce0502020c9583bc62611626ba833e37e8d3e18cd
```

| Role | Account |
| --- | --- |
| creator | `GCS7774GF6OHIEXCXMUGI56RLOPHE3SEOK4F2CEMQYFXALNEYLK5IGHX` |
| donor A | `GBMS4QTTJJBTZVVTSCMSMNEBXMBBKXV7J3EHCDNWFTHW7TAA4BQM5ENG` |
| donor B | `GAE3ORXC45BWEGUYKTS22GJ44MSBGBM7KXCCYJJIN6Y4FMSICT74KL6S` |
| clinic (verifier) | `GB4CCGYQ27CQR45FGZYVVXKTRM4GTBSML7U7GHLLLDK7CFEZ4JKLBZFP` |
| Ada (Allocated) | `GAH3D4RM45ETE4W7VDRCWZBPRPT63CJXAGXFYVBC2FGANBZTS4OTKXCA` |
| Kofi (Direct) | `GCJTOXX6PUK7WTK6LWRUQEWLYZ3QITOE2Q63JJJOJLWVGAYKZLSS5YNZ` |
| reviewers 1–3 | `GDH5HCQ…XCNZ`, `GA5GUJ4…V3T2`, `GCKROBO…O7AG` |
| school (payee) | `GAUHWES2VEBGS5IWDET2IUYZXG3HCXOV7QIMXWM3AH3KHXE4HWJOSC5A` |

What already happened, and what each screen should therefore show:

- Two donors contributed **1000 XLM** total. `budget()` is **975 XLM** after the
  2.5% protocol fee.
- Ada asked for **500**, Kofi asked for **80** — deliberately different, because
  an equal split would serve neither.
- Reviewers disagreed on Ada: **300 / 100 / 500**. Her award settled at **300**,
  the median. This is worth surfacing in the UI; it is the single clearest
  illustration of why the mechanism is not a simple vote.
- Kofi's panel was unanimous at **80**, so he was funded in full.
- The clinic attested Ada's first milestone, one tranche released (**100**), and
  **Ada herself** directed **20** of it to the school. She has **80** left to
  direct.

## Amounts

Everything is `i128` in **stroops** — 7 decimal places. `1 XLM = 10_000_000`.
The bindings hand you `bigint`, so format at the edge and never with floats:

```ts
const toDisplay = (stroops: bigint) =>
  (Number(stroops) / 1e7).toLocaleString(undefined, { maximumFractionDigits: 2 });
```

The seeded programme uses native XLM. Real deployments would use USDC's SAC
address, which is also 7dp, so the same formatting holds.

## Connecting

```ts
import { Client as Registry, networks } from "@milepost/registry";
import { Client as Programme } from "@milepost/program";

const rpcUrl = "https://soroban-testnet.stellar.org";

// Singleton contracts carry their own address.
const registry = new Registry({ ...networks.testnet, rpcUrl });

// Programmes are per-programme, so supply the id.
const programme = new Programme({
  contractId: "CD236SGR4CHW3N5WA5REW7CDLCS4ZLDEX6JVEAIHZK7NSN4W7WD7YDAL",
  networkPassphrase: networks.testnet.networkPassphrase,
  rpcUrl,
});
```

Reads simulate and need no signer:

```ts
const { result: phase } = await programme.get_phase();
const { result: budget } = await programme.budget();
```

Writes need a signer and an explicit send:

```ts
const tx = await programme.contribute({ donor: address, amount: 100_0000000n });
await tx.signAndSend({ signTransaction });
```

## The data model

### `Phase` — drives what the UI may offer

```ts
type Phase = {tag:"Open"} | {tag:"Review"} | {tag:"Settled"} | {tag:"Cancelled"}
```

Derived from wall-clock deadlines in the config, not from a stored flag, so it
changes on its own and the UI should re-read rather than cache it.

| Phase | Allowed |
| --- | --- |
| `Open` | `contribute`, `apply` |
| `Review` | `review`, `finalize` |
| `Settled` | `finalize`, `release`, `spend`, then `refund` and `sweep_*` after their deadlines |
| `Cancelled` | `refund` only |

### `Mode` — where a tranche goes

```ts
type Mode = {tag:"Direct"} | {tag:"Allocated"} | {tag:"Restricted"} | {tag:"Open"}
```

Ordered by how hard the restriction is to circumvent, and the UI should say so
plainly rather than presenting four equal options:

- **`Direct`** — paid straight to a payee fixed at award time. The recipient
  never holds it and never chooses. Payee must already be verified.
- **`Allocated`** — held in escrow; the recipient chooses which *verified* payee
  is paid, when, and how much, via `spend`. The strongest guarantee, because it
  depends on nothing outside the contract. **Prefer this in the demo.**
- **`Restricted`** — paid into the recipient's smart wallet with a policy signer
  limiting onward spending. Weaker than it looks: a policy constrains one
  signer, not the wallet, so a recipient holding an admin signer can authorise
  around it. `release` checks the policy is at least installed.
- **`Open`** — no restriction.

### `Application`

```ts
{ applicant: string; requested: i128; metadata_hash: Buffer;
  submitted_at: u64; votes: Array<i128>; finalized: boolean }
```

`votes` is **sorted ascending** and holds approved amounts, not yes/no. Rendering
it as a spread with the median marked communicates the mechanism better than a
single number.

### `Award`

```ts
{ recipient: string; granted: i128; released: i128;
  tranches: u32; tranches_released: u32; payee: string; mode: Mode }
```

`tranches_released / tranches` is the natural progress indicator — that is the
"milepost" the product is named for.

### `Standing` (from `@milepost/record`)

```ts
{ subject: string; programmes: u32; tranches: u32; total_received: i128;
  first_seen: u64; last_updated: u64; history_root: Buffer }
```

A recipient's portable track record across every programme. `history_root` is a
hash chain over every credit — it is not meant to be displayed raw, but it is
what lets a funder verify a claimed history.

## Reads by screen

| Screen | Calls |
| --- | --- |
| Programme overview | `get_config`, `get_phase`, `total_contributed`, `budget`, `fee`, `total_granted`, `total_released` |
| Application detail | `get_application({applicant})`, then `get_award({recipient})` once finalised |
| Recipient wallet | `allocation_of({recipient})`, `get_award`, plus `record.get({subject})` |
| Payee picker | `is_payee({payee})` per candidate |
| Donor view | `contributed_by({donor})` |
| Verifier check | `attest.verify({uid, subject, schema, attester})` |

## Writes, and who signs

| Action | Call | Signer |
| --- | --- | --- |
| Fund | `contribute({donor, amount})` | donor |
| Apply | `apply({applicant, requested, metadata_hash})` | applicant |
| Review | `review({reviewer, applicant, approved})` | a registered reviewer |
| Settle | `finalize({applicant, payee, mode})` | anyone |
| Release a tranche | `release({recipient, attestation, attester})` | anyone |
| Direct an allocation | `spend({recipient, payee, amount})` | the recipient |
| Verify a payee | `allow_payee({payee})` | programme creator |
| Reclaim | `refund({donor})` | donor |

`finalize` and `release` are deliberately permissionless: the outcome is already
determined by votes and by an attestation the verifier already signed, so
requiring a privileged trigger would let whoever holds it withhold money someone
has already earned. The UI can let anyone press the button.

## The gap you will hit immediately

**There is no way to list programmes or applications from the contracts.**

This is deliberate. Nothing stores a growing collection, because on Soroban a
growing ledger entry costs more to write over time and more to restore after
archival — the recipient with the best track record would become the most
expensive to serve. So there is no `get_all_programmes()` and there will not be.

Everything needed is emitted as events — `ProgrammeCreated`, `Applied`,
`Reviewed`, `Awarded`, `Released`, `Directed`, `Contributed` — but nothing
consumes them yet. Until an event query module lands, the app can only show
records whose address it already knows.

**For now**: hardcode the seeded programme above, or keep a local list of
programme ids the user has created. Do not build UI that assumes an index
endpoint exists — the query module will land behind a small interface and it is
better to swap that in than to unpick assumptions later.

## Error codes

The bindings export an `Errors` map. The ones a user can actually trigger, and
what to say:

| Error | Meaning |
| --- | --- |
| `WrongPhase` | The window for this action is closed or has not opened |
| `AlreadyApplied` | One application per applicant per programme |
| `ExceedsRequested` | A reviewer approved more than was asked for |
| `QuorumNotReached` | Not enough reviewers have voted yet |
| `InsufficientBudget` | The programme cannot cover this award; awards settle first-finalised-first-served |
| `PayeeNotVerified` | The destination is not on the programme's verified list |
| `InsufficientAllocation` | Spending more than has been released to this recipient |
| `AttestationInvalid` | Missing, revoked, expired, or not this verifier's claim about this recipient under this schema |
| `AttestationAlreadyUsed` | One proof unlocks exactly one tranche |
| `PolicyNotInstalled` | A `Restricted` award pointed at a wallet with no policy |

## Keeping in sync

Bindings encode the contract interface **at the moment they were generated**. A
stale binding fails at runtime with a decode error, not at build time — the
failure arrives after a transaction has already been submitted.

Regenerate after any contract change:

```sh
cargo build --target wasm32v1-none --release
./scripts/deploy.sh testnet     # only if the interface changed
for c in attest record registry policy_spend; do
  stellar contract bindings typescript --contract-id "$(jq -r ".$c" deployments/testnet.json)" \
    --network testnet --output-dir "packages/${c//_/-}" --overwrite
done
```

Two changes already landed that require a re-sync if you pulled earlier:
`Mode` became a tagged union rather than a number, and the deployed addresses
moved.
