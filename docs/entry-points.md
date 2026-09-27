# Entry Point Reference

Every public function across the five Milepost contracts, with who must authorise it, which phase it works in, pause behaviour, and failure modes.

---

## Registry (`contracts/registry/src/lib.rs`)

| Function | Authorises | Phase | Pause-safe | Errors |
|---|---|---|---|---|
| `initialize(treasury, fee_bps, attest_addr, record_addr)` | Admin (deployer) | Once only | N/A | `AlreadyInitialized` |
| `set_treasury(new_treasury)` | Admin | Any | Yes | `NotAdmin` |
| `set_fee_bps(new_fee)` | Admin | Any | Yes | `NotAdmin`, `InvalidFee` |
| `deploy_programme(...)` | Admin | Any | Yes | `NotAdmin`, `InvalidAddress` |
| `pause()` | Admin | Any | N/A | `NotAdmin` |
| `unpause()` | Admin | Any | N/A | `NotAdmin` |

---

## Programme (`contracts/program/src/lib.rs`)

| Function | Authorises | Phase | Pause-safe | Errors |
|---|---|---|---|---|
| `contribute(amount)` | Contributor | Open | Yes | `WrongPhase`, `InvalidAmount`, `ProgrammeCancelled` |
| `apply(requested)` | Applicant | Open | Yes | `WrongPhase`, `InvalidAmount`, `AlreadyApplied`, `ProgrammeCancelled` |
| `review(application_id, approved_amount)` | Reviewer | Review | Yes | `WrongPhase`, `NotReviewer`, `ExceedsRequested`, `ApplicationNotFound` |
| `finalize(application_id)` | Permissionless | Review | Yes | `WrongPhase`, `QuorumNotReached`, `AlreadyFinalized`, `InsufficientBudget`, `ProgrammeCancelled` |
| `release(tranche_id, attestation_id)` | Permissionless | Settled | Yes | `WrongPhase`, `TrancheNotFound`, `AttestationAlreadyUsed`, `AttestationInvalid` |
| `spend(award_id, amount, payee)` | Recipient | Settled | Yes | `WrongPhase`, `AwardNotFound`, `InsufficientBalance`, `PayeeNotVerified` |
| `refund(contribution_id)` | Contributor | Post-release/sweep | Yes | `WrongPhase`, `ContributionNotFound`, `RefundAlreadyProcessed` |
| `sweep()` | Permissionless | Post-sweep | Yes | `WrongPhase`, `NoSweepableBudget` |
| `extend_release_deadline(new_deadline)` | Creator | Settled | Yes | `WrongPhase`, `DeadlineTooEarly`, `DeadlineTooLate` |
| `pause()` | Creator | Any | N/A | `NotCreator` |
| `unpause()` | Creator | Any | N/A | `NotCreator` |

---

## Attest (`contracts/attest/src/lib.rs`)

| Function | Authorises | Phase | Pause-safe | Errors |
|---|---|---|---|---|
| `register_schema(name, fields)` | Admin | Any | Yes | `NotAdmin`, `SchemaAlreadyExists` |
| `attest(schema_name, subject, data)` | Attester | Any | Yes | `NotAttester`, `SchemaNotFound`, `InvalidData` |
| `verify(schema_name, subject, attestation_id)` | Permissionless | Any | Yes | `SchemaNotFound`, `AttestationNotFound`, `AttestationExpired` |

---

## Record (`contracts/record/src/lib.rs`)

| Function | Authorises | Phase | Pause-safe | Errors |
|---|---|---|---|---|
| `write_standing(recipient, programme_id, key, value)` | Registry (admin) | Any | Yes | `NotAdmin`, `InvalidKey` |
| `read_standing(recipient, key)` | Permissionless | Any | Yes | None |

---

## Policy Spend (`contracts/policy-spend/src/lib.rs`)

| Function | Authorises | Phase | Pause-safe | Errors |
|---|---|---|---|---|
| `configure(asset, payees, cap)` | Recipient | Any | Yes | `NotRecipient`, `InvalidAsset`, `InvalidCap` |
| `spend(amount, payee)` | Recipient (policy signer) | Any | Yes | `ExceedsCap`, `PayeeNotVerified`, `WrongAsset`, `NotPolicySigner` |
| `read_config()` | Permissionless | Any | Yes | None |

---

## Notes

- **Permissionless functions** (`finalize`, `release`, `sweep`, `verify`, `read_standing`, `read_config`) require no authorisation by design — this is documented, not a bug.
- **Pause blocks** the forward money-path (`contribute`, `apply`, `review`, `finalize`, `spend`, `release`) but not reads, refunds, or sweeps.
- All error codes are defined in each contract's `errors.rs` and mapped to human messages in `frontend/src/lib/errors.ts`.

---

## Linked from

- [README.md](../README.md)
- [error-code-reference.md](./error-code-reference.md)
