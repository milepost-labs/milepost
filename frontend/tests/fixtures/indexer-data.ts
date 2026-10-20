/**
 * Fixed data served by the local indexer stub during screenshot tests.
 *
 * The indexedAt timestamp is set far in the past so the app never shows a
 * stale-index warning during screenshots (the stale threshold is 12 h; using
 * a static past date keeps the warning absent on every run without faking
 * the clock).
 *
 * Uses the same programme ids as FIXTURE_PROGRAMMES in src/fixtures/programmes.ts
 * so the directory renders the same names the fixture chain reads are keyed on.
 */

export const INDEXER_PORT = 4175;

export const FIXTURE_META = {
  network: 'testnet',
  registry: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  fromLedger: 4600000,
  indexedToLedger: 4900000,
  // Recent enough to not be stale (within the last hour).
  indexedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  complete: true,
  gap: false,
  unhandledEvents: {},
};

export const FIXTURE_PROGRAMMES = [
  {
    id: 'CBQ4SCHOOLBURSARY2026XK3ZP7M2QWJ5T8VN4RD6HY',
    name: 'Secondary school bursaries 2026',
    creator: 'GAKR7WXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXD2QX',
    createdLedger: 4811204,
  },
  {
    id: 'CCM2SMALLHOLDERINPUTSLR26A9FK3XU7PZ4E8QT2BN',
    name: 'Smallholder inputs, long rains',
    creator: 'GD5TQ4XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX9LKA',
    createdLedger: 4798551,
  },
  {
    id: 'CDV7VOCATIONALCOHORT3PL5QZ2WM8RT4HX6KJ9A3FC',
    name: 'Vocational bursaries, cohort 3',
    creator: 'GB2ZHMXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXQ7RP',
    createdLedger: 4702316,
  },
  {
    id: 'CA3NSMEMICROGRANTSQ2V8TX4QK7PL2RZ9MD5HW6JUB',
    name: 'SME supplier microgrants Q2',
    creator: 'GCX8NEXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX4FTM',
    createdLedger: 4611087,
  },
  {
    id: 'CBF9FLOODRESPONSETANA6QW2XM4RP7KZ3HT8LN5DVA',
    name: 'Flood response cash transfers',
    creator: 'GAKR7WXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXD2QX',
    createdLedger: 4655420,
  },
];
