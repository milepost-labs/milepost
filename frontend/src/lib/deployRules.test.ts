import { describe, expect, it } from 'vitest';
import { Buffer } from 'buffer';
import { addAddresses, buildMetadata, createArgs, detailsErrors, parseMinAward, peopleErrors, timelineErrors, type DeployDraft } from './deployRules';
import { validateMetadata } from './metadata';

const A = `GAAA${'A'.repeat(52)}`;
const B = `GBBB${'B'.repeat(52)}`;
const NOW = 1_800_000_000;

function draft(overrides: Partial<DeployDraft> = {}): DeployDraft {
  return {
    name: 'Kano',
    token: `CTOK${'C'.repeat(52)}`,
    minAward: '',
    tranches: 3,
    schema: 'ab'.repeat(32),
    metadataHash: '',
    describe: false,
    description: '',
    vertical: '',
    contactName: '',
    contactEmail: '',
    labels: {},
    reviewers: [A],
    verifiers: [B],
    quorum: 1,
    applyDeadline: NOW + 1,
    reviewDeadline: NOW + 2,
    releaseDeadline: NOW + 3,
    sweepDeadline: NOW + 4,
    ...overrides,
  };
}

describe('addAddresses', () => {
  it('adds several pasted addresses and skips ones already listed', () => {
    expect(addAddresses([A], `${A}, ${B}`)).toEqual({ list: [A, B], error: null });
    expect(addAddresses([A], A).error).toBe('Already listed.');
    expect(addAddresses([], `${A} nope`).error).toBe('nope is not a Stellar address.');
  });
});

describe('parseMinAward', () => {
  it('treats empty as none and refuses an award too small to split', () => {
    expect(parseMinAward('', 3)).toEqual({ ok: true, value: 0n });
    expect(parseMinAward('0.0000002', 3).ok).toBe(false);
    expect(parseMinAward('100', 3)).toEqual({ ok: true, value: 1_000_000_000n });
  });
});

describe('step errors', () => {
  it('passes a complete draft', () => {
    expect(detailsErrors(draft(), { tokenKnown: true, schemaFound: true })).toEqual({});
    expect(peopleErrors(draft(), null)).toEqual({});
    expect(timelineErrors(draft(), NOW)).toEqual({});
  });

  it('holds the details while the asset and schema are being read', () => {
    const errors = detailsErrors(draft(), { tokenKnown: null, schemaFound: null });
    expect(errors.token).toBe('Reading the asset…');
    expect(errors.schema).toBe('Checking the schema…');
  });

  it('caps quorum at the reviewer count and needs a restricted schema’s authority', () => {
    expect(peopleErrors(draft({ quorum: 2 }), null).quorum).toMatch(/more than your 1 reviewer/);
    expect(peopleErrors(draft(), { restricted: true, authority: A }).verifiers).toMatch(/restricted/);
    expect(peopleErrors(draft({ verifiers: [B, A] }), { restricted: true, authority: A })).toEqual({});
  });

  it('needs future dates in order', () => {
    expect(timelineErrors(draft({ applyDeadline: NOW }), NOW).applyDeadline).toBe('Must be in the future.');
    expect(timelineErrors(draft({ reviewDeadline: NOW + 5 }), NOW).order).toMatch(/must run in order/);
  });
});

describe('createArgs', () => {
  it('builds the registry call with a zero metadata hash by default', () => {
    const args = createArgs(draft({ minAward: '1' }), A);
    expect(args.creator).toBe(A);
    expect(args.minimum_award).toBe(10_000_000n);
    expect(args.metadata_hash.equals(Buffer.alloc(32))).toBe(true);
    expect(args.schema.toString('hex')).toBe('ab'.repeat(32));
    expect(args.apply_deadline).toBe(BigInt(NOW + 1));
  });
});

describe('the published description', () => {
  it('needs a description, sector and contact when publishing one', () => {
    const errors = detailsErrors(draft({ describe: true }), { tokenKnown: true, schemaFound: true });
    expect(Object.keys(errors).sort()).toEqual(['contactEmail', 'contactName', 'description', 'vertical']);
  });

  it('builds a valid document with the names given, and commits its hash', () => {
    const d = draft({
      describe: true,
      description: 'Monthly stipends.',
      vertical: 'health',
      contactName: 'Kano Health Trust',
      contactEmail: 'grants@kano.example',
      labels: { [B]: 'District clinic lead' },
    });
    const doc = buildMetadata(d);
    expect(validateMetadata(doc).ok).toBe(true);
    expect(doc.labels).toEqual([{ address: B, role: 'verifier', label: 'District clinic lead' }]);
    expect(createArgs(d, A, 'ab'.repeat(32)).metadata_hash.toString('hex')).toBe('ab'.repeat(32));
  });
});
