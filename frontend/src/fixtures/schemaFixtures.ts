/**
 * Schema form helpers for the registration screen (`/schemas/register`).
 *
 * Schemas are read on-chain by UID (see `lib/schemaLookup.ts`); what is left
 * here is the form's naming convention and the shape of the session list of
 * schemas registered from this browser.
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
