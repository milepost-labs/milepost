# Security Policy

## Disclosure Process & Reporting Route

We take the security of Milepost smart contracts and protocol infrastructure seriously. If you discover a security vulnerability, please report it responsibly rather than disclosing it publicly or opening a public GitHub issue.

### How to Report
- **Preferred Method**: Use [GitHub Private Vulnerability Reporting](https://github.com/milepost-labs/milepost/security/advisories/new) under the repository's **Security** tab.
- **Alternative Contact**: Email security disclosures to `security@milepost.io` with full details of the vulnerability.

Please include:
- A detailed description of the vulnerability and its potential impact.
- Step-by-step instructions or proof-of-concept (PoC) code to reproduce the issue safely.
- Any suggested mitigations or remediation steps if available.

---

## Expected Response & Timeline

We aim to handle all security reports with honesty and transparency:
- **Acknowledgement**: We will acknowledge receipt of your report within **48 hours**.
- **Initial Assessment**: We will assess the issue and provide a status update within **7 business days**.
- **Resolution**: Once a fix is verified, we will coordinate public disclosure and release notes with you.

*Note: These response targets represent realistic expectations rather than strict contractual SLAs.*

---

## Scope

### In Scope
The following components are considered in scope for security vulnerability disclosures:
- Smart contract source code located in `contracts/`:
  - `program` (funding round, awards, tranche releases, refunds)
  - `policy_spend` (wallet spend policy verification)
  - `record` (recipient standing management)
  - `attest` (attestation registry)
  - `registry` (factory and protocol configuration)
- Shared core types crate in `crates/types`.

### Out of Scope & Known Limitations
- **No Bug Bounty Program**: There is currently no active bug bounty program or financial compensation for vulnerability disclosures.
- **No Formal Audit Guarantees**: While contracts undergo internal review and testing, we do not claim formal verification or third-party audit guarantees.
- **Third-Party Dependencies**: Vulnerabilities in external host code, Soroban SDK, or Stellar core infrastructure should be reported directly to their respective upstream maintainers.
- **Known Limitation of `Restricted` Mode**:
  As documented in `README.md`, `Restricted` disbursement mode installs policy signers on smart wallets. A policy signer constrains *one signer*, not the entire wallet. A recipient holding an unrestricted admin signer on their wallet can authorize transactions around the policy signer unless the wallet's own `SignerLimits` confine the signer. This is a recognized smart-wallet configuration characteristic and should not be reported as a smart contract vulnerability.
- Non-security bugs, styling issues, or general feature requests.
