# Milepost
*A Milepost marks how far along the road you have come.*

Conditional disbursement infrastructure on Stellar. A funder commits money to a
programme; recipients receive it in tranches that unlock only when a trusted
verifier attests that a condition was met; and each release leaves behind a
portable record the next funder can underwrite against.

Money moves at each milepost, and only at each milepost.

---

## The problem

Most on-chain grant tooling stops at *selection*. It makes the vote transparent, transfers a lump sum, and ends. The unsolved part is everything after the
transfer (&mdash; did the money reach the person, could they spend it on the thing it
was for, and can anyone prove it afterwards.

That gap is why this is built on Stellar rather than an EVM chain:

- **Anchors and SEP-24/SEP-31 off-ramps** mean a recipient can turn value into a
  bank balance or mobile money. Without this the rest is theatre.
- **Fee sponsorship** means recipients never hold XLM, and donors are not priced
  out of small contributions.
- **Passkey smart wallets** mean onboarding without a seed phrase.
- **Policy signers** mean a tranche can land in a recipient's own wallet and
  still only be spendable to verified payees.

