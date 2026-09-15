# Glossary

This glossary explains the terms Milepost uses in the way the project actually relies on them: as the language of grant disbursement on Stellar and Soroban, not as a general dictionary.

- Allocation — The share of a grant reserved before it is directed to a destination. It matters because the same award can be held in escrow, released in stages, or paid out directly instead of moving as one lump sum.
- Anchor — A regulated service that connects Stellar to banks, cash, or mobile-money rails. It matters because recipients need a route from on-chain value into local cash or bank payments.
- Application — A request for funding that includes the amount the applicant needs. It matters because the application is only the request; the final award is decided later by reviewers and budget constraints.
- Attestation — A signed statement from a verifier that a condition has been met for a specific recipient. It matters because tranche release only succeeds when the attestation proves the right condition under the right schema.
- Award — The amount the programme settles on after reviewing applications. It matters because the award is binding and can later be released as one or more tranches.
- Condition — A concrete outcome the programme cares about, such as enrolment, a completed shift, or a delivered milestone. It matters because a verifier checks a defined condition rather than a vague claim.
- Direct mode — A payout rule where funds go straight to a fixed destination without any later recipient choice. It matters because it is the simplest way to send funds while preventing arbitrary transfers.
- Donor — A person or organisation that contributes funds to a programme. It matters because donors set the budget while reviewers and verifiers decide what the money should pay for.
- Fee sponsorship — A Stellar feature that lets a payer cover the transaction fees for another address. It matters because recipients do not need to hold XLM just to receive funding.
- Instance storage — Soroban storage attached to the deployed contract instance itself. It matters because contract-wide configuration and high-value totals live there and are shared by all users of that deployment.
- Median award — The middle value in a sorted set of reviewer amounts. It matters because Milepost uses the median to avoid one cautious or extreme vote dominating the result.
- Mode — The rule that decides where funds may go and how much recipient choice remains. It matters because the same grant can be disbursed very differently depending on the mode.
- Passkey smart wallet — A wallet whose owner authenticates with a passkey instead of a seed phrase. It matters because onboarding is easier for people who are not comfortable managing recovery phrases.
- Payee — A wallet, business, or institution that is verified as an allowed destination. It matters because the protocol can pay a verified payee directly or let the recipient choose among verified destinations.
- Persistent storage — Soroban state that survives across ledger entries and must be refreshed to avoid archival. It matters because programme and standing records are intentionally kept readable over time.
- Policy signer — A smart-wallet signer that enforces a spending limit or allowlist. It matters because a recipient can receive funds but still be prevented from sending them to arbitrary destinations.
- Programme — One funding round with its own budget, applications, rules, and disbursement settings. It matters because the protocol is designed around separate programmes rather than one universal grant pool.
- Quorum — The minimum number of reviewer votes required to finalize an award. It matters because a programme cannot settle on an outcome without enough independent approval.
- Recipient — The person or organisation seeking funding and later receiving payouts. It matters because the protocol tracks their standing and verifies the conditions they are meant to meet.
- Reviewer — A configured voter who approves an amount up to the amount requested by the applicant. It matters because reviewers decide the award size, while verifiers decide whether money can be released.
- SAC — A Stellar Asset Contract, the standard token interface for assets on Stellar that work with Soroban contracts. It matters because a programme can move other assets without custom token logic.
- Schema — The definition of what a verifier is allowed to attest about a recipient. It matters because the protocol checks the proof against the correct schema rather than accepting any signed statement.
- SEP-24 — A Stellar hosted flow for depositing or withdrawing value through an anchor. It matters because it is one of the common ways a recipient can convert on-chain value to local cash or bank funds.
- SEP-31 — A Stellar hosted transfer flow for anchor-backed value movement. It matters because it supports the same product goal as SEP-24: moving value into a local channel without forcing recipients to self-custody crypto.
- Standing — A portable summary of how much a recipient has already received and across how many tranches. It matters because later funders can underwrite a recipient without replaying every earlier payment.
- State archival — Soroban's process of archiving old storage entries after they age out of TTL. It matters because archived entries read as absent until they are restored or refreshed.
- Stroop — One ten-millionth of an XLM, the smallest unit used in Stellar amounts. It matters because fee and amount calculations often operate in stroops rather than whole XLM.
- Strkey — The address format Stellar uses for account IDs and other public identifiers. It matters because on-chain addresses are not arbitrary strings; they are structured identifiers.
- TTL — Time-to-live, the ledger lifetime a Soroban storage entry is allowed to keep before it ages out. It matters because live entries must be bumped or refreshed or they can become unreadable.
- Tranche — One instalment of a larger award that unlocks only when its proof is valid. It matters because grants can be released as milestones are met instead of all at once.
- Verifier — A trusted signer who confirms that a recipient met a stated condition. It matters because the verifier is a separate role from the reviewer: reviewers set the amount, verifiers unlock the payment.
- Wasm hash — The hash of a compiled Soroban contract binary. It matters because a deployed programme is tied to the exact Wasm code it was instantiated from.

## Related reading

- [README](../README.md)
- [docs/ttl-strategy.md](ttl-strategy.md)
- [contracts/attest/README.md](../contracts/attest/README.md)
- [contracts/record/README.md](../contracts/record/README.md)
- [contracts/policy-spend/README.md](../contracts/policy-spend/README.md)
