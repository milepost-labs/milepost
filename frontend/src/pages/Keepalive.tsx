import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Buffer } from 'buffer';
import { rpc } from '@stellar/stellar-sdk';
import { useAnnouncer } from '../context/useAnnouncer';
import { useSoroban } from '../context/useSoroban';
import { useWallet } from '../context/useWallet';
import { DEMO_PROGRAMME_ID } from '../context/sorobanStore';
import { useContractResult, useIndexedList, useProgrammeParam, useTransaction } from '../hooks';
import { ProgrammeParamNotice } from '../components/programme/ProgrammeParamNotice';
import { ErrorPanel, ErrorState, Loading } from '../components/state/AsyncStates';
import { Button, DisabledReason, Field, Notice, PageHead, SampleTag, Select } from '../components/ui';
import { RefreshCw } from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';
import { FIXTURE_PROGRAMMES } from '../fixtures/programmes';
import { fetchAwards, fetchProgrammes } from '../lib/indexer';
import { readProgrammeLifetimes, type EntryLifetimeRow } from '../lib/entryTtl';
import {
  FIXTURE_TTL,
  TTL_EXTENDED_DAYS,
  TTL_WARNING_DAYS,
  type KeepaliveTarget,
} from '../fixtures/keepaliveFixtures';
import { explain, type Explained } from '../lib/errors';
import './Keepalive.css';

type ExtendState = 'idle' | 'pending' | 'done' | 'error';

const PROGRAMME_ADDRESS = /^C[A-Z2-7]{55}$/;
const STELLAR_ADDRESS = /^G[A-Z2-7]{55}$/;
const HEX_32_BYTES = /^(0x)?[0-9a-fA-F]{64}$/;

/** One permissionless keepalive call, and what it extends. */
interface ExtendTarget {
  key: string;
  label: string;
  note: string;
  target: KeepaliveTarget;
}

const EXTEND_TARGETS: ExtendTarget[] = [
  {
    key: 'programme',
    label: 'Programme contract and this subject’s entries',
    note: 'The terms, phase and budget, plus the subject’s award, contribution and application',
    target: { contract: 'program' },
  },
  {
    key: 'standing',
    label: 'Recipient standing',
    note: 'The subject’s portable record',
    target: { contract: 'record' },
  },
  {
    key: 'attestation',
    label: 'One attestation',
    note: 'A single release proof, by id',
    target: { contract: 'attest', uid: '' },
  },
];

/**
 * Keepalive (Screen 10, Keepalive).
 *
 * Soroban entries that are not bumped become unreadable when their TTL
 * expires, and an archived programme reads as absent rather than as an error.
 * This screen makes expiry visible before it bites: one row per entry group
 * with days left, a warning fill under 30 days, and a way to extend them.
 *
 * Real programmes show lifetimes read from the RPC (`getLedgerEntries`, see
 * `lib/entryTtl.ts`): the contract instance and every award the published
 * index names. Contributions and applications are keyed by addresses nothing
 * publishes, so the page says they were not checked. Extending is real: each
 * target sends the matching permissionless `keepalive` call (`program`,
 * `attest` or `record`) through `useTransaction`, and every failure is shown
 * through `explain()`. The sample programmes keep `FIXTURE_TTL` and the
 * "Sample data" tag, and cannot be extended: there is no contract behind them.
 */
export const Keepalive = () => {
  usePageTitle('Keepalive');
  const announce = useAnnouncer();
  const programmeParam = useProgrammeParam();
  const { rpcUrl, programmeAt, attest, record } = useSoroban();
  const { address } = useWallet();

  const linkedProgrammeId =
    programmeParam.status === 'valid' ? programmeParam.programmeId : null;
  const [selectedProgrammeId, setSelectedProgrammeId] = useState<string | null>(null);
  const programmeId = selectedProgrammeId ?? linkedProgrammeId ?? DEMO_PROGRAMME_ID;

  const isSample = FIXTURE_PROGRAMMES.some((p) => p.id === programmeId);
  const indexed = useIndexedList(fetchProgrammes, []);
  const programmeOptions = useMemo(() => {
    const real = new Map<string, string>();
    if (linkedProgrammeId) real.set(linkedProgrammeId, linkedProgrammeId);
    if (DEMO_PROGRAMME_ID) real.set(DEMO_PROGRAMME_ID, 'Seeded testnet programme');
    for (const p of indexed.data ?? []) real.set(p.id, p.name ?? p.id);
    return [
      ...[...real].map(([value, label]) => ({ value, label })),
      ...FIXTURE_PROGRAMMES.map((p) => ({ value: p.id, label: `${p.name ?? p.id} (sample)` })),
    ];
  }, [indexed.data, linkedProgrammeId]);

  // Real lifetimes.
  const server = useMemo(
    () => new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') }),
    [rpcUrl],
  );
  const awards = useIndexedList(() => fetchAwards(programmeId), [programmeId], {
    enabled: !isSample,
  });
  // A programme with no published awards has no awards.json; that is not a failure here.
  const recipients = useMemo(
    () => (awards.data ?? []).map((a) => a.recipient),
    [awards.data],
  );
  const lifetimes = useIndexedList(
    () => readProgrammeLifetimes(server, programmeId, recipients),
    [server, programmeId, recipients],
    { enabled: !isSample && !awards.fetching },
  );

  // Real extensions.
  const programme = useMemo(
    () =>
      !isSample && PROGRAMME_ADDRESS.test(programmeId) && !programmeParam.blocksProgramme
        ? programmeAt(programmeId)
        : null,
    [isSample, programmeAt, programmeId, programmeParam.blocksProgramme],
  );
  const phase = useContractResult(
    () => programme!.get_phase(),
    [programme],
    { contract: 'program', enabled: Boolean(programme) },
  );

  const [subjectOverride, setSubjectOverride] = useState<string | null>(null);
  const subjectInput = subjectOverride ?? address ?? '';
  const [attestationInput, setAttestationInput] = useState('');
  const subject = subjectInput.trim();
  const subjectValid = STELLAR_ADDRESS.test(subject);
  const attestationUid = attestationInput.trim().replace(/^0x/i, '');
  const attestationValid = HEX_32_BYTES.test(attestationUid);

  const [extendRows, setExtendRows] = useState<
    Record<string, { state: ExtendState; error?: Explained }>
  >({});

  const currentKey = useRef<string | null>(null);
  const lastError = useRef<Explained | null>(null);
  const markError = (error: Explained) => {
    lastError.current = error;
    const key = currentKey.current;
    if (!key) return;
    setExtendRows((previous) => ({ ...previous, [key]: { state: 'error', error } }));
  };

  const programTx = useTransaction<void>({ contract: 'program', onError: markError });
  const recordTx = useTransaction<void>({ contract: 'record', onError: markError });
  const attestTx = useTransaction<void>({ contract: 'attest', onError: markError });

  const phaseReason = phase.error
    ? explain(phase.error, 'program').message
    : phase.loading && !phase.data
      ? 'Reading the programme phase…'
      : null;
  const blockedReason = programmeParam.blocksProgramme
    ? programmeParam.message
    : !address
      ? 'Connect a wallet to pay the network fee.'
      : phaseReason;

  const targetReason = (item: ExtendTarget): string | null => {
    if (blockedReason) return blockedReason;
    if (item.target.contract === 'attest') {
      return attestationValid
        ? null
        : 'Paste the 32-byte hex id of the attestation you want to extend.';
    }
    return subjectValid ? null : 'Enter the subject address whose entries you are extending.';
  };

  const sendableFor = async (item: ExtendTarget) => {
    const built =
      item.target.contract === 'attest'
        ? await attest.keepalive({ uid: Buffer.from(attestationUid, 'hex') })
        : item.target.contract === 'record'
          ? await record.keepalive({ subject })
          : await (() => {
              if (!programme) throw new Error('Choose a real programme first.');
              return programme.keepalive({ subject });
            })();
    return {
      signAndSend: async (options: Parameters<typeof built.signAndSend>[0]) => {
        const sent = await built.signAndSend(options);
        sent.result.unwrap();
        return { result: undefined };
      },
    };
  };

  /** Send one keepalive. Resolves to whether it went through; never throws. */
  const runTarget = async (item: ExtendTarget): Promise<boolean> => {
    if (targetReason(item)) return false;
    currentKey.current = item.key;
    lastError.current = null;
    setExtendRows((previous) => ({ ...previous, [item.key]: { state: 'pending' } }));

    const tx =
      item.target.contract === 'attest'
        ? attestTx
        : item.target.contract === 'record'
          ? recordTx
          : programTx;
    const result = await tx.send(() => sendableFor(item));
    if (result !== null) {
      setExtendRows((previous) => ({ ...previous, [item.key]: { state: 'done' } }));
      return true;
    }
    setExtendRows((previous) => ({
      ...previous,
      [item.key]: { state: 'error', error: lastError.current ?? undefined },
    }));
    return false;
  };

  const [bulkRunning, setBulkRunning] = useState(false);

  const extendTarget = async (item: ExtendTarget) => {
    setBulkRunning(false);
    if (await runTarget(item)) {
      announce(`Extended ${item.label} for about ${TTL_EXTENDED_DAYS} days.`);
      lifetimes.refetch();
      phase.refetch();
    }
  };

  const extendable = EXTEND_TARGETS.filter((item) => !targetReason(item));

  /** Extend every target that can be extended, carrying on past failures. */
  const extendAll = async () => {
    setBulkRunning(true);
    let extended = 0;
    let failed = 0;
    for (const item of extendable) {
      if (await runTarget(item)) extended++;
      else failed++;
    }
    setBulkRunning(false);
    lifetimes.refetch();
    phase.refetch();
    announce(
      `Extended ${extended} of ${extendable.length} entries.${failed > 0 ? ` ${failed} failed.` : ''}`,
      failed > 0 ? 'alert' : 'status',
    );
  };

  const rows = lifetimes.data?.rows ?? null;
  const lowCount = isSample
    ? FIXTURE_TTL.filter((e) => e.liveForDays < TTL_WARNING_DAYS).length
    : (rows ?? []).filter((r) => r.liveForDays !== null && r.liveForDays < TTL_WARNING_DAYS).length;

  return (
    <div className="keepalive-page">
      <PageHead
        eyebrow="Admin"
        title="Keepalive"
        action={
          !isSample && extendable.length > 1 ? (
            <Button
              icon={<RefreshCw size={18} aria-hidden="true" />}
              onClick={() => void extendAll()}
              loading={bulkRunning}
              loadingLabel="Extending…"
            >
              Extend all {extendable.length}
            </Button>
          ) : undefined
        }
      >
        <p>
          Data on Stellar is archived unless someone pays a small fee to extend it. See how long a programme’s stored
          entries have left, and extend them. Anyone can do this; the fee comes from your wallet.
        </p>
      </PageHead>

      <ProgrammeParamNotice state={programmeParam} />

      <div className="keepalive-page__programme">
        <Select
          label="Programme"
          value={programmeId}
          onChange={(event) => {
            setSelectedProgrammeId(event.target.value);
            setExtendRows({});
                  }}
          options={programmeOptions}
        />
      </div>

      {(isSample || rows) &&
        (lowCount > 0 ? (
          <Notice tone="warn" role="status">
            <span>
              <strong>
                {lowCount} {lowCount === 1 ? 'entry' : 'entries'} under {TTL_WARNING_DAYS} days.
              </strong>{' '}
              An archived award or contribution can’t be released or refunded until it’s restored, which costs more.
            </span>
          </Notice>
        ) : (
          <Notice tone="ok" role="status">
            <span>Everything read here has more than {TTL_WARNING_DAYS} days left.</span>
          </Notice>
        ))}

      {!isSample && (
        <>
          <section className="keepalive-page__panel" aria-labelledby="ttl-heading">
            <h2 id="ttl-heading">Entry lifetimes</h2>
            <RealLifetimes
              loading={awards.fetching || lifetimes.loading}
              error={lifetimes.error}
              rows={rows}
              unchecked={lifetimes.data?.unchecked ?? []}
              onRetry={lifetimes.refetch}
            />
          </section>

          <section className="keepalive-page__panel" aria-labelledby="extend-heading">
            <h2 id="extend-heading">Extend</h2>
            <p className="keepalive-page__fine">
              Each keepalive extends the entries it names by about {TTL_EXTENDED_DAYS} days.
            </p>
            <div className="keepalive-page__targets">
              <Field
                label="Subject address"
                hint="The recipient or donor whose entries you are extending."
                placeholder="G…"
                value={subjectInput}
                onChange={(event) => setSubjectOverride(event.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <Field
                label="Attestation id"
                hint="Only for the single-attestation row: 64 hex characters."
                placeholder="0x…"
                value={attestationInput}
                onChange={(event) => setAttestationInput(event.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            {blockedReason && <DisabledReason>{blockedReason}</DisabledReason>}

            <ul className="ttl-rows">
              {EXTEND_TARGETS.map((item) => {
                const row = extendRows[item.key];
                const entryState = row?.state ?? 'idle';
                const reason = targetReason(item);
                return (
                  <li key={item.key} className="ttl-row">
                    <span className="ttl-row__text">
                      <span className="ttl-row__label">{item.label}</span>
                      <span className="ttl-row__note">{item.note}</span>
                    </span>
                    <Button
                      variant={entryState === 'done' ? 'ghost' : 'secondary'}
                      size="sm"
                      disabled={entryState === 'pending' || Boolean(reason)}
                      loading={entryState === 'pending'}
                      loadingLabel="Extending…"
                      onClick={() => void extendTarget(item)}
                    >
                      {entryState === 'done' ? 'Extend again' : 'Extend'}
                    </Button>
                    {reason && entryState === 'idle' && !blockedReason && (
                      <span className="ttl-row__status" role="note">
                        {reason}
                      </span>
                    )}
                    {entryState === 'pending' && (
                      <span className="ttl-row__status">Approve it in Freighter. Nothing changes until the network confirms.</span>
                    )}
                    {entryState === 'done' && (
                      <span className="ttl-row__status ttl-row__status--done" role="status">
                        Extended — about {TTL_EXTENDED_DAYS} days left.
                      </span>
                    )}
                    {entryState === 'error' && row?.error && (
                      <div className="ttl-row__error">
                        <ErrorPanel explained={row.error} live={false} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {extendable.length > 1 && (
              <p className="keepalive-page__fine">Extend all: {extendable.map((item) => item.label).join(' · ')}</p>
            )}
          </section>
        </>
      )}

      {isSample && (
        <section className="keepalive-page__panel" aria-labelledby="ttl-sample">
          <h2 id="ttl-sample">
            Entry lifetimes <SampleTag />
          </h2>
          <p className="keepalive-page__fine" role="note">
            This is a sample programme, so there’s nothing to extend. These lifetimes are not read from the chain.
          </p>
          <ul className="ttl-rows">
            {FIXTURE_TTL.map((entry) => {
              const low = entry.liveForDays < TTL_WARNING_DAYS;
              return (
                <li key={entry.key} className={`ttl-row${low ? ' ttl-row--low' : ''}`}>
                  <span className="ttl-row__text">
                    <span className="ttl-row__label">{entry.label}</span>
                    <span className="ttl-row__note">{entry.note}</span>
                  </span>
                  <Lifetime days={entry.liveForDays} />
                  <Button variant="secondary" size="sm" disabled>
                    Extend
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="keepalive-page__fine">
        Extending costs a network fee in XLM, paid by you. A single attestation can also be found on its{' '}
        <Link to="/attestations">lookup page</Link>.
      </p>
    </div>
  );
};

/** Days left, with a bar against a full extension and a warning colour under the threshold. */
function Lifetime({ days }: { days: number | null }) {
  const low = days !== null && days < TTL_WARNING_DAYS;
  return (
    <span className={`ttl-life${low ? ' ttl-life--low' : ''}`}>
      <span className="ttl-life__days numeric">
        {days === null ? 'Not found' : `${days} days`}
        {low && <span className="ttl-life__warn"> · under {TTL_WARNING_DAYS}, extend soon</span>}
      </span>
      <span className="ttl-life__bar" aria-hidden="true">
        <span style={{ width: `${days === null ? 0 : Math.min(100, Math.round((days / TTL_EXTENDED_DAYS) * 100))}%` }} />
      </span>
    </span>
  );
}

function RealLifetimes({
  loading,
  error,
  rows,
  unchecked,
  onRetry,
}: {
  loading: boolean;
  error: unknown;
  rows: EntryLifetimeRow[] | null;
  unchecked: string[];
  onRetry: () => void;
}) {
  if (loading && !rows) return <Loading label="Reading entry lifetimes" rows={2} />;
  if (error && !rows) return <ErrorState error={error} onRetry={onRetry} />;
  if (!rows) return null;

  return (
    <>
      <ul className="ttl-rows">
        {rows.map((row) => {
          const low = row.liveForDays !== null && row.liveForDays < TTL_WARNING_DAYS;
          return (
            <li key={row.key} className={`ttl-row${low ? ' ttl-row--low' : ''}`}>
              <span className="ttl-row__text">
                <span className="ttl-row__label">{row.label}</span>
                <span className="ttl-row__note">{row.note}</span>
              </span>
              <Lifetime days={row.liveForDays} />
            </li>
          );
        })}
      </ul>
      {unchecked.length > 0 && (
        <p className="keepalive-page__fine">
          Not checked: {unchecked.join(' and ')}. Their entries are keyed by contributor and
          applicant addresses that are not published, so they can&rsquo;t be looked up from here.
        </p>
      )}
    </>
  );
}
