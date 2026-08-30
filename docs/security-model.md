# Security Model and Trust Assumptions

Milepost is designed to decouple the flow of funds from the verification of milestones, minimizing trust where possible while explicitly defining the powers and blast radii of protocol roles.

This document outlines the roles within the system, their capabilities, and the implications of their compromise.

## Roles and Compromise Scenarios

### Registry Admin
- **Role**: Deploys programmes and authorises them to write to the `record` contract. Configures the protocol fee and treasury. Can upgrade the `registry` contract.
- **Capabilities**: Can change the protocol fee (up to `MAX_FEE_BPS` of 10%), change the treasury address, and deploy new programmes.
- **Blast Radius on Compromise**: A compromised admin could deploy malicious programmes that write fake standing to the `record` contract. They could also redirect the protocol fee to themselves and upgrade the registry to malicious logic.
- **Limits**: They cannot steal funds already locked in existing programmes or wallets. The standing already credited to recipients remains intact, though the integrity of new standing would be compromised.

### Record Admin
- **Role**: Authorises writers to the `record` (standing) contract. In practice, this is the `registry` itself. Can upgrade the `record` contract.
- **Capabilities**: Can add or remove writers (typically programmes).
- **Blast Radius on Compromise**: Could authorise a malicious writer to manufacture fake standing for any address. Can upgrade the `record` contract to malicious logic, destroying the trust model of the entire protocol.
- **Limits**: Cannot steal funds.

### Creator (Programme Creator)
- **Role**: Configures the rules of a specific programme (reviewers, verifiers, tranches, deadlines) during deployment.
- **Capabilities**: None after deployment. A creator configures the programme at instantiation but holds no ongoing administrative power over the funds or rules.
- **Blast Radius on Compromise**: Minimal. The creator cannot alter a programme after deployment, nor can they access its funds.

### Reviewers
- **Role**: Assess and accept/reject applications to a programme.
- **Capabilities**: Can admit applicants into the programme, allowing them to become recipients.
- **Blast Radius on Compromise**: Could admit unqualified applicants, allowing them to draw funds from the programme. 
- **Limits**: They cannot bypass tranche verifications or directly access the treasury.

### Verifiers
- **Role**: Attest that a recipient has completed a milestone, satisfying a tranche condition.
- **Capabilities**: Can issue attestations under the programme's schema via the `attest` registry.
- **Blast Radius on Compromise**: Could issue fake attestations, allowing malicious or non-compliant recipients to release funds prematurely. 
- **Limits**: Cannot steal funds themselves (unless colluding with a recipient), and cannot alter the programme rules.

### Policy Steward
- **Role**: Manages the allowlist of payees for a specific restricted policy.
- **Capabilities**: Can add or remove verified payees (e.g., specific schools, clinics, or merchants) that a restricted wallet is allowed to transfer funds to.
- **Blast Radius on Compromise**: Could allowlist their own addresses, effectively allowing them to drain restricted wallets (if colluding with the recipient) or forcing recipients to spend funds at the steward's malicious venues.
- **Limits**: The steward cannot initiate transfers from the recipient's wallet. They only dictate *where* the recipient is permitted to send funds.

### Donors (Funders)
- **Role**: Provide capital to programmes.
- **Capabilities**: Can fund programmes. Can sweep unused funds if a programme is cancelled or expires.
- **Blast Radius on Compromise**: Only their own uncommitted funds are at risk.
- **Limits**: They cannot influence the disbursement to recipients once they have funded a programme, except via standard protocol sweeps for incomplete tranches after deadlines.

### Recipients
- **Role**: Complete milestones and receive funds.
- **Capabilities**: Can trigger the release of funds from a programme upon producing a valid attestation. They control their own wallets.
- **Blast Radius on Compromise**: Their own funds and track record are at risk.
- **Limits**: They cannot bypass the rules of the programme or manufacture attestations.

---

## Restricted Mode vs. Wallet Control

Milepost uses a policy signer (`policy-spend`) to enforce restrictions on how a recipient can spend their funds (the `Restricted` tranche mode). 

**It is critical to understand that a policy constrains *one signer*, not the entire wallet.**

The policy contract ensures that a specific grant-funded signer can only authorise transfers of a specific asset to verified payees, within a spending cap. However, **the recipient controls the smart wallet.** 

If the recipient also holds an unrestricted admin signer on that same wallet, they can authorise transfers that bypass the policy entirely, or they can simply remove the restricted signer. The `policy-spend` contract does not and cannot prevent this.

**The smart wallet's own signer configuration is what must confine the funded signer to the policy.** If a deployment fails to configure the smart wallet correctly (e.g., leaving the recipient with an unrestricted admin key that controls the grant funds), the policy provides only the *appearance* of restriction, not the fact of it.
