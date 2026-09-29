# Runnable Examples

Small Node scripts that run end-to-end against testnet, demonstrating how to use the `@milepost/*` packages.

## Setup

```sh
cd examples
npm install
```

Each script runs with `npx tsx` and prints a result. No funded keys needed for read-only examples.

## Scripts

| Script | Package | What it does |
|---|---|---|
| `list-programme.ts` | `@milepost/registry` | Lists a programme's config from the registry |
| `read-award.ts` | `@milepost/program` | Reads an award's details (amount, mode, recipient) |
| `verify-attestation.ts` | `@milepost/attest` | Verifies an attestation exists for a subject |
| `read-standing.ts` | `@milepost/record` | Reads a recipient's standing from the record contract |

## Running

```sh
npx tsx list-programme.ts
npx tsx read-award.ts
npx tsx verify-attestation.ts
npx tsx read-standing.ts
```

All scripts use testnet contract IDs from each package's `networks` export. No environment variables needed.

## CI

Each script is type-checked in CI to ensure it stays compatible with the published packages:

```yaml
- name: Type-check examples
  run: npx tsc --noEmit -p examples/tsconfig.json
```
