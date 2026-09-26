/**
 * Stand-in data for the schema registration screen (`/schemas/register`).
 *
 * Every export here is named `FIXTURE_*` and is **shaped like the read it
 * stands in for**, so replacing it with the real call is a change of source
 * rather than a change of shape:
 *
 * - `FIXTURE_SCHEMAS` is shaped like `attest.get_schema` results for the
 *   schemas registered so far (there is no on-chain "all schemas" list, so a
 *   real version of this list would come from an indexer handler that does not
 *   exist yet).
 *
 * Anything rendered from these is tagged in the UI as "Sample data" so it is
 * never mistaken for a live figure. One `grep` for `FIXTURE_` finds all of it.
 */

/** Shaped like an `attest.get_schema` result, as the UI needs it. */
export interface FixtureSchema {
  /** Registry UID, hex-encoded. */
  uid: string;
  /** Human-readable name, `lowercase-words/vN` by UI convention. */
  name: string;
  /** Human-readable field description (part of the opaque definition). */
  fields: string;
  revocable: boolean;
}

export const FIXTURE_SCHEMAS: FixtureSchema[] = [
  {
    uid: 'a9f21c3e0b7d4e11a9f21c3e0b7d4e11a9f21c3e0b7d4e11a9f21c3e0b7d4e11'.slice(0, 64),
    name: 'condition-met/v1',
    fields: 'programme: address, tranche: u32',
    revocable: false,
  },
  {
    uid: 'b4b7d11af82c9e03b4b7d11af82c9e03b4b7d11af82c9e03b4b7d11af82c9e03'.slice(0, 64),
    name: 'invoice-approved/v1',
    fields: 'programme: address, tranche: u32, invoice_ref: string',
    revocable: true,
  },
];

/**
 * Schema names are a UI convention — `lowercase-words/vN`, e.g.
 * `shifts-confirmed/v1` — validated before signing so a typo never becomes an
 * on-chain registration. The registry itself never parses the definition; it
 * stores it opaquely and derives the UID from authority + definition.
 */
export const SCHEMA_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*\/v\d+$/;

export function isValidSchemaName(name: string): boolean {
  return SCHEMA_NAME_PATTERN.test(name.trim());
}

export const SCHEMA_NAME_ERROR = 'Use lowercase words and a version, like shifts-confirmed/v1.';

/**
 * Compose the opaque `definition` the contract stores from the name and fields
 * the form collects. The registry never parses this string — the name/fields
 * split exists only so humans registering and verifying agree on what a claim
 * means.
 */
export function buildSchemaDefinition(name: string, fields: string): string {
  return `${name.trim()}: ${fields.trim()}`;
}
