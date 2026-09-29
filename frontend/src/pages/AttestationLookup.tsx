import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Badge, Field } from '../components/ui';
import { FIXTURE_ATTESTATIONS, type AttestationFixture } from '../fixtures/attestationFixtures';
import {
  validateVerifyClaimInput,
  verifyClaim,
  type VerifyClaimFieldErrors,
  type VerifyClaimResult,
} from '../lib/attestationVerify';
import './AttestationLookup.css';

type LookupMode = 'id' | 'claim';

interface ResultRow {
  key: string;
  value: string;
}

function statusFor(attestation: AttestationFixture): { label: string; tone: 'success' | 'accent' | 'danger' } {
  if (attestation.revoked) return { label: 'Revoked', tone: 'danger' };
  if (attestation.used) return { label: 'Used to release a payment instalment', tone: 'accent' };
  return { label: 'Valid, not used yet', tone: 'success' };
}

function rowsFor(attestation: AttestationFixture): ResultRow[] {
  const base: ResultRow[] = [
    { key: 'Claim template', value: attestation.schema },
    { key: 'Verifier', value: attestation.attester },
    { key: 'Recipient', value: attestation.subject },
    { key: 'Signed at ledger', value: attestation.ledger.toLocaleString() },
  ];
  return base.concat(
    Object.entries(attestation.data).map(([key, value]) => ({ key, value: String(value) })),
  );
}

const EMPTY_CLAIM_FORM = { uid: '', subject: '', schema: '', attester: '' };

/**
 * Signed proof lookup.
 *
 * Two modes. "Look up by id" answers what a signed proof says — search by
 * id, recipient or verifier. "Check a claim" answers the narrower question
 * anything gating value should actually ask: does this recipient hold a valid
 * claim under this claim template from this verifier (`attest.verify`, not just
 * `is_valid`). The proof contract has no way to list every proof by recipient or
 * verifier — only to fetch one uid at a time — so both modes stay
 * fixture-backed (see `attestationFixtures.ts` and `attestationVerify.ts`)
 * until an indexer handler publishes a searchable list. No sign-in needed:
 * anyone can check what a verifier signed.
 */
export const AttestationLookup = () => {
  const [mode, setMode] = useState<LookupMode>('id');

  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSearched(query);
  };

  const pick = (uid: string) => {
    setMode('id');
    setQuery(uid);
    setSearched(uid);
  };

  const trimmed = searched.trim().toLowerCase();
  const searchedYet = trimmed.length > 0;
  const hits = searchedYet
    ? FIXTURE_ATTESTATIONS.filter(
        (a) =>
          a.uid.toLowerCase() === trimmed ||
          a.subject.toLowerCase().includes(trimmed) ||
          a.attester.toLowerCase().includes(trimmed),
      )
    : [];
  const noneFound = searchedYet && hits.length === 0;

  const [claimForm, setClaimForm] = useState(EMPTY_CLAIM_FORM);
  const [claimErrors, setClaimErrors] = useState<VerifyClaimFieldErrors>({});
  const [claimResult, setClaimResult] = useState<VerifyClaimResult | null>(null);

  const updateClaimField = (field: keyof typeof EMPTY_CLAIM_FORM) => (event: ChangeEvent<HTMLInputElement>) => {
    setClaimForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const fillClaimSample = (attestation: AttestationFixture) => {
    setClaimForm({
      uid: attestation.uid,
      subject: attestation.subject,
      schema: attestation.schema,
      attester: attestation.attester,
    });
    setClaimErrors({});
    setClaimResult(null);
  };

  const handleClaimSubmit = (event: FormEvent) => {
    event.preventDefault();
    const errors = validateVerifyClaimInput(claimForm);
    setClaimErrors(errors);
    if (Object.keys(errors).length > 0) {
      setClaimResult(null);
      return;
    }
    setClaimResult(verifyClaim(FIXTURE_ATTESTATIONS, claimForm));
  };

  return (
    <div className="attest-lookup">
      <header className="attest-lookup__header">
        <h1>Look up a signed proof</h1>
        <p className="typo-text text-muted">
          Check what a verifier signed, about whom, and whether it has already released a
          payment instalment. No sign-in needed.
        </p>
      </header>

      <div className="attest-lookup__tabs" role="tablist" aria-label="Lookup mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'id'}
          className={`attest-lookup__tab${mode === 'id' ? ' attest-lookup__tab--active' : ''}`}
          onClick={() => setMode('id')}
        >
          Look up by id
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'claim'}
          className={`attest-lookup__tab${mode === 'claim' ? ' attest-lookup__tab--active' : ''}`}
          onClick={() => setMode('claim')}
        >
          Check a claim
        </button>
      </div>

      {mode === 'id' && (
        <>
          <form role="search" onSubmit={handleSubmit} className="attest-lookup__form">
            <Field
              label="Signed proof id or address"
              placeholder="Signed proof id, recipient or verifier"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button type="submit" className="attest-lookup__submit">
              Look up
            </button>
          </form>

          <div className="attest-lookup__samples">
            <span>Sample ids:</span>
            {FIXTURE_ATTESTATIONS.map((a) => (
              <button
                key={a.uid}
                type="button"
                className="attest-lookup__sample"
                onClick={() => pick(a.uid)}
              >
                {a.uid}
              </button>
            ))}
          </div>

          <div aria-live="polite" className="attest-lookup__results">
            {noneFound && (
              <div className="attest-not-found">
                <span className="attest-not-found__title">Nothing found for &ldquo;{searched.trim()}&rdquo;</span>
                <span className="attest-not-found__detail">
                  Check the id. Signed proofs are read on-chain; archived ones need a keepalive
                  before they can be read.
                </span>
              </div>
            )}

            {hits.map((attestation) => {
              const status = statusFor(attestation);
              return (
                <article key={attestation.uid} className="attest-result-card">
                  <div className="attest-result-card__head">
                    <span className="attest-result-card__uid">{attestation.uid}</span>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </div>
                  {rowsFor(attestation).map((row) => (
                    <div key={row.key} className="attest-result-row">
                      <span className="attest-result-row__key">{row.key}</span>
                      <span className="attest-result-row__value">{row.value}</span>
                    </div>
                  ))}
                </article>
              );
            })}

            {searchedYet && (
              <span className="attest-lookup__sample-note">
                Sample signed proofs for the design phase.
              </span>
            )}
          </div>
        </>
      )}

      {mode === 'claim' && (
        <>
          <p className="typo-text text-muted attest-lookup__claim-intro">
            Looking up by id shows what a signed proof says. This answers a narrower question:
            does <em>this</em> recipient hold a valid claim under <em>this</em> claim template (the rule the verifier signed under) from{' '}
            <em>this</em> verifier? A signed proof can be perfectly valid and still be the wrong
            one — signed by someone else, or about someone else — so gating anything of value on
            it should use this check, not just whether it exists.
          </p>

          <form onSubmit={handleClaimSubmit} className="attest-lookup__claim-form" noValidate>
            <Field
              label="Signed proof id"
              placeholder="Signed proof id"
              value={claimForm.uid}
              onChange={updateClaimField('uid')}
              error={claimErrors.uid}
            />
            <Field
              label="Recipient address"
              placeholder="G…"
              value={claimForm.subject}
              onChange={updateClaimField('subject')}
              error={claimErrors.subject}
            />
            <Field
              label="Claim template"
              placeholder="e.g. condition-met/v1"
              value={claimForm.schema}
              onChange={updateClaimField('schema')}
              error={claimErrors.schema}
            />
            <Field
              label="Verifier address"
              placeholder="G…"
              value={claimForm.attester}
              onChange={updateClaimField('attester')}
              error={claimErrors.attester}
            />
            <button type="submit" className="attest-lookup__submit">
              Check claim
            </button>
          </form>

          <div className="attest-lookup__samples">
            <span>Try a sample:</span>
            {FIXTURE_ATTESTATIONS.map((a) => (
              <button
                key={a.uid}
                type="button"
                className="attest-lookup__sample"
                onClick={() => fillClaimSample(a)}
              >
                {a.uid}
              </button>
            ))}
          </div>

          <div aria-live="polite" className="attest-lookup__results">
            {claimResult && (
              <div className={`attest-claim-result attest-claim-result--${claimResult.valid ? 'yes' : 'no'}`}>
                <Badge tone={claimResult.valid ? 'success' : 'danger'}>
                  {claimResult.valid ? 'Yes' : 'No'}
                </Badge>
                <span className="attest-claim-result__text">
                  {claimResult.valid
                    ? 'This recipient holds a valid claim under this claim template from this verifier.'
                    : claimResult.reason}
                </span>
              </div>
            )}
            <span className="attest-lookup__sample-note">
              Sample signed proofs for the design phase.
            </span>
          </div>
        </>
      )}
    </div>
  );
};
