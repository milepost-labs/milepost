import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Buffer } from 'buffer';
import type { Client as ProgrammeClient } from '@milepost/program';
import type { Attestation } from '@milepost/attest';
import { Badge, Field } from '../components/ui';
import { useContractRead, useContractResult } from '../hooks';
import { useSoroban } from '../context/useSoroban';
import { explain } from '../lib/errors';
import { formatDateTime, looksLikeAddress } from '../lib/format';
import { rpcServer } from '../lib/txLookup';
import { describeWindow } from '../lib/contractEvents';
import {
  attestationStatus,
  isSearchableAddress,
  searchAttestations,
  type AttestationMatch,
  type AttestationSearch,
} from '../lib/attestationSearch';
import { FIXTURE_ATTESTATIONS, type AttestationFixture } from '../fixtures/attestationFixtures';
import {
  validateVerifyClaimInput,
  verifyClaimOnChain,
  type VerifyClaimFieldErrors,
  type VerifyClaimResult,
} from '../lib/attestationVerify';
import './AttestationLookup.css';

type LookupMode = 'id' | 'claim';

interface ResultRow {
  key: string;
  value: string;
}

/**
 * Whether a proof has been spent is a per-programme fact, so it is only shown
 * once a programme is selected. Rendering it as its own component keeps the
 * read scoped to one attestation and lets each result carry its own status
 * (issue #408).
 */
function SpentStatus({ programme, uid }: { programme: ProgrammeClient | null; uid: string }) {
  const read = useContractRead<boolean>(
    () => programme!.is_spent({ attestation: Buffer.from(uid, 'hex') }),
    [programme, uid],
    { enabled: programme !== null, contract: 'program' },
  );

  if (!programme) return <Badge tone="neutral">Select a programme to check usage</Badge>;
  if (read.loading) return <Badge tone="neutral">Checking this programme…</Badge>;
  if (read.error) return <Badge tone="warning">Could not check this programme</Badge>;
  return read.data ? (
    <Badge tone="accent">Already released a tranche here</Badge>
  ) : (
    <Badge tone="success">Not used in this programme</Badge>
  );
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

const ROLE_LABEL: Record<AttestationMatch['role'], string> = {
  subject: 'About this address',
  attester: 'Signed by this address',
  both: 'Signed by and about this address',
};

/**
 * One attestation found by address. Revoked and expired come from the fresh
 * `attest.get` read; "used" is per programme, so a valid one defers to
 * `SpentStatus` for the selected programme.
 */
function MatchCard({
  match,
  programme,
  programmeId,
  nowSeconds,
  onOpen,
}: {
  match: AttestationMatch;
  programme: ProgrammeClient | null;
  programmeId: string | null;
  nowSeconds: number;
  onOpen: (uid: string) => void;
}) {
  const { attestation } = match;
  const status = attestation ? attestationStatus(attestation, nowSeconds) : null;

  return (
    <article className="attest-result-card">
      <div className="attest-result-card__head">
        <span className="attest-result-card__uid">{match.uid}</span>
        {status === null && <Badge tone="warning">Could not read on-chain</Badge>}
        {status === 'revoked' && <Badge tone="danger">Revoked</Badge>}
        {status === 'expired' && <Badge tone="warning">Expired</Badge>}
        {status === 'valid' && (
          <>
            <Badge tone="success">Valid</Badge>
            <SpentStatus programme={programme} uid={match.uid} />
          </>
        )}
      </div>
      <span className="attest-result-card__programme">{ROLE_LABEL[match.role]}</span>
      {status === 'valid' && programmeId && (
        <span className="attest-result-card__programme">
          Usage checked against <span className="numeric">{programmeId}</span>
        </span>
      )}
      {attestation ? (
        <>
          <div className="attest-result-row">
            <span className="attest-result-row__key">Schema</span>
            <span className="attest-result-row__value numeric">
              {Buffer.from(attestation.schema).toString('hex')}
            </span>
          </div>
          <div className="attest-result-row">
            <span className="attest-result-row__key">Attester</span>
            <span className="attest-result-row__value numeric">{attestation.attester}</span>
          </div>
          <div className="attest-result-row">
            <span className="attest-result-row__key">Subject</span>
            <span className="attest-result-row__value numeric">{attestation.subject}</span>
          </div>
          <div className="attest-result-row">
            <span className="attest-result-row__key">Signed</span>
            <span className="attest-result-row__value">{formatDateTime(attestation.created_at)}</span>
          </div>
          {attestation.expires_at !== undefined && attestation.expires_at !== null && (
            <div className="attest-result-row">
              <span className="attest-result-row__key">Expires</span>
              <span className="attest-result-row__value">{formatDateTime(attestation.expires_at)}</span>
            </div>
          )}
        </>
      ) : (
        <span className="attest-not-found__detail">
          The event shows this attestation was made, but its entry could not be read now.
          Archived entries need a keepalive before they can be read.
        </span>
      )}
      <div className="attest-result-row">
        <span className="attest-result-row__key">Event ledger</span>
        <span className="attest-result-row__value">{match.ledger.toLocaleString()}</span>
      </div>
      <button type="button" className="attest-lookup__sample" onClick={() => onOpen(match.uid)}>
        Look up this id
      </button>
    </article>
  );
}

const EMPTY_CLAIM_FORM = { uid: '', subject: '', schema: '', attester: '' };

/**
 * Attestation lookup.
 *
 * Two modes. "Look up by id" answers what an attestation says — reading on-chain
 * via `attest.get` for real 32-byte UIDs. A G… or C… address is searched in the
 * attest contract's recent `Attested` events as subject or attester, and each
 * hit is re-read so its status is current (issue #536). Sample ids stay behind
 * the sample label.
 * "Check a claim" answers the narrower question: does this subject hold a valid
 * claim under this schema from this attester.
 */
export const AttestationLookup = () => {
  const { programmeAt, attest, rpcUrl } = useSoroban();
  const [mode, setMode] = useState<LookupMode>('id');

  // Whether a proof was used is answered by one programme, not by the
  // attestation itself. Nothing is guessed until a programme is selected.
  const [programmeInput, setProgrammeInput] = useState('');
  const [programmeId, setProgrammeId] = useState<string | null>(null);
  const [programmeError, setProgrammeError] = useState<string | null>(null);
  const programme = useMemo(
    () => (programmeId ? programmeAt(programmeId) : null),
    [programmeAt, programmeId],
  );

  const selectProgramme = (event: FormEvent) => {
    event.preventDefault();
    const value = programmeInput.trim();
    if (value === '') {
      setProgrammeId(null);
      setProgrammeError(null);
      return;
    }
    if (!looksLikeAddress(value)) {
      setProgrammeError('Enter a valid programme contract address.');
      return;
    }
    setProgrammeError(null);
    setProgrammeId(value);
  };

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
  const isAddress = isSearchableAddress(trimmed);
  const searchedYet = trimmed.length > 0;

  const chainRead = useContractResult<Attestation>(
    () => attest.get({ uid: Buffer.from(cleanHex, 'hex') }),
    [attest, cleanHex],
    { enabled: isHex64 },
  );

  const chainAttestation = isHex64 ? chainRead.data : null;
  const chainLoading = isHex64 && chainRead.loading;
  const chainNotFound = isHex64 && !chainRead.loading && Boolean(chainRead.error);

  // A real address is searched on-chain only, so sample attestations never
  // mix into what the chain says about it.
  const addressRead = useContractRead<AttestationSearch>(
    async () => ({ result: await searchAttestations(rpcServer(rpcUrl), attest, trimmed) }),
    [attest, rpcUrl, trimmed],
    { enabled: isAddress, contract: 'attest' },
  );
  // A new search keeps the previous result in `data` until it lands, so only
  // a result for the address on screen counts.
  const addressSearch =
    isAddress && addressRead.data?.address === trimmed ? addressRead.data : null;
  const addressError = isAddress && !addressSearch && addressRead.error
    ? explain(addressRead.error, 'attest').message
    : null;
  const addressLoading = isAddress && !addressSearch && !addressError;
  // Read once when the page opens; React render must stay pure, so expiry is
  // judged against that moment rather than a clock read on every render.
  const [nowSeconds] = useState(() => Math.floor(Date.now() / 1000));

  const hits = searchedYet && !isHex64 && !isAddress
    ? FIXTURE_ATTESTATIONS.filter(
        (a) =>
          a.uid.toLowerCase() === cleanHex ||
          a.subject.toLowerCase() === cleanHex ||
          a.attester.toLowerCase() === cleanHex,
      )
    : [];

  const [claimForm, setClaimForm] = useState(EMPTY_CLAIM_FORM);
  const [claimErrors, setClaimErrors] = useState<VerifyClaimFieldErrors>({});
  const [claimResult, setClaimResult] = useState<VerifyClaimResult | null>(null);
  const [claimChecking, setClaimChecking] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  const updateClaimField = (field: keyof typeof EMPTY_CLAIM_FORM) => (event: ChangeEvent<HTMLInputElement>) => {
    setClaimForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleClaimSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const errors = validateVerifyClaimInput(claimForm);
    setClaimErrors(errors);
    if (Object.keys(errors).length > 0) {
      setClaimResult(null);
      setClaimError(null);
      return;
    }

    setClaimResult(null);
    setClaimError(null);
    setClaimChecking(true);

    try {
      // uid and schema are valid 64-char hex (validated above), so this is a
      // real on-chain call. The fixture path (`verifyClaim`) is kept as a
      // fallback for callers that pass human-readable sample ids, but
      // `validateVerifyClaimInput` now requires hex, so sample forms that
      // predate hex uids will show a validation error before reaching here.
      const result = await verifyClaimOnChain(attest, claimForm);
      setClaimResult(result);
    } catch (caught) {
      setClaimError(explain(caught, 'attest').message);
    } finally {
      setClaimChecking(false);
    }
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

      <form onSubmit={selectProgramme} className="attest-lookup__programme">
        <Field
          label="Programme (to check whether a proof was used)"
          placeholder="C…"
          value={programmeInput}
          onChange={(event) => {
            setProgrammeInput(event.target.value);
            setProgrammeError(null);
          }}
          error={programmeError}
          hint="Usage is per programme. Without one selected, the used state is not guessed."
          spellCheck={false}
        />
        <button type="submit" className="attest-lookup__submit">
          Use programme
        </button>
        {programmeId && (
          <button
            type="button"
            className="attest-lookup__programme-clear"
            onClick={() => {
              setProgrammeId(null);
              setProgrammeInput('');
            }}
          >
            Clear
          </button>
        )}
      </form>

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

            {addressLoading && (
              <div className="attest-lookup__status" role="status">
                <span>Searching recent attestations for this address…</span>
              </div>
            )}

            {addressError && (
              <div className="attest-not-found" role="alert">
                <span className="attest-not-found__title">Could not search attestations</span>
                <span className="attest-not-found__detail">{addressError}</span>
                <button type="button" className="attest-lookup__sample" onClick={addressRead.refetch}>
                  Try again
                </button>
              </div>
            )}

            {addressSearch && (
              <div className="attest-lookup__limitation" role="note">
                <p>
                  {addressSearch.matches.length === 0
                    ? 'No attestations name this address as recipient or verifier'
                    : `${addressSearch.matches.length} attestation${addressSearch.matches.length === 1 ? '' : 's'} name this address`}{' '}
                  in ledgers{' '}
                  <span className="numeric">
                    {addressSearch.window.fromLedger.toLocaleString()}–
                    {addressSearch.window.toLedger.toLocaleString()}
                  </span>{' '}
                  ({describeWindow(addressSearch.window)}, the network&rsquo;s event history).
                  Older attestations are not listed here; look them up by id.
                  {addressSearch.truncated && ' This contract was busy, so only the oldest part of that window was searched.'}
                </p>
              </div>
            )}

            {addressSearch?.matches.map((match) => (
              <MatchCard
                key={match.uid}
                match={match}
                programme={programme}
                programmeId={programmeId}
                nowSeconds={nowSeconds}
                onOpen={pick}
              />
            ))}

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
              return (
                <article key={attestation.uid} className="attest-result-card">
                  <div className="attest-result-card__head">
                    <span className="attest-result-card__uid">{attestation.uid}</span>
                    <Badge tone="warning">Sample data</Badge>
                    {attestation.revoked && <Badge tone="danger">Revoked</Badge>}
                    {/* Still checked when revoked: a proof revoked after it
                        released a tranche must not hide that money moved. */}
                    <SpentStatus programme={programme} uid={attestation.uid} />
                  </div>
                  {programmeId && (
                    <span className="attest-result-card__programme">
                      Usage checked against <span className="numeric">{programmeId}</span>
                    </span>
                  )}
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
                <Badge tone="neutral">Sample data</Badge> Sample attestations for the design phase.
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
          <p className="typo-text text-muted attest-lookup__claim-intro">
            All four fields are read on-chain: uid and schema are 64-character hex strings
            (the on-chain ids); subject and attester are Stellar addresses.
          </p>

          <form onSubmit={(e) => void handleClaimSubmit(e)} className="attest-lookup__claim-form" noValidate>
            <Field
              label="Attestation uid (hex)"
              placeholder="64-character hex uid"
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
              label="Schema uid (hex)"
              placeholder="64-character hex schema uid"
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
            <button type="submit" className="attest-lookup__submit" disabled={claimChecking}>
              {claimChecking ? 'Checking…' : 'Check claim'}
            </button>
          </form>

          <div aria-live="polite" className="attest-lookup__results">
            {claimChecking && (
              <div className="attest-claim-result attest-claim-result--checking">
                <span className="attest-claim-result__text">Checking on-chain…</span>
              </div>
            )}
            {claimError && !claimChecking && (
              <div className="attest-claim-result attest-claim-result--no" role="alert">
                <Badge tone="danger">Error</Badge>
                <span className="attest-claim-result__text">{claimError}</span>
              </div>
            )}
            {claimResult && !claimChecking && (
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
          </div>
        </>
      )}
    </div>
  );
};
