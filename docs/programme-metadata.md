# Programme metadata document

`ProgrammeConfig.metadata_hash: BytesN<32>` carries a commitment to an
off-chain document describing the programme. The contracts never read it — it
is a commitment, deliberately kept off-chain so that a pinning service being
down cannot block construction or any on-chain action. This document specifies
what that hash commits to, how a client computes and verifies it, where the
document is expected to live, and what a client does when it cannot be found.

Everything here is a *convention*. The chain only ever stores the 32-byte
hash, so two clients that follow this spec will agree on the hash for the same
document, and a client that fetches a document can prove it is the one the
programme committed to.

## Document format

The document is a single UTF-8 JSON object. Field names are `snake_case`.
Unknown fields are permitted and MUST be ignored by clients (see Forward
compatibility), so this list may grow.

| Field            | Required | Type            | Meaning                                                                 |
| ---------------- | -------- | --------------- | ----------------------------------------------------------------------- |
| `schema_version` | yes      | string (semver) | Version of *this document spec*. Bump the major on breaking changes.     |
| `name`           | yes      | string          | Human-readable programme name.                                          |
| `description`    | yes      | string          | What the programme funds and on what terms, in plain language.          |
| `vertical`       | yes      | string          | One of `education`, `health`, `agriculture`, `vocational`, `humanitarian`, `sme`. Free-form otherwise. |
| `language`       | no       | string (BCP 47) | Primary language of the document, e.g. `en`, `sw`.                      |
| `contact`        | yes      | object          | `{ "name": string, "email": string, "url"?: string }` — who stands behind the programme. |
| `links`          | no       | array of object | `[ { "label": string, "url": string } ]` — supporting material.         |

Required fields MUST be present and non-empty. A document missing a required
field is malformed and must not be treated as valid metadata.

## Hashing method

The hash is **SHA-256** over the document's UTF-8 JSON, serialized
*canonically* so that two clients that agree on the document agree on the
bytes:

1. Serialize the JSON with **object keys sorted lexicographically** (by their
   UTF-8 byte order) and **no insignificant whitespace** — i.e. the
   `separators` are `(`,` `)`→`,` and `:` with no spaces, and no trailing
   newline.
2. Encode the resulting string as UTF-8.
3. `metadata_hash = SHA256(canonical_utf8_bytes)`, as the 32 raw bytes stored
   in `BytesN<32>`.

Canonicalization matters: pretty-printing, key reordering, or trailing
whitespace all change the hash. Clients MUST serialize exactly as above before
hashing. Numbers and Unicode are encoded by the JSON serializer; do not
pre-normalize them by hand.

### Verification snippet (Rust)

```rust
use sha2::{Digest, Sha256};
use soroban_sdk::BytesN;

fn metadata_hash(doc: &serde_json::Value) -> BytesN<32> {
    // serde_json::to_string with sorted keys + compact separators is canonical
    // enough for the rule above as long as keys are emitted sorted.
    let mut canonical = serde_json::to_string(doc).expect("serializable");
    // Ensure sorted keys + no whitespace:
    let value: serde_json::Value = serde_json::from_str(&canonical).unwrap();
    let canonical = serde_json::to_string(&value).unwrap(); // re-emit compact
    let mut hasher = Sha256::new();
    hasher.update(canonical.as_bytes());
    let out = hasher.finalize();
    BytesN::from_array(&env, &out)
}
```

The contract itself never runs this — it only stores `BytesN<32>`. The snippet
is for clients building or checking the commitment.

### Verification snippet (TypeScript)

```ts
import { createHash } from "node:crypto";

function metadataHash(doc: unknown): string {
  const canonical = JSON.stringify(doc, Object.keys(doc).sort());
  return createHash("sha256").update(canonical).digest("hex");
}
```

`JSON.stringify` with a replacer that returns `Object.keys(value).sort()`
produces sorted keys and no whitespace, satisfying the canonical rule.

## Worked example

Document:

```json
{
  "schema_version": "1.0.0",
  "name": "Lambani Girls' Term 2 Bursary",
  "description": "Ten termly bursaries for students at Lambani Secondary, paid on enrolment attestation.",
  "vertical": "education",
  "language": "en",
  "contact": {
    "name": "Lambani Community Trust",
    "email": "grants@lambanitrust.example"
  },
  "links": [
    { "label": "Prospectus", "url": "https://lambanitrust.example/prospectus.pdf" },
    { "label": "Audited budget", "url": "https://lambanitrust.example/budget-2026.pdf" }
  ]
}
```

Canonical JSON (sorted keys, no whitespace):

```
{"contact":{"email":"grants@lambanitrust.example","name":"Lambani Community Trust"},"description":"Ten termly bursaries for students at Lambani Secondary, paid on enrolment attestation.","language":"en","links":[{"label":"Prospectus","url":"https://lambanitrust.example/prospectus.pdf"},{"label":"Audited budget","url":"https://lambanitrust.example/budget-2026.pdf"}],"name":"Lambani Girls' Term 2 Bursary","schema_version":"1.0.0","vertical":"education"}
```

`metadata_hash` (hex):

```
0dce7b1e6c419ba23f27b9d1ab3deef938938fb4edab8d71d82aa16a7d7305ca
```

A client that fetches the document, canonicalizes it the same way, and SHA-256s
it must obtain exactly this value to consider the commitment satisfied.

## Retrieval expectations

The document is expected to live at a URL communicated out of band — typically
surfaced by the registry or the funder's own site, or in a content-addressed
store (IPFS / Arweave) keyed by this very hash. The contract gives no hint of
location; only the hash is on-chain.

A client resolving metadata MUST:

1. Fetch the document from the location it was given.
2. Canonicalize and hash it as above.
3. Compare the result to `ProgrammeConfig.metadata_hash`.
4. Treat a mismatch as a verification failure — show the mismatch, do not
   silently fall back to displaying the fetched content as if trusted.

When the document **cannot be fetched** (404, timeout, offline), the client
MUST NOT invent or guess content. It should display the `metadata_hash` and a
clear "metadata unavailable / unverifiable" state, and refrain from presenting
the programme's terms as known. The on-chain programme is still fully
functional; only the human-readable description is missing.

## Forward compatibility

- **Adding a field is always safe.** Clients MUST ignore keys they do not
  understand. Old clients keep working against new documents.
- **`schema_version` carries the breaking-change signal.** A client that does
  not understand the major version in `schema_version` MUST flag the metadata
  as potentially incompatible rather than misinterpreting it.
- **The hash is of the whole document.** Changing any byte — including adding a
  field — produces a new hash, so the on-chain commitment always pins one exact
  document. There is no "partial" upgrade; a programme that wants new metadata
  is constructed (or, if the registry permits, re-committed) with a new hash.
- **Encoding is fixed at UTF-8 JSON.** A future spec that wants CBOR or a
  compressed form would do so under a new `schema_version` major and a distinct
  hashing rule, and would be opt-in rather than a silent replacement.

See also: the TTL strategy (`ttl-strategy.md`) for how the on-chain
`metadata_hash` entry itself is kept alive.
