import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Buffer } from 'buffer';
import type { Attestation } from '@milepost/attest';
import { useSoroban } from '../context/useSoroban';
import { useContractResult } from '../hooks/useContractRead';
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
  if (attestation.used) return { label: 'Used to release a tranche', tone: 'accent' };
  return { label: 'Valid, not used yet', tone: 'success' };
}

function rowsFor(attestation: AttestationFixture): ResultRow[] {
  const base: ResultRow[] = [
    { key: 'Schema', value: attestation.schema },
    { key: 'Attester', value: attestation.attester },
    { key: 'Subject', value: attestation.subject },
    { key: 'Signed at ledger', value: attestation.ledger.toLocaleString() },
  ];
  return base.concat(
    Object.entries(attestation.data).map(([key, value]) => ({ key, value: String(value) })),
  );
}

const EMPTY_CLAIM_FORM = { uid: '', subject: '', schema: '', attester: '' };

/**
 * Attestation lookup.
 *
 * Two modes. "Look up by id" answers what an attestation says — reading on-chain
 * via `attest.get` for real 32-byte UIDs. For address queries, explains the
 * contract's search limitations and keeps sample results behind the sample label.
 * "Check a claim" answers the narrower question: does this subject hold a valid
 * claim under this schema from this attester.
 */
export const AttestationLookup = () => {
  const { attest } = useSoroban();
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

  const trimmed = searched.trim();
  const cleanHex = trimmed.toLowerCase();
  const isHex64 = /^[0-9a-fA-F]{64}$/.test(cleanHex);
  const isAddress = /^[GC][A-Z2-7]{55}$/.test(trimmed);
  const searchedYet = trimmed.length > 0;

  const chainRead = useContractResult<Attestation>(
    () => attest.get({ uid: Buffer.from(cleanHex, 'hex') }),
    [attest, cleanHex],
    { enabled: isHex64 },
  );

  const chainAttestation = isHex64 ? chainRead.data : null;
  const chainLoading = isHex64 && chainRead.loading;
  const chainNotFound = isHex64 && !chainRead.loading && Boolean(chainRead.error);

  const hits = searchedYet && !isHex64
    ? FIXTURE_ATTESTATIONS.filter(
        (a) =>
          a.uid.toLowerCase() === cleanHex ||
          a.subject.toLowerCase() === cleanHex ||
          a.attester.toLowerCase() === cleanHex ||
          (isAddress && (a.subject === trimmed || a.attester === trimmed)),
      )
    : [];

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
        <h1>Look up an attestation</h1>
        <p className="typo-text text-muted">
          An attestation is a signed statement that a condition was met. Check what was
          signed, about whom, and whether it has already released a tranche (one instalment
          of an award). No sign-in needed.
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
              label="Attestation id or address"
              placeholder="Attestation id, recipient or verifier"
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
            {chainLoading && (
              <div className="attest-lookup__status" role="status">
                <span>Reading attestation from chain…</span>
              </div>
            )}

            {chainAttestation && (
              <article key={cleanHex} className="attest-result-card">
                <div className="attest-result-card__head">
                  <span className="attest-result-card__uid">
                    {chainAttestation.uid ? Buffer.from(chainAttestation.uid).toString('hex') : cleanHex}
                  </span>
                  <Badge tone={chainAttestation.revoked_at ? 'danger' : 'success'}>
                    {chainAttestation.revoked_at ? 'Revoked' : 'Valid on-chain'}
                  </Badge>
                </div>
                <div className="attest-result-row">
                  <span className="attest-result-row__key">Schema</span>
                  <span className="attest-result-row__value numeric">
                    {Buffer.from(chainAttestation.schema).toString('hex')}
                  </span>
                </div>
                <div className="attest-result-row">
                  <span className="attest-result-row__key">Attester</span>
                  <span className="attest-result-row__value numeric">{chainAttestation.attester}</span>
                </div>
                <div className="attest-result-row">
                  <span className="attest-result-row__key">Subject</span>
                  <span className="attest-result-row__value numeric">{chainAttestation.subject}</span>
                </div>
                <div className="attest-result-row">
                  <span className="attest-result-row__key">Payload hash</span>
                  <span className="attest-result-row__value numeric">
                    {Buffer.from(chainAttestation.data_hash).toString('hex')}
                  </span>
                </div>
                <div className="attest-result-row">
                  <span className="attest-result-row__key">Signed at ledger</span>
                  <span className="attest-result-row__value">
                    {String(chainAttestation.created_at)}
                  </span>
                </div>
              </article>
            )}

            {isHex64 && chainNotFound && (
              <div className="attest-not-found" role="alert">
                <span className="attest-not-found__title">Nothing found for &ldquo;{searched.trim()}&rdquo;</span>
                <span className="attest-not-found__detail">
                  Check the id. Attestations are read on-chain; archived ones need a keepalive
                  before they can be read.
                </span>
              </div>
            )}

            {isAddress && (
              <div className="attest-lookup__limitation" role="note">
                <p>
                  The on-chain attestation contract cannot search by subject or attester address; it only supports lookup by 32-byte UID.
                </p>
              </div>
            )}

            {!isHex64 && !isAddress && searchedYet && hits.length === 0 && (
              <div className="attest-not-found" role="alert">
                <span className="attest-not-found__title">Nothing found for &ldquo;{searched.trim()}&rdquo;</span>
                <span className="attest-not-found__detail">
                  Check the id. Attestations are read on-chain; archived ones need a keepalive
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
                    <Badge tone="warning">Sample data</Badge>
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

            {hits.length > 0 && (
              <span className="attest-lookup__sample-note">
                Sample attestations for the design phase.
              </span>
            )}
          </div>
        </>
      )}

      {mode === 'claim' && (
        <>
          <p className="typo-text text-muted attest-lookup__claim-intro">
            Looking up by id shows what an attestation says. This answers a narrower question:
            does <em>this</em> subject hold a valid claim under <em>this</em> schema (the checklist it was signed against) from{' '}
            <em>this</em> attester? An attestation can be perfectly valid and still be the wrong
            one — signed by someone else, or about someone else — so gating anything of value on
            it should use this check, not just whether it exists.
          </p>

          <form onSubmit={handleClaimSubmit} className="attest-lookup__claim-form" noValidate>
            <Field
              label="Attestation id"
              placeholder="Attestation id"
              value={claimForm.uid}
              onChange={updateClaimField('uid')}
              error={claimErrors.uid}
            />
            <Field
              label="Subject address"
              placeholder="G…"
              value={claimForm.subject}
              onChange={updateClaimField('subject')}
              error={claimErrors.subject}
            />
            <Field
              label="Schema"
              placeholder="e.g. condition-met/v1"
              value={claimForm.schema}
              onChange={updateClaimField('schema')}
              error={claimErrors.schema}
            />
            <Field
              label="Attester address"
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
                    ? 'This subject holds a valid claim under this schema from this attester.'
                    : claimResult.reason}
                </span>
              </div>
            )}
            <span className="attest-lookup__sample-note">
              Sample attestations for the design phase.
            </span>
          </div>
        </>
      )}
    </div>
  );
};
