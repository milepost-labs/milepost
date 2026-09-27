# Contract Events Reference

Every event emitted by the five Milepost contracts, with the call that emits it, topics, fields with types, and example payloads.

Events are `#[contractevent]` structs in Soroban. Each field arrives in `event.data` under its Rust name.

---

## Registry Events

### `RegistryCreated`
- **Emitted by:** `initialize()`
- **Topics:** `["created"]`
- **Fields:**
  - `admin: Address` — deployer address
  - `treasury: Address` — treasury address
  - `fee_bps: u32` — protocol fee in basis points

### `ConfigUpdated`
- **Emitted by:** `set_treasury()`, `set_fee_bps()`
- **Topics:** `["config"]`
- **Fields:**
  - `treasury: Address`
  - `fee_bps: u32`

---

## Programme Events

### `Contributed`
- **Emitted by:** `contribute()`
- **Topics:** `["contrib"]`
- **Fields:**
  - `programme_id: u64`
  - `contributor: Address`
  - `amount: i128`

### `Applied`
- **Emitted by:** `apply()`
- **Topics:** `["applied"]`
- **Fields:**
  - `programme_id: u64`
  - `applicant: Address`
  - `requested: i128`

### `Reviewed`
- **Emitted by:** `review()`
- **Topics:** `["reviewed"]`
- **Fields:**
  - `programme_id: u64`
  - `reviewer: Address`
  - `application_id: u64`
  - `approved_amount: i128`

### `VoteAmended`
- **Emitted by:** `review()` (when reviewer changes their vote)
- **Topics:** `["vote_amended"]`
- **Fields:**
  - `programme_id: u64`
  - `reviewer: Address`
  - `application_id: u64`
  - `new_amount: i128`

### `Awarded`
- **Emitted by:** `finalize()`
- **Topics:** `["awarded"]`
- **Fields:**
  - `programme_id: u64`
  - `application_id: u64`
  - `recipient: Address`
  - `amount: i128`
  - `mode: u32` — 0=Direct, 1=Allocated, 2=Restricted

### `TrancheReleased`
- **Emitted by:** `release()`
- **Topics:** `["released"]`
- **Fields:**
  - `programme_id: u64`
  - `award_id: u64`
  - `tranche_id: u64`
  - `amount: i128`

### `BatchReleased`
- **Emitted by:** `release()` (batch mode)
- **Topics:** `["released_batch"]`
- **Fields:**
  - `programme_id: u64`
  - `award_id: u64`
  - `count: u32`

### `DeadlineExtended`
- **Emitted by:** `extend_release_deadline()`
- **Topics:** `["deadline"]`
- **Fields:**
  - `programme_id: u64`
  - `new_deadline: u64`

### `FeeDeducted`
- **Emitted by:** `contribute()`
- **Topics:** `["fee"]`
- **Fields:**
  - `programme_id: u64`
  - `amount: i128`

### `Refunded`
- **Emitted by:** `refund()`
- **Topics:** `["refunded"]`
- **Fields:**
  - `programme_id: u64`
  - `contributor: Address`
  - `amount: i128`

### `PayeeRegistered`
- **Emitted by:** payee registration
- **Topics:** `["payee"]`
- **Fields:**
  - `payee: Address`

### `Allocated`
- **Emitted by:** `spend()` (Allocated mode)
- **Topics:** `["allocd"]`
- **Fields:**
  - `programme_id: u64`
  - `award_id: u64`
  - `recipient: Address`
  - `payee: Address`
  - `amount: i128`

### `DirectPayment`
- **Emitted by:** `spend()` (Direct mode)
- **Topics:** `["directd"]`
- **Fields:**
  - `programme_id: u64`
  - `award_id: u64`
  - `payee: Address`
  - `amount: i128`

### `Swept`
- **Emitted by:** `sweep()`
- **Topics:** `["swept"]`
- **Fields:**
  - `programme_id: u64`
  - `amount: i128`

### `VerifierChanged`
- **Emitted by:** verifier management
- **Topics:** `["verifier_changed"]`
- **Fields:**
  - `programme_id: u64`
  - `verifier: Address`

### `Cancelled`
- **Emitted by:** `cancel()`
- **Topics:** `["cancelled"]`
- **Fields:**
  - `programme_id: u64`

### `ProgrammeCreated`
- **Emitted by:** `deploy_programme()` (Registry)
- **Topics:** `["created"]`
- **Fields:**
  - `programme_id: u64`
  - `creator: Address`

### `AwardKept`
- **Emitted by:** award keep/release logic
- **Topics:** `["kept"]`
- **Fields:**
  - `programme_id: u64`
  - `award_id: u64`

### `Paused`
- **Emitted by:** `pause()`
- **Topics:** `["paused"]`

### `Unpaused`
- **Emitted by:** `unpause()`
- **Topics:** `["unpaused"]`

### `Withdrawn`
- **Emitted by:** fund withdrawal
- **Topics:** `["withdrawn"]`
- **Fields:**
  - `programme_id: u64`
  - `amount: i128`

---

## Attest Events

### `SchemaRegistered`
- **Emitted by:** `register_schema()`
- **Topics:** `["schema"]`
- **Fields:**
  - `name: Symbol`
  - `fields: Vec<Symbol>`

### `AttestationCreated`
- **Emitted by:** `attest()`
- **Topics:** `["attest"]`
- **Fields:**
  - `schema_name: Symbol`
  - `subject: Address`
  - `attestation_id: u64`
  - `attester: Address`

### `AttestationRevoked`
- **Emitted by:** `revoke()`
- **Topics:** `["revoke"]`
- **Fields:**
  - `schema_name: Symbol`
  - `attestation_id: u64`

---

## Record Events

### `StandingWritten`
- **Emitted by:** `write_standing()`
- **Topics:** `["credit"]`
- **Fields:**
  - `recipient: Address`
  - `programme_id: u64`
  - `key: Symbol`
  - `value: i128`

### `WriterChanged`
- **Emitted by:** writer management
- **Topics:** `["writer"]`
- **Fields:**
  - `writer: Address`
  - `granted: bool`

### `AdminChanged`
- **Emitted by:** admin management
- **Topics:** `["admin"]`
- **Fields:**
  - `admin: Address`

---

## Policy Spend Events

### `PolicyConfigured`
- **Emitted by:** `configure()`
- **Topics:** `["configd"]`
- **Fields:**
  - `asset: Address`
  - `cap: i128`

### `PayeeAdded`
- **Emitted by:** `add_payee()`
- **Topics:** `["payee"]`
- **Fields:**
  - `payee: Address`

### `PolicySpend`
- **Emitted by:** `spend()`
- **Topics:** `["spent"]`
- **Fields:**
  - `amount: i128`
  - `payee: Address`

---

## Example payload

From `program` test — `Awarded` event:

```json
{
  "programme_id": 1,
  "application_id": 3,
  "recipient": "GABC...",
  "amount": 5000000000,
  "mode": 1
}
```

---

## Linked from

- [README.md](../README.md)
- [entry-points.md](./entry-points.md)
