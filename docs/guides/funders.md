# Guide for Funders

This guide explains where your money goes when you contribute to a programme, how it gets released, and how you get it back if it isn't used.

---

## The money path

### 1. You contribute

When you call `programme.contribute(amount)`, your contribution enters the programme's token balance. This is real money held by the programme contract.

### 2. The protocol fee is deducted

A small percentage (the **protocol fee**) is set aside from contributions. The remainder is the **budget** — the pool that can be awarded to recipients.

```
budget = total_contributions × (1 - fee_bps / 10000)
```

For example, with a 1% fee (100 basis points):
- You contribute 10,000 tokens
- Fee deducted: 100 tokens  
- Budget available for awards: 9,900 tokens

The fee is swept to the protocol treasury after the application deadline closes. It cannot be refunded to you.

### 3. Awards are finalized

Recipients apply for what they need, reviewers approve amounts, and each application is **finalized** into an **award**. The award amount is the **median** of reviewer votes (see [Recipients Guide](recipients.md) for details).

Awards are settled **first finalized, first served** against the budget. If the programme is oversubscribed, later finalisations may be rejected with `InsufficientBudget` — but the budget itself is never exceeded.

### 4. Tranches release against attestations

Each award divides into **tranches** (installments). A tranche releases only when:
- A trusted verifier submits an attestation proving the recipient met a condition
- The release window is still open (before `release_deadline`)

Released funds move according to the award's **payment mode**:
- **Direct**: Sent to a verified payee (e.g., school, clinic) chosen at award time
- **Allocated**: Held in escrow; recipient directs it to verified payees later
- **Restricted**: Sent to recipient's smart wallet with spend policy enforced
- **Open**: Sent directly to the recipient with no restriction

See [Choosing a Payment Mode](choosing-a-mode.md) for details.

---

## What you get back

### Refunds: proportional return of unreleased funds

After the release window closes (`release_deadline` passes), any money **not released** becomes refundable to contributors proportionally.

Call `programme.refund()` to claim your share.

#### How refunds are calculated

Your refund is proportional to what you contributed:

```
your_refund = (your_contribution / total_contributions) × unreleased_pool
```

The **unreleased pool** is:
```
budget - released_so_far
```

**Example:**
- Total contributions: 100,000 tokens  
- Protocol fee (1%): 1,000 tokens  
- Budget: 99,000 tokens  
- Released: 60,000 tokens  
- Unreleased pool: 39,000 tokens

If you contributed 10,000 tokens (10% of the total), your refund is:
```
10,000 / 100,000 × 39,000 = 3,900 tokens
```

#### When refunds become available

- **During the release window**: Refunds are **locked**. This ensures recipients can claim all their approved tranches without the budget shrinking underneath them.
- **After `release_deadline`**: Refunds open. You can claim anytime.
- **After cancellation**: If the programme is cancelled, refunds open immediately (after a grace period for pending releases).

#### Partial refunds

You can claim part of your refund and leave the rest for later:

```rust
programme.refund_partial(donor, 1_000)  // claim 1,000 tokens now
// ... wait ...
programme.refund(donor)  // claim the rest later
```

### Sweeps: what happens to unclaimed funds

**After `sweep_deadline`** (a grace period after the release window closes), any unclaimed refunds can be swept. Anyone can call `programme.sweep_unclaimed()` to transfer all remaining funds to the protocol treasury.

This ensures capital is not stranded forever if donors forget to claim.

#### Timeline

```
programme created
    ↓
contributions open
    ↓
application_deadline     ← applications close
    ↓
review_deadline          ← reviews close, awards finalized
    ↓
release_deadline         ← tranches stop releasing, refunds open
    ↓
sweep_deadline           ← unclaimed funds swept to treasury
```

The gap between `release_deadline` and `sweep_deadline` is the **grace period**. It gives donors time to claim refunds before the sweep.

---

## What cancellation does

The programme creator can call `programme.cancel()` at any time. Cancellation:

1. **Stops all forward progress**: No new contributions, applications, reviews, or releases
2. **Opens refunds immediately** (after the grace period for any pending releases)
3. **Does NOT reverse releases already made**: If a tranche was released before cancellation, the recipient keeps it

Cancellation does not forfeit your contribution — you still get a proportional refund of unreleased funds.

---

## What the verified payee list promises (and doesn't)

When a programme uses **Direct**, **Allocated**, or **Restricted** mode, the creator must verify payees by calling `programme.allow_payee(address)`. This creates a list of destinations funds can reach.

### What verification means

✅ The creator **explicitly approved** this address  
✅ Contracts **enforce** that tranches can only go to verified addresses (in Direct and Allocated modes)  
✅ You can **inspect the list** before contributing by calling `programme.allowed_payees()`

### What verification does NOT mean

❌ The payee is **legally registered** or **background-checked**  
❌ The payee **actually provides the service** claimed (verification is cryptographic, not legal)  
❌ The payee **cannot be removed** (the creator can call `disallow_payee` at any time)

Verification is a technical control: it ensures the recipient cannot redirect funds to an arbitrary address the creator never saw. It does **not** substitute for due diligence on the payee's identity or legitimacy.

---

## Security properties for funders

### The budget is never exceeded

The contract guarantees that total released funds never exceed `budget`. If awards are over-approved, later finalisations are rejected rather than over-committing.

### Refunds are proportional and complete

Every contributor receives exactly their proportional share of unreleased funds. The refund pool accounts for rounding dust: the last claimant receives whatever is left, preventing capital from being permanently stranded.

### Pausing does not delay refunds indefinitely

The creator can pause the programme to halt contributions, applications, and releases. **However**, pausing does NOT pause the ledger clock. The `release_deadline` and `sweep_deadline` are absolute wall-clock timestamps and continue to tick down during a pause.

This means:
- Donors are never held hostage by an indefinite pause
- Refunds and sweeps eventually happen even if the programme is paused
- If the creator needs more time for legitimate reasons, they must explicitly extend the `release_deadline` (auditable via events)

---

## Quick reference

| Term | Meaning |
|---|---|
| **Contribution** | Your deposit into the programme |
| **Protocol fee** | Percentage deducted from contributions (set at registry, not refundable) |
| **Budget** | Contributions minus the protocol fee (the awardable pool) |
| **Award** | A finalized allocation to a recipient, divided into tranches |
| **Tranche** | One installment of an award, released against an attestation |
| **Release window** | Time between `review_deadline` and `release_deadline` when tranches can unlock |
| **Unreleased pool** | Budget minus released tranches (what becomes refundable) |
| **Refund** | Your proportional share of the unreleased pool, claimable after `release_deadline` |
| **Grace period** | Time between `release_deadline` and `sweep_deadline` to claim refunds |
| **Sweep** | Unclaimed refunds transferred to treasury after `sweep_deadline` |

---

**Note:** This guide describes the on-chain mechanics. It is not tax or legal advice.
