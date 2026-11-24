import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Buffer } from 'buffer';
import { Ban, Check, Search, ShieldCheck } from 'lucide-react';
import type { Client as ProgrammeClient } from '@milepost/program';
import type { Attestation, Schema } from '@milepost/attest';
import { Badge, Button, CopyButton, Field, Notice, PageHead, Receipt, SampleTag, Segmented } from '../components/ui';
import { samplesEnabled } from '../lib/samples';
import type { ReceiptRow } from '../components/ui';
import { useContractRead, useContractResult } from '../hooks';
import { useKeyedRead } from '../hooks/useKeyedRead';
import { usePageTitle } from '../hooks/usePageTitle';
import { useSoroban } from '../context/useSoroban';
import { explain } from '../lib/errors';
import { formatDateTime, looksLikeAddress, truncateAddress } from '../lib/format';
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
type Status = 'valid' | 'revoked' | 'expired' | 'unknown';

/** One attestation found: on the chain (by id or by address) or a tagged sample. */
interface Found {
  uid: string;
  status: Status;
  attestation: Attestation | null;
  sample?: AttestationFixture;
  /** For an address search: how the address relates to it, and the event's ledger. */
  role?: AttestationMatch['role'];
  eventLedger?: number;
}

const ROLE_LABEL: Record<AttestationMatch['role'], string> = {
  subject: 'About this address',
  attester: 'Signed by this address',
  both: 'Signed by and about this address',
};

const STATUS_LABEL: Record<Status, string> = {
  valid: 'Valid',
  revoked: 'Revoked',
  expired: 'Expired',
  unknown: 'Unreadable',
};

const STATUS_NOTE: Record<Status, { tone: 'ok' | 'risk' | 'warn'; text: string }> = {
  valid: { tone: 'ok', text: 'It can unlock one tranche in a programme that trusts this signer and schema.' },
  revoked: { tone: 'risk', text: 'The signer withdrew it. It can’t unlock anything now; a tranche it already released stays released.' },
  expired: { tone: 'warn', text: 'Its expiry has passed, so it can’t unlock anything.' },
  unknown: {
    tone: 'warn',
    text: 'The event shows it was made, but its entry couldn’t be read now. Archived entries need a keepalive before they can be read.',
  },
};

function short(hex: string) {
  return hex.length > 20 ? `${hex.slice(0, 10)}…${hex.slice(-6)}` : hex;
}

function StatusPill({ status }: { status: Status }) {
  return <span className={`att-pill att-pill--${status}`}>{STATUS_LABEL[status]}</span>;
}

/**
 * Whether a proof has been spent is a per-programme fact, so it is only shown
 * once a programme is chosen.
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

/** The selected attestation: its status, what it says, and its use in the chosen programme. */
function Detail({
  found,
  programme,
  programmeId,
}: {
  found: Found;
  programme: ProgrammeClient | null;
  programmeId: string | null;
}) {
  const { attest } = useSoroban();
  const a = found.attestation;
  const schemaHex = a ? Buffer.from(a.schema).toString('hex') : null;
  const schemaRead = useKeyedRead<Schema>(schemaHex, (uid) =>
    attest.get_schema({ uid: Buffer.from(uid, 'hex') }).then((r) => r.result.unwrap()),
  );
  const note = STATUS_NOTE[found.status];

  const rows: ReceiptRow[] = a
    ? [
        {
          label: 'Schema',
          value: (
            <span className="att-detail__schema">
              {schemaRead.status === 'ok' && <span>{schemaRead.data.definition}</span>}
              <span className="numeric" title={schemaHex ?? ''}>
                {short(schemaHex ?? '')}
              </span>
            </span>
          ),
          text: true,
        },
        { label: 'Signed by', value: <span title={a.attester}>{truncateAddress(a.attester, 6, 6)}</span> },
        { label: 'About', value: <span title={a.subject}>{truncateAddress(a.subject, 6, 6)}</span> },
        { label: 'Payload hash', value: short(Buffer.from(a.data_hash).toString('hex')) },
        { label: 'Signed', value: formatDateTime(a.created_at), text: true },
        ...(a.expires_at !== undefined && a.expires_at !== null
          ? [{ label: 'Expires', value: formatDateTime(a.expires_at), text: true }]
          : []),
        ...(a.revoked_at !== undefined && a.revoked_at !== null
          ? [{ label: 'Revoked', value: formatDateTime(a.revoked_at), text: true }]
          : []),
      ]
    : found.sample
      ? [
          { label: 'Schema', value: found.sample.schema },
          { label: 'Signed by', value: found.sample.attester },
          { label: 'About', value: found.sample.subject },
          { label: 'Signed at ledger', value: found.sample.ledger.toLocaleString('en-GB') },
          ...Object.entries(found.sample.data).map(([k, v]) => ({ label: k, value: String(v) })),
        ]
      : [];
  if (found.eventLedger !== undefined) rows.push({ label: 'Event ledger', value: found.eventLedger.toLocaleString('en-GB') });

  return (
    <section className="att-detail" aria-labelledby="att-detail-title">
      <p className="att-detail__eyebrow">
        Attestation {found.sample && <SampleTag />}
      </p>
      <h2 id="att-detail-title" className="att-detail__uid numeric">
        <span title={found.uid}>{short(found.uid)}</span>
        <CopyButton value={found.uid} label="Copy attestation id" />
      </h2>
      {found.role && <p className="att-detail__role">{ROLE_LABEL[found.role]}</p>}
      <Notice tone={note.tone}>
        <span>
          <strong>{STATUS_LABEL[found.status]}.</strong> {note.text}
        </span>
      </Notice>
      <div className="att-detail__usage">
        <span>Used here?</span>
        {/* Still checked when revoked: a proof revoked after it released must not hide that money moved. */}
        <SpentStatus programme={programme} uid={found.uid} />
      </div>
      {programmeId && (
        <p className="att-detail__fine">
          Usage checked against <span className="numeric">{programmeId}</span>
        </p>
      )}
      <Receipt rows={rows} />
      <p className="att-detail__fine">
        One attestation can unlock a tranche in two programmes that trust the same verifier and schema. That’s by design.
      </p>
    </section>
  );
}

const EMPTY_CLAIM_FORM = { uid: '', subject: '', schema: '', attester: '' };

/**
 * `/attestations`: look up any attestation with no sign-in.
 *
 * "Look up" takes a 64-character id (read with `attest.get`) or a G…/C…
 * address, which is searched in the attest contract's recent `Attested`
 * events as subject or signer, each hit re-read so its status is current.
 * Whether a proof was used is a per-programme fact, read from a programme
 * the reader names. Sample ids stay behind the sample tag.
 *
 * "Check a claim" answers the narrower question: does this subject hold a
 * valid claim under this schema from this signer.
 */
export const AttestationLookup = () => {
  usePageTitle('Attestation lookup');
  const { programmeAt, attest, rpcUrl } = useSoroban();
  const [mode, setMode] = useState<LookupMode>('id');

  const [programmeInput, setProgrammeInput] = useState('');
  const [programmeId, setProgrammeId] = useState<string | null>(null);
  const [programmeError, setProgrammeError] = useState<string | null>(null);
  const programme = useMemo(() => (programmeId ? programmeAt(programmeId) : null), [programmeAt, programmeId]);

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
  const [selected, setSelected] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSearched(query);
    setSelected(null);
  };

  const pick = (uid: string) => {
    setMode('id');
    setQuery(uid);
    setSearched(uid);
    setSelected(null);
  };

  const trimmed = searched.trim();
  const cleanHex = trimmed.toLowerCase();
  const isHex64 = /^[0-9a-f]{64}$/.test(cleanHex);
  const isAddress = isSearchableAddress(trimmed);
  const searchedYet = trimmed.length > 0;
  const [nowSeconds] = useState(() => Math.floor(Date.now() / 1000));

  const chainRead = useContractResult<Attestation>(() => attest.get({ uid: Buffer.from(cleanHex, 'hex') }), [attest, cleanHex], {
    enabled: isHex64,
  });
  const chainLoading = isHex64 && chainRead.loading;
  const chainNotFound = isHex64 && !chainRead.loading && Boolean(chainRead.error);

  const addressRead = useContractRead<AttestationSearch>(
    async () => ({ result: await searchAttestations(rpcServer(rpcUrl), attest, trimmed) }),
    [attest, rpcUrl, trimmed],
    { enabled: isAddress, contract: 'attest' },
  );
  // A new search keeps the previous result until it lands, so only one for the address on screen counts.
  const addressSearch = isAddress && addressRead.data?.address === trimmed ? addressRead.data : null;
  const addressError = isAddress && !addressSearch && addressRead.error ? explain(addressRead.error, 'attest').message : null;
  const addressLoading = isAddress && !addressSearch && !addressError;

  const samples =
    samplesEnabled() && searchedYet && !isHex64 && !isAddress
      ? FIXTURE_ATTESTATIONS.filter(
          (a) =>
            a.uid.toLowerCase() === cleanHex || a.subject.toLowerCase() === cleanHex || a.attester.toLowerCase() === cleanHex,
        )
      : [];

  const results: Found[] = isHex64
    ? chainRead.data && !chainRead.error
      ? [
          {
            uid: cleanHex,
            attestation: chainRead.data,
            status: attestationStatus(chainRead.data, nowSeconds),
          },
        ]
      : []
    : addressSearch
      ? addressSearch.matches.map((m) => ({
          uid: m.uid,
          attestation: m.attestation,
          status: m.attestation ? attestationStatus(m.attestation, nowSeconds) : 'unknown',
          role: m.role,
          eventLedger: m.ledger,
        }))
      : samples.map((s) => ({ uid: s.uid, attestation: null, sample: s, status: s.revoked ? 'revoked' : 'valid' }));
  const current = results.find((r) => r.uid === selected) ?? results[0] ?? null;

  // --- Check a claim ---------------------------------------------------------
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
    setClaimResult(null);
    setClaimError(null);
    if (Object.keys(errors).length > 0) return;
    setClaimChecking(true);
    try {
      setClaimResult(await verifyClaimOnChain(attest, claimForm));
    } catch (caught) {
      setClaimError(explain(caught, 'attest').message);
    } finally {
      setClaimChecking(false);
    }
  };

  return (
    <div className="attest-lookup">
      <PageHead eyebrow="Verify" title="Attestation lookup">
        <p>Check any attestation: who signed it, about whom, and whether it’s still valid. No sign-in needed.</p>
      </PageHead>

      <Segmented
        label="Lookup mode"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'id', label: 'Find an attestation' },
          { value: 'claim', label: 'Check a claim' },
        ]}
      />

      {mode === 'id' && (
        <>
          <div className="attest-lookup__panel">
            <form role="search" onSubmit={handleSubmit} className="attest-lookup__row">
              <Field
                label="Attestation id or address"
                hint="A 64-character id, or the address of a recipient or verifier."
                placeholder="Attestation id, recipient or verifier"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <Button type="submit" icon={<Search size={18} aria-hidden="true" />}>
                Look up
              </Button>
            </form>
            <form onSubmit={selectProgramme} className="attest-lookup__row">
              <Field
                label="Programme (to check whether a proof was used)"
                placeholder="C…"
                value={programmeInput}
                onChange={(event) => {
                  setProgrammeInput(event.target.value);
                  setProgrammeError(null);
                }}
                error={programmeError}
                hint="Use is per programme, so it isn’t guessed until you name one."
                autoComplete="off"
                spellCheck={false}
              />
              <Button type="submit" variant="secondary">
                Use programme
              </Button>
              {programmeId && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setProgrammeId(null);
                    setProgrammeInput('');
                  }}
                >
                  Clear
                </Button>
              )}
            </form>
            {samplesEnabled() && (
              <div className="attest-lookup__samples">
                <SampleTag />
                <span>Sample ids:</span>
                {FIXTURE_ATTESTATIONS.map((a) => (
                  <button key={a.uid} type="button" className="attest-lookup__sample numeric" onClick={() => pick(a.uid)}>
                    {a.uid}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div aria-live="polite" className="attest-lookup__status">
            {chainLoading && <p role="status">Reading the attestation from the chain…</p>}
            {addressLoading && <p role="status">Searching recent attestations for this address…</p>}
          </div>

          {(chainNotFound || (searchedYet && !isHex64 && !isAddress && samples.length === 0)) && (
            <Notice tone="warn" role="alert">
              <span>
                <strong>Nothing found for “{trimmed}”</strong>. Check the id. Attestations are read on the chain; archived
                ones need a keepalive before they can be read.
              </span>
            </Notice>
          )}

          {addressError && (
            <Notice tone="risk" role="alert">
              <span>
                <strong>Could not search attestations</strong>. {addressError}
              </span>
              <Button size="sm" variant="secondary" onClick={addressRead.refetch}>
                Try again
              </Button>
            </Notice>
          )}

          {addressSearch && (
            <p className="attest-lookup__window" role="note">
              {addressSearch.matches.length === 0
                ? 'No attestations name this address as recipient or verifier'
                : `${addressSearch.matches.length} attestation${addressSearch.matches.length === 1 ? '' : 's'} name this address`}{' '}
              in ledgers{' '}
              <span className="numeric">
                {addressSearch.window.fromLedger.toLocaleString()}–{addressSearch.window.toLedger.toLocaleString()}
              </span>{' '}
              ({describeWindow(addressSearch.window)}, the network’s event history). Older attestations are not listed
              here; look them up by id.
              {addressSearch.truncated && ' This contract was busy, so only the oldest part of that window was searched.'}
            </p>
          )}

          {results.length > 0 && current && (
            <div className="attest-lookup__results">
              <section aria-label="Results">
                <p className="attest-lookup__count">
                  {results.length} result{results.length === 1 ? '' : 's'}
                  {!current.sample && ' · read on the chain just now'}
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
                </ul>
              </section>
              <Detail key={current.uid} found={current} programme={programme} programmeId={programmeId} />
            </div>
          )}
        </>
      )}

      {mode === 'claim' && (
        <div className="attest-lookup__claim">
          <div className="attest-lookup__panel">
            <p className="attest-lookup__intro">
              Finding an attestation shows what it says. This answers a narrower question: does <em>this</em> recipient
              hold a valid claim under <em>this</em> schema from <em>this</em> signer? An attestation can be valid and still
              be the wrong one, so anything of value should be gated on this check, not on existence.
            </p>
            <form onSubmit={(e) => void handleClaimSubmit(e)} className="attest-lookup__claim-form" noValidate>
              <Field
                label="Attestation uid (hex)"
                placeholder="64 hex characters"
                value={claimForm.uid}
                onChange={updateClaimField('uid')}
                error={claimErrors.uid}
                spellCheck={false}
              />
              <Field
                label="Schema uid (hex)"
                placeholder="64 hex characters"
                value={claimForm.schema}
                onChange={updateClaimField('schema')}
                error={claimErrors.schema}
                spellCheck={false}
              />
              <Field
                label="Subject address"
                placeholder="G…"
                value={claimForm.subject}
                onChange={updateClaimField('subject')}
                error={claimErrors.subject}
                spellCheck={false}
              />
              <Field
                label="Attester address"
                placeholder="G…"
                value={claimForm.attester}
                onChange={updateClaimField('attester')}
                error={claimErrors.attester}
                spellCheck={false}
              />
              <div>
                <Button type="submit" loading={claimChecking} loadingLabel="Checking…">
                  Check claim
                </Button>
              </div>
            </form>
          </div>

          <div aria-live="polite">
            {claimError && !claimChecking && (
              <Notice tone="risk" role="alert">
                <span>{claimError}</span>
              </Notice>
            )}
            {claimResult && !claimChecking && (
              <Notice tone={claimResult.valid ? 'ok' : 'risk'}>
                <span>
                  <strong>{claimResult.valid ? 'Yes.' : 'No.'}</strong>{' '}
                  {claimResult.valid
                    ? 'This subject holds a valid claim under this schema from this attester.'
                    : claimResult.reason}
                </span>
              </Notice>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
