# Error Code Reference

All contract errors across the five Milepost contracts, with causes and recommended caller actions. This is the source of truth for error codes and names, generated from the error enums in `contracts/*/src/lib.rs`.

---

## Reading this table

| Column | Meaning |
|--------|---------|
| Code | Numeric error code returned by the contract |
| Name | Rust variant name (also what you see in XDR/CLI output) |
| Kind | **Fault** — something went wrong; **Expected** — a normal outcome |
| Triggers | What conditions cause this error |
| Action | What the caller should do |

**Expected outcomes** are not bugs. `NothingToRefund`, for example, usually means a programme paid out fully and there is nothing left to refund — the call succeeded in the sense that it checked correctly.

---

## Why `SpendError` instead of `Error`

The `policy-spend` contract implements the smart wallet interface, which exports its own `Error` type. To avoid a name collision in the generated bindings, `policy-spend` uses `SpendError` as its error enum name.

If you are reading the client bindings and see `SpendError` where other contracts use `Error`, this is intentional — the codes and semantics follow the same pattern as all other contracts, just under a different name to satisfy the interface.

---

## Contract: attest

| Code | Name | Kind | Triggers | Action |
|------|------|------|---------|--------|
| 1 | `SchemaNotFound` | Fault | Attempting to use a schema UID that does not exist in the registry | Check the schema UID and ensure it was registered before attempting to attest or verify |
| 2 | `SchemaAlreadyExists` | Fault | Attempting to register a schema with an authority and definition that already exists | Use the existing schema UID instead of attempting to re-register |
| 3 | `AttestationNotFound` | Fault | Attempting to retrieve or operate on an attestation UID that does not exist | Verify the attestation UID is correct and has been created via `attest()` |
| 4 | `NotRevocable` | Fault | Attempting to revoke an attestation under a schema marked as non-revocable | No action — the schema was registered as immutable. Create a new attestation or use a different schema |
| 5 | `NotAttester` | Fault | Attempting to revoke an attestation that was not created by the caller | Only the original attester can revoke their own attestation. Contact the original attester |
| 6 | `AlreadyRevoked` | Expected | Attempting to revoke an attestation that has already been revoked | No action needed — the attestation is already revoked. Verify this is the intended attestation |
| 7 | `ExpiryInPast` | Fault | Attempting to create an attestation with an expiry timestamp before the current time | Use a future expiry time, or leave expiry unset if permanent |
| 8 | `AttesterNotAuthorized` | Fault | The schema restricts who may attest (marked `restricted`), and the caller is not on the authority's list | Ask the schema authority to add you, or use a different schema where anyone can attest |

---

## Contract: policy-spend

> **Note on naming**: This contract uses `SpendError` instead of `Error` because the smart wallet interface it implements exports its own `Error` type. The two names would collide in generated bindings; `SpendError` is the workaround. The codes and semantics follow the same pattern as other contracts.

| Code | Name | Kind | Triggers | Action |
|------|------|------|---------|--------|
| 1 | `NotConfigured` | Fault | Attempting to authorize a spend on a wallet that has no policy installed | Call `configure()` first to set up the policy with cap, period, steward, token, and payee list |
| 2 | `AlreadyConfigured` | Fault | Attempting to configure a wallet that already has a policy installed | Use `install()` to overwrite an existing configuration, or `uninstall()` first |
| 3 | `NotSteward` | Fault | Attempting to modify the allowlist when the caller is not the steward | Only the steward (configured at setup) can call `allow_payee()` and `deny_payee()` |
| 4 | `ForbiddenCall` | Fault | The signer tried to authorize something other than a token transfer (e.g. a contract call, swap, or other operation) | Only token transfers are permitted; the policy cannot authorize other operations |
| 5 | `PayeeNotAllowed` | Fault | The transfer's destination is not a verified payee in the policy's allowlist | Ask the steward to add this address via `allow_payee()`, or choose a payee from the allowlist |
| 6 | `CapExceeded` | Fault | The transfer would exceed the spending cap for the current period | Wait until the period resets (per the policy's `period` setting), or reduce the transfer amount |
| 7 | `ForbiddenTransfer` | Fault | The transfer moves someone else's funds, or uses a different asset than the policy allows | Ensure the wallet source matches the wallet being spent from, and the token matches the policy's token |
| 8 | `InvalidAmount` | Fault | The transfer amount is zero or negative | Use a positive amount |
| 9 | `InvalidCap` | Fault | Attempting to configure with a cap that is zero or negative | Set a strictly positive cap amount |
| 10 | `AlreadyPayee` | Fault | Attempting to allow a payee that is already on the allowlist | The payee is already permitted; no action needed |
| 11 | `NotPayee` | Fault | Attempting to deny a payee that is not on the allowlist | The payee was never allowed. Verify the address or ignore if not in the list |

---

## Contract: record

| Code | Name | Kind | Triggers | Action |
|------|------|------|---------|--------|
| 1 | `NotAuthorized` | Fault | The caller is not a registered writer (authorized by the registry when a programme is deployed), nor is the admin | Only registered writers or the admin can call `credit()` and `add_writer()`. The registry authorizes programmes as writers |
| 2 | `NotFound` | Fault | Attempting to retrieve standing for an address that has never received credits | No standing record exists yet for this address. Standing is only created on the first `credit()` call |
| 3 | `InvalidAmount` | Fault | Calling `credit()` with a zero or negative amount | Credits must be strictly positive; standing is append-only and cannot be decremented |
| 4 | `Overflow` | Fault | A `credit()` call would cause `total_received` to exceed `i128::MAX` | The standing record already has such a high total that adding more would overflow. This is a platform limit, not a policy limit |
| 5 | `AlreadyWriter` | Fault | Attempting to add a writer that is already registered | The address is already authorized as a writer. No action needed |
| 6 | `NotWriter` | Fault | Attempting to remove a writer that is not registered | The address was not a writer. Verify the address or ignore if already removed |

---

## Contract: registry

| Code | Name | Kind | Triggers | Action |
|------|------|------|---------|--------|
| 1 | `NotAuthorized` | Fault | The caller is not the admin when attempting to modify protocol configuration | Only the admin can call `set_fee()`, `set_policy()`, `set_treasury()`, `set_admin()`, and `set_program_wasm()`. Ask the admin to make the change |
| 2 | `FeeTooHigh` | Fault | Attempting to set a fee that exceeds 1000 basis points (10%) | Use a fee between 0 and 1000 bps inclusive. 1000 bps = 10% |
| 3 | `NotInitialized` | Fault | Attempting to read or use configuration before the registry has been constructed | Call `__constructor()` first with admin, treasury, attestation registry, standing contract, policy, fee, and wasm hash |

---

## Contract: program

| Code | Name | Kind | Triggers | Action |
|------|------|------|---------|--------|
| 1 | `NotAuthorized` | Fault | The caller lacks authorization for this operation (e.g., attempting operations only the creator can perform) | Verify you are the caller with the required authority for the operation |
| 2 | `WrongPhase` | Fault | The action does not belong to the programme's current phase (e.g., trying to apply after contributions close) | Wait for the correct phase, or check the current phase with `get_phase()` |
| 3 | `InvalidAmount` | Fault | An amount is zero, negative, or otherwise invalid for the operation | Use a positive amount |
| 4 | `InvalidDeadlines` | Fault | Deadlines are not in ascending order (apply ≥ review ≥ release ≥ sweep) | Ensure `apply_deadline < review_deadline < release_deadline < sweep_deadline` |
| 5 | `InvalidQuorum` | Fault | Quorum exceeds the number of reviewers, making approval impossible | Set quorum to at most the number of reviewers provided |
| 6 | `FeeTooHigh` | Fault | An award fee exceeds the protocol maximum (typically 1000 bps from the registry) | This is a configuration issue; contact the protocol admin |
| 7 | `NoReviewers` | Fault | Attempting to create a programme with an empty reviewer list | Provide at least one reviewer address |
| 8 | `ApplicationNotFound` | Fault | Attempting to operate on an application that does not exist | Verify the applicant address has applied via `apply()` |
| 9 | `AlreadyApplied` | Fault | An applicant attempts to apply twice | Only one application per applicant per programme. Review or withdraw the existing application |
| 10 | `AlreadyReviewed` | Fault | A reviewer attempts to vote on the same applicant twice | Only one vote per reviewer per application. Update your vote through the normal re-vote mechanism if the contract supports it, or wait for finalization |
| 11 | `ExceedsRequested` | Fault | A reviewer is approving more than the applicant asked for | Approving more than requested is not permitted. Reduce the amount to the requested value or below |
| 12 | `QuorumNotReached` | Fault | Attempting to finalize an application before enough reviewers have voted | Wait for more reviewers to vote until quorum is met, or check the current vote count |
| 13 | `AlreadyFinalized` | Fault | Attempting to finalize an application that has already been finalized | The application award is already settled; the amount cannot change |
| 14 | `InsufficientBudget` | Fault | The remaining budget cannot cover this award | Finalize lower amounts first, or wait for remaining budget to be swept and added back |
| 15 | `Overflow` | Fault | An arithmetic operation would exceed `i128::MAX` | The amounts involved are too large; this is a platform limit |
| 16 | `Cancelled` | Fault | The programme has been cancelled and operations cannot proceed | No further actions are possible on a cancelled programme |
| 17 | `NotCancellable` | Fault | Attempting to cancel a programme that has money in it or awards made | Only programmes with zero contributions and zero awards can be cancelled |
| 18 | `NoVerifiers` | Fault | Attempting to create a programme with an empty verifier list | Provide at least one verifier address |
| 19 | `AwardNotFound` | Fault | Attempting to operate on an award for a recipient that does not exist | Verify the recipient has been awarded via `finalize()` |
| 20 | `AwardFullyReleased` | Fault | Attempting to release a tranche when all tranches for this award have already been released | All allocations for this recipient have been claimed. No more can be released |
| 21 | `AttestationInvalid` | Fault | The attestation is missing, revoked, expired, or is not a claim by this attester about this recipient under this programme's schema | Verify the attestation UID is correct, active, not expired, and matches the recipient and verifier |
| 22 | `AttestationAlreadyUsed` | Fault | One proof unlocks one tranche; this attestation has already been spent | Each attestation unlocks exactly one tranche. Use a different attestation for another tranche |
| 23 | `ReleaseWindowClosed` | Fault | The release window (from review close to release deadline) has ended | Releases are only possible during the configured window. Check the deadline |
| 24 | `FeeAlreadySwept` | Fault | Attempting to sweep fees when they have already been swept | Fees are swept once per programme. They are no longer available |
| 25 | `RefundsNotOpen` | Fault | Attempting to refund before the release window has closed | Wait until the release deadline to allow refunds |
| 26 | `AlreadyRefunded` | Expected | A donor attempts to claim a refund twice | No action needed — this donor has already received their refund |
| 27 | `NothingToRefund` | Expected | A donor has no unclaimed refund (they did not contribute, or they already claimed, or all funds were allocated) | No action needed — this is a normal outcome. If expected to have a refund, verify the donor address |
| 28 | `SweepNotOpen` | Fault | Attempting to sweep unclaimed funds before the sweep window opens (after the release deadline) | Wait for the sweep deadline to allow sweeping of remaining funds |
| 29 | `NothingToSweep` | Expected | Attempting to sweep when all funds have been claimed or there is nothing left | No action needed — this is a normal outcome. All money has been distributed |
| 30 | `PayeeNotVerified` | Fault | The destination is not a payee this programme has verified | Only addresses added by `allow_payee()` can receive funds. Ask the creator to verify this payee |
| 31 | `AlreadyPayee` | Fault | Attempting to verify a payee that is already verified | The payee is already permitted; no action needed |
| 32 | `NotPayee` | Fault | Attempting to deny a payee that is not verified | The payee was never verified. No action needed |
| 33 | `InsufficientAllocation` | Fault | The recipient has no allocation, or not enough of one (for Allocated mode) | The recipient must have an award finalized first, or the allocation is too small. Increase the award or check that it was finalized |
| 34 | `PolicyNotInstalled` | Fault | A Restricted award was released to a wallet with no policy installed | The recipient must install the policy-spend contract policy before `release()` can send a Restricted tranche. Ask the recipient to configure their wallet |
| 35 | `SpendWindowClosed` | Fault | Allocations can no longer be directed once the sweep window opens | Directed allocations (moving money from escrow to a payee) must happen before the sweep deadline. Finalize your allocation before the window closes |

---

## Full index (all contracts)

Alphabetical cross-reference across all contracts:

| Name | Contract | Code | Kind |
|------|----------|------|------|
| `AlreadyApplied` | program | 9 | Fault |
| `AlreadyConfigured` | policy-spend | 2 | Fault |
| `AlreadyFinalized` | program | 13 | Fault |
| `AlreadyPayee` | policy-spend | 10 | Fault |
| `AlreadyPayee` | program | 31 | Fault |
| `AlreadyRefunded` | program | 26 | Expected |
| `AlreadyRevoked` | attest | 6 | Expected |
| `AlreadyReviewed` | program | 10 | Fault |
| `AlreadyWriter` | record | 5 | Fault |
| `ApplicationNotFound` | program | 8 | Fault |
| `AwardFullyReleased` | program | 20 | Fault |
| `AwardNotFound` | program | 19 | Fault |
| `AttestationAlreadyUsed` | program | 22 | Fault |
| `AttestationInvalid` | program | 21 | Fault |
| `AttestationNotFound` | attest | 3 | Fault |
| `AttesterNotAuthorized` | attest | 8 | Fault |
| `Cancelled` | program | 16 | Fault |
| `CapExceeded` | policy-spend | 6 | Fault |
| `ExceedsRequested` | program | 11 | Fault |
| `ExpiryInPast` | attest | 7 | Fault |
| `FeeAlreadySwept` | program | 24 | Fault |
| `FeeTooHigh` | program | 6 | Fault |
| `FeeTooHigh` | registry | 2 | Fault |
| `ForbiddenCall` | policy-spend | 4 | Fault |
| `ForbiddenTransfer` | policy-spend | 7 | Fault |
| `InsufficientAllocation` | program | 33 | Fault |
| `InsufficientBudget` | program | 14 | Fault |
| `InvalidAmount` | policy-spend | 8 | Fault |
| `InvalidAmount` | program | 3 | Fault |
| `InvalidAmount` | record | 3 | Fault |
| `InvalidCap` | policy-spend | 9 | Fault |
| `InvalidDeadlines` | program | 4 | Fault |
| `InvalidQuorum` | program | 5 | Fault |
| `NoReviewers` | program | 7 | Fault |
| `NoVerifiers` | program | 18 | Fault |
| `NotAttester` | attest | 5 | Fault |
| `NotAuthorized` | attest | (none - see `NotAttester`) | — |
| `NotAuthorized` | policy-spend | (none - see `NotSteward`) | — |
| `NotAuthorized` | program | 1 | Fault |
| `NotAuthorized` | record | 1 | Fault |
| `NotAuthorized` | registry | 1 | Fault |
| `NotCancellable` | program | 17 | Fault |
| `NotConfigured` | policy-spend | 1 | Fault |
| `NotFound` | record | 2 | Fault |
| `NotInitialized` | registry | 3 | Fault |
| `NotPayee` | policy-spend | 11 | Fault |
| `NotPayee` | program | 32 | Fault |
| `NotRevocable` | attest | 4 | Fault |
| `NotSteward` | policy-spend | 3 | Fault |
| `NotWriter` | record | 6 | Fault |
| `NothingToRefund` | program | 27 | Expected |
| `NothingToSweep` | program | 29 | Expected |
| `Overflow` | program | 15 | Fault |
| `Overflow` | record | 4 | Fault |
| `PayeeNotAllowed` | policy-spend | 5 | Fault |
| `PayeeNotVerified` | program | 30 | Fault |
| `PolicyNotInstalled` | program | 34 | Fault |
| `QuorumNotReached` | program | 12 | Fault |
| `RefundsNotOpen` | program | 25 | Fault |
| `ReleaseWindowClosed` | program | 23 | Fault |
| `SchemaAlreadyExists` | attest | 2 | Fault |
| `SchemaNotFound` | attest | 1 | Fault |
| `SpendWindowClosed` | program | 35 | Fault |
| `SweepNotOpen` | program | 28 | Fault |
| `WrongPhase` | program | 2 | Fault |

