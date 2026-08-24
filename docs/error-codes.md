# Error Code Reference

This document catalogs error variants and numeric error codes across all Milepost Soroban smart contracts.

## Overview

When a Soroban contract invocation reverts, the transaction returns an error code corresponding to the enum variant integer defined in `#[contracterror]`.

> [!NOTE]
> `policy-spend` exports `SpendError` instead of `Error` to prevent identifier collisions with the smart wallet interface error exports.

---

## 1. Attestation Contract (`attest`)

| Code | Variant | Cause | Recommended Action |
| :--- | :--- | :--- | :--- |
| `1` | `SchemaNotFound` | The requested schema identifier does not exist. | Verify the schema ID passed to the contract. |
| `2` | `SchemaAlreadyExists` | A schema with this ID has already been registered. | Use a unique schema identifier. |
| `3` | `AttestationNotFound` | The attestation record was not found. | Check the attestation UID. |
| `4` | `NotRevocable` | The schema defines attestations as permanent and non-revocable. | Do not attempt revocation on non-revocable schemas. |
| `5` | `NotAttester` | The caller is not the entity that issued the attestation. | Only the original attester can revoke or modify an attestation. |
| `6` | `AlreadyRevoked` | The attestation has already been revoked. | Check status before submitting revocation. |
| `7` | `ExpiryInPast` | Provided expiration timestamp is prior to the current ledger time. | Set an expiration timestamp in the future. |
| `8` | `AttesterNotAuthorized` | Schema restricts authorized attesters, and caller is not allowlisted. | Add attester address to authorized schema list. |

---

## 2. Policy Spend Contract (`policy-spend`)

*Enum: `SpendError`*

| Code | Variant | Cause | Recommended Action |
| :--- | :--- | :--- | :--- |
| `1` | `NotConfigured` | The policy contract has not been initialized. | Call initialization function with steward configuration. |
| `2` | `AlreadyConfigured` | Policy initialization was called more than once. | Avoid re-initializing active policy instances. |
| `3` | `NotSteward` | Caller is not the designated policy steward. | Invoke from the authorized steward account. |
| `4` | `ForbiddenCall` | Invocation attempted an unauthorized contract call. | Restrict operations to valid token transfer signatures. |
| `5` | `PayeeNotAllowed` | Destination address is not in the approved payee list. | Add destination to approved payees before transfer. |
| `6` | `CapExceeded` | Transfer exceeds the configured spending cap for the current period. | Split transfer or wait for next period reset. |
| `7` | `ForbiddenTransfer` | Transfer attempts to move unauthorized assets or third-party funds. | Check source account and asset parameters. |
| `8` | `InvalidAmount` | Transfer amount is zero or negative. | Specify a positive transfer amount. |
| `9` | `InvalidCap` | Periodic spending cap parameter is non-positive. | Supply a valid cap value. |
| `10` | `AlreadyPayee` | Payee address is already registered. | Check payee registry before adding. |
| `11` | `NotPayee` | Target address is not registered as a payee. | Verify payee status prior to removal. |

---

## 3. Programme Contract (`program`)

| Code | Variant | Cause | Recommended Action |
| :--- | :--- | :--- | :--- |
| `1` | `NotAuthorized` | Caller lacks administrative or operational permissions. | Verify caller signatures and roles. |
| `2` | `WrongPhase` | Invocation is invalid for the current programme lifecycle phase. | Check phase transition milestones. |
| `3` | `InvalidAmount` | Allocation or award amount is invalid. | Provide a positive non-zero balance. |
| `4` | `InvalidDeadlines` | Application or review deadline timestamps are misconfigured. | Ensure chronological ordering of deadline dates. |
| `5` | `InvalidQuorum` | Required reviewer threshold is zero or exceeds reviewer count. | Set achievable quorum parameters. |
| `6` | `FeeTooHigh` | Administrative fee percentage exceeds maximum protocol limits. | Reduce fee parameters within acceptable threshold. |
| `7` | `NoReviewers` | Operation requires reviewers, but none are registered. | Register reviewers before opening review phase. |
| `8` | `ApplicationNotFound` | Specified application ID does not exist. | Verify application submission ID. |
| `9` | `AlreadyApplied` | Applicant has already submitted an active application. | Avoid duplicate submissions per applicant. |
| `10` | `AlreadyReviewed` | Reviewer has already submitted a score for this application. | Prevent duplicate voting. |
| `11` | `ExceedsRequested` | Approved award amount exceeds requested allocation. | Bound award to requested total. |
| `12` | `QuorumNotReached` | Review threshold not met for final settlement. | Await additional reviewer votes. |
| `13` | `AlreadyFinalized` | Programme or application settlement is already complete. | Prevent re-finalization. |
| `14` | `InsufficientBudget` | Remaining programme budget cannot cover requested award. | Check pool liquidity. |
| `15` | `Overflow` | Numeric calculation exceeded `i128::MAX`. | Scale allocation arithmetic safely. |
| `16` | `Cancelled` | Programme has been marked as cancelled. | Cease operations on cancelled programmes. |
| `17` | `NotCancellable` | Programme cannot be cancelled after funds or awards are disbursed. | Follow standard completion procedures. |
| `18` | `NoVerifiers` | No verifier contracts configured for attestation release. | Configure verifier addresses. |
| `19` | `AwardNotFound` | Award allocation record not found. | Check award index. |
| `20` | `AwardFullyReleased` | All allocation tranches have already been disbursed. | No further releases permitted. |
| `21` | `AttestationInvalid` | Attestation is expired, revoked, or non-matching. | Submit valid verified attestation. |
| `22` | `AttestationAlreadyUsed` | Attestation UID has already unlocked a tranche. | Provide a new unique attestation. |
| `23` | `ReleaseWindowClosed` | Release deadline window has expired. | Request tranche unlock before window closes. |
| `24` | `FeeAlreadySwept` | Protocol fee has already been collected. | Avoid redundant fee sweep calls. |
| `25` | `RefundsNotOpen` | Refund window is not active. | Wait for refund trigger condition. |
| `26` | `AlreadyRefunded` | Donor has already claimed a refund. | Prevent duplicate refund claims. |
| `27` | `NothingToRefund` | Donor address has zero refundable contributions. | Verify donor contribution balance. |
| `28` | `SweepNotOpen` | Grace period for donor refunds has not elapsed. | Await expiration of sweep delay. |
| `29` | `NothingToSweep` | Unallocated balance is zero. | Verify contract token balance. |
| `30` | `PayeeNotVerified` | Destination is not a verified payee for this programme. | Complete payee verification. |
| `31` | `AlreadyPayee` | Destination address is already registered as a payee. | Check payee list before adding. |
| `32` | `NotPayee` | Target is not an approved payee. | Verify payee registration status. |
| `33` | `InsufficientAllocation` | Recipient lacks sufficient allocation for this transfer. | Check remaining recipient balance. |
| `34` | `PolicyNotInstalled` | Restricted award released to wallet without smart wallet policy. | Deploy smart wallet spend policy. |
| `35` | `SpendWindowClosed` | Directed allocation window closed following sweep opening. | Execute spends within active period. |

---

## 4. Standing Record Contract (`record`)

| Code | Variant | Cause | Recommended Action |
| :--- | :--- | :--- | :--- |
| `1` | `NotAuthorized` | Caller is not an authorized writer or admin. | Verify writer permissions. |
| `2` | `NotFound` | No standing record exists for address. | Create initial standing record. |
| `3` | `InvalidAmount` | Standing credits must be positive and non-decreasing. | Supply positive credit delta. |
| `4` | `Overflow` | Total received credits would exceed integer bounds. | Check maximum standing limits. |
| `5` | `AlreadyWriter` | Writer address is already authorized. | Prevent duplicate writer registration. |
| `6` | `NotWriter` | Address is not in writer list. | Verify writer status prior to removal. |

---

## 5. Registry Contract (`registry`)

| Code | Variant | Cause | Recommended Action |
| :--- | :--- | :--- | :--- |
| `1` | `NotAuthorized` | Caller lacks administrative registry authority. | Ensure admin signer is attached. |
| `2` | `FeeTooHigh` | Registration fee exceeds protocol maximum. | Adjust registration fee parameter. |
| `3` | `NotInitialized` | Registry contract has not been initialized. | Call initialization endpoint before use. |
