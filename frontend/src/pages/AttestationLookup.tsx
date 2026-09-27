import { useState, type FormEvent } from 'react';
import { Badge, Field } from '../components/ui';
import { FIXTURE_ATTESTATIONS, type AttestationFixture } from '../fixtures/attestationFixtures';
import './AttestationLookup.css';

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

/**
 * Attestation lookup.
 *
 * Search by id, recipient or verifier. The `attest` contract has no way to
 * enumerate by subject or attester — only to fetch one uid at a time — so
 * this stays fixture-backed (see `attestationFixtures.ts`) until an indexer
 * handler publishes a searchable list. No sign-in needed: anyone can check
 * what a verifier signed.
 */
export const AttestationLookup = () => {
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSearched(query);
  };

  const pick = (uid: string) => {
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

  return (
    <div className="attest-lookup">
      <header className="attest-lookup__header">
        <h1>Look up an attestation</h1>
        <p className="typo-text text-muted">
          Check what a verifier signed, about whom, and whether it has already released a
          tranche. No sign-in needed.
        </p>
      </header>

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
        {noneFound && (
          <div className="attest-not-found">
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
            Sample attestations for the design phase.
          </span>
        )}
      </div>
    </div>
  );
};
