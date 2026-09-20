# Security Policy

This repository is the Milepost web app. It builds and signs transactions, so a
flaw here can move money even when the contracts are correct.

## Reporting a vulnerability

Report privately, never in a public issue or pull request:

- **Preferred:** [GitHub private vulnerability reporting](https://github.com/milepost-labs/milepost/security/advisories/new) on the milepost repository.
- **Alternative:** email `security@milepost.io`.

Say that the report concerns `milepost-frontend`, and include the impact, steps
to reproduce, and any suggested fix. Response targets and the disclosure process
are the ones in milepost's
[SECURITY.md](https://github.com/milepost-labs/milepost/blob/main/SECURITY.md).

## Scope

**In scope:** code in this repository, especially transaction construction and
signing (`src/hooks/useTransaction.ts` and the wallet context in `src/context/`),
how addresses and amounts are displayed, and anything that could lead someone to
sign something other than what the screen shows.

**Out of scope:** the contracts and their generated bindings (report those
against milepost), wallet extensions such as Freighter, and bugs in third-party
dependencies, which belong with their upstream maintainers.
