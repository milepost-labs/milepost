import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ProgrammeConfig } from '@milepost/program';
import { useSoroban } from '../context/useSoroban';
import { useWallet } from '../context/useWallet';
import { useAnnouncer } from '../context/useAnnouncer';
import { useContractResult, useProgrammeParam, useTransaction } from '../hooks';
import { AddressChip, Badge, Button, DisabledReason, Field, Notice, PageHead, RadioGroup, TextArea, SampleTag } from '../components/ui';
import { ProgrammeParamNotice } from '../components/programme/ProgrammeParamNotice';
import { Empty, ErrorPanel, ErrorState, PendingState } from '../components/state/AsyncStates';
import { TxSheet } from '../components/state/TxSheet';
import { usePageTitle } from '../hooks/usePageTitle';
import { truncateAddress } from '../lib/format';
import { FIXTURE_PROGRAMMES } from '../fixtures/programmes';
import { FIXTURE_PAYEES, type PayeeFixture } from '../fixtures/payeeFixtures';
import {
  bulkBatchDone,
  bulkBatchFailed,
  bulkBatchStart,
  bulkCheckSummary,
  chunkAddresses,
  classifyBulkAddresses,
  countBulkAddresses,
  parseBulkAddresses,
  type BulkAddress,
  type BulkMode,
} from './payeeBulk';
import './PayeeManagement.css';

const PROGRAMME_ADDRESS = /^C[A-Z2-7]{55}$/;
const PAYEE_ADDRESS = /^G[A-Z2-7]{55}$/;

type PayeeStatus = 'checking' | 'verified' | 'unverified' | 'error';

function isSampleProgramme(programmeId: string): boolean {
  return FIXTURE_PROGRAMMES.some((p) => p.id === programmeId);
}

interface SessionChange {
  address: string;
  label: string;
  action: 'added' | 'removed';
}

const storageKey = (programmeId: string) => `milepost:programme-payees:${programmeId}`;

function loadCandidates(programmeId: string): PayeeFixture[] {
  if (!isSampleProgramme(programmeId)) {
    return [];
  }
  try {
    const stored = window.localStorage.getItem(storageKey(programmeId));
    if (stored) return JSON.parse(stored) as PayeeFixture[];
  } catch {
    // Corrupt or inaccessible storage — fall back to the seed below.
  }
  return FIXTURE_PAYEES[programmeId] ?? [];
}

/**
 * Payee management.
 *
 * `program` has no `list_payees`: `is_payee` confirms one address at a time,
 * so — exactly like `RecipientDashboard.tsx`'s own payee picker — the list
 * shown here is a locally-remembered set of candidates, each re-checked
 * on-chain. Verifying and removing (`allow_payee` / `deny_payee`) are real
 * writes, gated on the connected wallet being the programme's creator, which
 * the contract itself enforces regardless of what this page allows the user
 * to click. Batch verification and any change to how the contract stores
 * payees are out of scope.
 */
export const PayeeManagement = () => {
  usePageTitle('Payees');
  const { programmeAt } = useSoroban();
  const wallet = useWallet();
  const programmeParam = useProgrammeParam();
  const [searchParams, setSearchParams] = useSearchParams();

  const linkedProgrammeId =
    programmeParam.status === 'valid' ? programmeParam.programmeId : null;
  const [programmeInputOverride, setProgrammeInputOverride] = useState<string | null>(null);
  const [programmeIdOverride, setProgrammeIdOverride] = useState<string | null>(null);
  const [programmeError, setProgrammeError] = useState<string | null>(null);

  // A valid ?programme= link fills the field until someone types over it.
  const programmeInput = programmeInputOverride ?? linkedProgrammeId ?? '';
  const programmeId = programmeIdOverride ?? linkedProgrammeId;

  const programme = useMemo(
    () => (programmeId ? programmeAt(programmeId) : null),
    [programmeAt, programmeId],
  );

  const config = useContractResult<ProgrammeConfig>(
    () => programme!.get_config(),
    [programme],
    {
      contract: 'program',
      enabled: Boolean(programme) && !programmeParam.blocksProgramme,
    },
  );
  const isCreator = Boolean(
    wallet.address &&
      config.data &&
      !config.fetching &&
      config.data.creator === wallet.address,
  );
  const isSample = programmeId !== null && isSampleProgramme(programmeId);

  const [sessionChanges, setSessionChanges] = useState<Record<string, SessionChange[]>>({});
  // Session changes are kept per programme; with no programme chosen there are none.
  const sessionKey = programmeId ?? '';
  const currentSessionChanges = sessionChanges[sessionKey] ?? [];

  const [checkInput, setCheckInput] = useState('');
  const [checkError, setCheckError] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<{ address: string; verified: boolean } | null>(null);
  const [checkLoading, setCheckLoading] = useState(false);

  const handleCheckAddress = async () => {
    if (!programme) return;
    const addr = checkInput.trim();
    if (!PAYEE_ADDRESS.test(addr)) {
      setCheckError('Enter a valid Stellar address.');
      return;
    }
    setCheckError(null);
    setCheckLoading(true);
    try {
      const { result } = await programme.is_payee({ payee: addr });
      setCheckResult({ address: addr, verified: Boolean(result) });
    } catch {
      setCheckError('Could not check address on-chain.');
    } finally {
      setCheckLoading(false);
    }
  };

  const [sessionAdds, setSessionAdds] = useState<Record<string, PayeeFixture[]>>({});
  const candidates = useMemo(() => {
    if (!programmeId) return [];
    const stored = loadCandidates(programmeId);
    const extra = (sessionAdds[programmeId] ?? []).filter(
      (c) => !stored.some((s) => s.address === c.address),
    );
    return [...stored, ...extra];
  }, [programmeId, sessionAdds]);

  const [statusByAddress, setStatusByAddress] = useState<Record<string, PayeeStatus>>({});
  useEffect(() => {
    if (!programme || candidates.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        candidates.map(async (c): Promise<[string, PayeeStatus]> => {
          try {
            const { result } = await programme.is_payee({ payee: c.address });
            return [c.address, result ? 'verified' : 'unverified'];
          } catch {
            return [c.address, 'error'];
          }
        }),
      );
      if (cancelled) return;
      setStatusByAddress((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    })();
    return () => {
      cancelled = true;
    };
  }, [programme, candidates]);

  const remember = (payee: PayeeFixture) => {
    if (!programmeId) return;
    if (candidates.some((c) => c.address === payee.address)) return;
    try {
      const next = [...loadCandidates(programmeId), payee];
      window.localStorage.setItem(storageKey(programmeId), JSON.stringify(next));
    } catch {
      // Best-effort only — sessionAdds below still carries it for this session.
    }
    setSessionAdds((prev) => ({
      ...prev,
      [sessionKey]: [...(prev[sessionKey] ?? []), payee],
    }));
  };

  const handleLookupProgramme = () => {
    const value = programmeInput.trim();
    if (!isSampleProgramme(value) && !PROGRAMME_ADDRESS.test(value)) {
      setProgrammeError('Enter a valid programme contract address.');
      return;
    }
    setProgrammeError(null);
    setProgrammeInputOverride(value);
    setProgrammeIdOverride(value);
    const next = new URLSearchParams(searchParams);
    next.set('programme', value);
    setSearchParams(next, { replace: true });
  };

  const [addressInput, setAddressInput] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  // The single verify or remove in flight, shown in a sheet.
  const [single, setSingle] = useState<{ kind: 'verify' | 'remove'; address: string; label: string } | null>(null);
  const tx = useTransaction({ contract: 'program' });

  const handleVerify = (event: FormEvent) => {
    event.preventDefault();
    if (!programme) {
      setAddError('Choose a programme first.');
      return;
    }
    const address = addressInput.trim();
    if (!PAYEE_ADDRESS.test(address)) {
      setAddError('Enter a valid Stellar address.');
      return;
    }
    setAddError(null);
    const lbl = labelInput.trim() || 'Verified payee';
    setSingle({ kind: 'verify', address, label: lbl });
    void tx.send(() => programme.allow_payee({ payee: address })).then((res) => {
      if (res === null) return;
      remember({ address, label: lbl });
      setSessionChanges((prev) => ({
        ...prev,
        [sessionKey]: [
          { address, label: lbl, action: 'added' },
          ...(prev[sessionKey] ?? []).filter((c) => c.address !== address),
        ],
      }));
      setAddressInput('');
      setLabelInput('');
    });
  };

  const handleRevoke = (address: string) => {
    if (!programme || !programmeId) return;
    setSingle({ kind: 'remove', address, label: '' });
    void tx.send(() => programme.deny_payee({ payee: address })).then((res) => {
      if (res !== null) {
        setSessionChanges((prev) => ({
          ...prev,
          [sessionKey]: [
            { address, label: 'Removed payee', action: 'removed' },
            ...(prev[sessionKey] ?? []).filter((c) => c.address !== address),
          ],
        }));
      }
    });
  };

  const canSubmit = Boolean(programme) && isCreator && PAYEE_ADDRESS.test(addressInput.trim());

  // --- Bulk verify / remove (issue #340) ---------------------------------
  const [bulkMode, setBulkMode] = useState<BulkMode>('verify');
  const [bulkText, setBulkText] = useState('');
  const [bulkResults, setBulkResults] = useState<BulkAddress[] | null>(null);
  const [bulkChecking, setBulkChecking] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkSending, setBulkSending] = useState(false);

  // Issue #482: progress between the first batch and the last has to reach a
  // screen reader, so every batch speaks through the shared announcer — the
  // inline progress line below is visual only and carries no live semantics.
  const announce = useAnnouncer();

  // The failure reason `explain()` produced for the batch currently in flight.
  // `bulkTx.error` is state and lands a render later; the announcement goes
  // out the moment the send gives up, so the reason is captured as it happens.
  const bulkFailureReason = useRef<string | null>(null);
  const bulkTx = useTransaction({
    contract: 'program',
    onError: (error) => {
      bulkFailureReason.current = error.message;
    },
  });

  const eligibleAddresses = useMemo(
    () => (bulkResults ?? []).filter((entry) => entry.status === 'eligible').map((entry) => entry.address),
    [bulkResults],
  );
  const batches = useMemo(() => chunkAddresses(eligibleAddresses), [eligibleAddresses]);

  const handleCheckBulk = async () => {
    if (!programme) return;
    setBulkChecking(true);
    setBulkResults(null);
    bulkTx.reset();
    try {
      const results = await classifyBulkAddresses(bulkText, bulkMode, async (address) => {
        const { result } = await programme.is_payee({ payee: address });
        return result;
      });
      setBulkResults(results);
    } finally {
      setBulkChecking(false);
    }
  };

  const handleSendBulk = async () => {
    if (!programme) return;
    setBulkSending(true);
    setBulkProgress({ done: 0, total: batches.length });
    const verifiedInThisRun: string[] = [];
    const total = batches.length;
    const requested = eligibleAddresses.length;
    let succeeded = 0;
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const call = bulkMode === 'verify' ? programme.allow_payees : programme.deny_payees;
      // Start and result are two separate polite announcements: a batch can
      // take longer than a screen reader would otherwise infer from the
      // press, and a failure interrupts with what already landed (issue #482).
      announce(bulkBatchStart(i + 1, total, batch.length, bulkMode));
      bulkFailureReason.current = null;
      const result = await bulkTx.send(() => call({ payees: batch }));
      if (result === null) {
        // Failed or blocked: stop rather than skip ahead. The batches
        // already sent are real on-chain writes and stay done; the
        // remaining ones are simply not attempted yet, so retrying (once
        // whatever failed is fixed) picks up from here rather than
        // resending what already landed.
        setBulkProgress({ done: i, total });
        setBulkSending(false);
        announce(
          bulkBatchFailed(i + 1, total, succeeded, requested, bulkMode, bulkFailureReason.current),
          'alert',
        );
        return;
      }
      succeeded += batch.length;
      if (bulkMode === 'verify') verifiedInThisRun.push(...batch);
      announce(bulkBatchDone(i + 1, total, batch.length, bulkMode));
      setBulkProgress({ done: i + 1, total });
    }
    for (const address of verifiedInThisRun) {
      remember({ address, label: 'Bulk verified' });
    }
    if (verifiedInThisRun.length > 0) {
      setSessionChanges((prev) => ({
        ...prev,
        [sessionKey]: [
          ...verifiedInThisRun.map((address) => ({ address, label: 'Bulk verified', action: 'added' as const })),
          ...(prev[sessionKey] ?? []).filter((c) => !verifiedInThisRun.includes(c.address)),
        ],
      }));
    }
    if (bulkMode === 'remove' && eligibleAddresses.length > 0) {
      setSessionChanges((prev) => ({
        ...prev,
        [sessionKey]: [
          ...eligibleAddresses.map((address) => ({ address, label: 'Bulk removed', action: 'removed' as const })),
          ...(prev[sessionKey] ?? []).filter((c) => !eligibleAddresses.includes(c.address)),
        ],
      }));
    }
    setBulkText('');
    setBulkResults(null);
    setBulkProgress(null);
    setBulkSending(false);
  };

  const bulkCounts = useMemo(() => countBulkAddresses(bulkResults), [bulkResults]);

  const creatorReason = !wallet.address
    ? 'Sign in with the creator’s address to verify or remove payees.'
    : !isCreator
      ? 'Only the programme’s creator can verify or remove payees.'
      : null;

  return (
    <div className="payee-mgmt">
      <PageHead eyebrow="Admin" title="Payees">
        <p>
          Verified payees are who Direct awards pay and who recipients can choose in Allocated mode. Only the
          programme’s creator can change this list.
        </p>
      </PageHead>

      <ProgrammeParamNotice state={programmeParam} />

      <form
        className="payee-mgmt__programme"
        onSubmit={(event) => {
          event.preventDefault();
          handleLookupProgramme();
        }}
      >
        <Field
          label="Programme address"
          value={programmeInput}
          onChange={(event) => {
            setProgrammeInputOverride(event.target.value);
            setProgrammeError(null);
          }}
          error={programmeError}
          hint="Open this page from a programme to fill it in."
          autoComplete="off"
          spellCheck={false}
        />
        <Button type="submit" variant="secondary">
          Look up
        </Button>
        {config.data && (
          <p className="payee-mgmt__creator">
            Creator <AddressChip address={config.data.creator} copyLabel="Copy creator address" />
          </p>
        )}
      </form>

      {!programme || programmeParam.blocksProgramme ? (
        <Empty
          title="Choose a programme"
          description="Paste a programme contract address above, or open Payees from the programme’s page. Nothing is preselected."
        />
      ) : config.error ? (
        <ErrorState error={config.error} contract="program" onRetry={config.refetch} />
      ) : config.loading && !config.data ? (
        <PendingState title="Reading the programme…" note="Checking who created it and whether you can manage its payees." />
      ) : (
        <>
          {!wallet.address ? (
            <Notice tone="info">
              <span>
                <strong>Sign in to verify or remove a payee.</strong> Anyone can check an address. Only the programme’s
                creator can change the list.
              </span>
              <Button size="sm" variant="secondary" onClick={() => void wallet.connect()}>
                Sign in
              </Button>
            </Notice>
          ) : (
            !isCreator &&
            config.data && (
              <Notice tone="warn" role="note">
                <span>
                  <strong>You’re not this programme’s creator.</strong> Only the programme&rsquo;s creator can verify or
                  remove payees: <span className="numeric">{truncateAddress(config.data.creator)}</span>. You can still
                  check any address.
                </span>
              </Notice>
            )
          )}

          <div className="payee-mgmt__grid">
            <section className="payee-mgmt__panel" aria-labelledby="payee-list">
              <h2 id="payee-list">
                {isSample ? 'Verified payees' : 'Payees changed in this tab'} {isSample && <SampleTag />}
              </h2>
              {isSample ? (
                candidates.length === 0 ? (
                  <p className="payee-mgmt__fine">
                    No payees yet. Until one is verified, no Direct or Allocated tranche can be paid.
                  </p>
                ) : (
                  <ul className="payee-mgmt__list">
                    {candidates.map((candidate) => {
                      const status = statusByAddress[candidate.address] ?? 'checking';
                      const tone =
                        status === 'verified' ? 'success' : status === 'error' ? 'warning' : status === 'checking' ? 'neutral' : 'danger';
                      const label =
                        status === 'verified'
                          ? 'Verified'
                          : status === 'checking'
                            ? 'Checking…'
                            : status === 'error'
                              ? 'Could not check'
                              : 'Not verified';
                      return (
                        <li key={candidate.address}>
                          <span className="payee-mgmt__who">
                            <b>{candidate.label}</b>
                            <AddressChip address={candidate.address} copyLabel="Copy payee address" />
                          </span>
                          <span className="payee-mgmt__row-actions">
                            <Badge tone={tone}>{label}</Badge>
                            {isCreator && status === 'verified' && (
                              <Button size="sm" variant="danger" onClick={() => handleRevoke(candidate.address)}>
                                Remove
                              </Button>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )
              ) : currentSessionChanges.length === 0 ? (
                <p className="payee-mgmt__fine">
                  The contract can’t list a programme’s payees, only confirm one at a time. Payees you verify or remove
                  here are listed for this tab; check any other address below.
                </p>
              ) : (
                <ul className="payee-mgmt__list">
                  {currentSessionChanges.map((entry) => (
                    <li key={entry.address}>
                      <span className="payee-mgmt__who">
                        <b>{entry.label}</b>
                        <AddressChip address={entry.address} copyLabel="Copy payee address" />
                      </span>
                      <span className="payee-mgmt__row-actions">
                        <Badge tone="neutral">Session-only</Badge>
                        <Badge tone={entry.action === 'added' ? 'success' : 'danger'}>
                          {entry.action === 'added' ? 'Verified' : 'Removed'}
                        </Badge>
                        {isCreator && entry.action === 'added' && (
                          <Button size="sm" variant="danger" onClick={() => handleRevoke(entry.address)}>
                            Remove
                          </Button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="payee-mgmt__fine">
                Removing a payee doesn’t touch money already paid. Escrowed Allocated money can’t go to them afterwards.
              </p>

              <div className="payee-mgmt__check">
                <h3>Check an address</h3>
                <div className="payee-mgmt__row">
                  <Field
                    label="Check payee address"
                    placeholder="G…"
                    value={checkInput}
                    onChange={(event) => {
                      setCheckInput(event.target.value);
                      setCheckError(null);
                    }}
                    error={checkError}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <Button
                    variant="secondary"
                    onClick={() => void handleCheckAddress()}
                    loading={checkLoading}
                    disabled={!checkInput.trim()}
                  >
                    Check address
                  </Button>
                </div>
                {checkResult && (
                  <p className="payee-mgmt__check-result" role="status">
                    <AddressChip address={checkResult.address} copyLabel="Copy checked address" />
                    <Badge tone={checkResult.verified ? 'success' : 'danger'}>
                      {checkResult.verified ? 'Verified on-chain' : 'Not verified'}
                    </Badge>
                  </p>
                )}
              </div>
            </section>

            <aside className="payee-mgmt__aside" aria-labelledby="payee-add">
              <h2 id="payee-add">Verify a payee</h2>
              <form onSubmit={handleVerify} className="payee-mgmt__form">
                <Field
                  label="Label"
                  placeholder="e.g. Riverside Clinic"
                  hint="Shown in this app only. The contract stores the address, not a name."
                  value={labelInput}
                  onChange={(event) => setLabelInput(event.target.value)}
                  disabled={!isCreator}
                />
                <Field
                  label="Payee address"
                  placeholder="G…"
                  value={addressInput}
                  onChange={(event) => {
                    setAddressInput(event.target.value);
                    setAddError(null);
                  }}
                  error={addError}
                  hint="Check it with the payee directly. A payment to a wrong address can’t be reversed."
                  disabled={!isCreator}
                  autoComplete="off"
                  spellCheck={false}
                />
                <Button type="submit" fullWidth disabled={!canSubmit || tx.busy}>
                  Verify payee
                </Button>
                {creatorReason && <DisabledReason>{creatorReason}</DisabledReason>}
              </form>
            </aside>
          </div>

          <section className="payee-mgmt__panel" aria-labelledby="payee-bulk">
            <h2 id="payee-bulk">Verify or remove payees in bulk</h2>
            <p className="payee-mgmt__fine">
              A programme paying fifty schools needs fifty payees verified. Paste one address per line; each is checked
              against its current status before anything is sent. Duplicates and addresses already in the state you ask
              for are skipped, not rejected.
            </p>
            {wallet.address && !isCreator && (
              <p className="payee-mgmt__fine" role="note">
                Only the programme&rsquo;s creator can verify or remove payees.
              </p>
            )}
            <div className="payee-mgmt__bulk-form">
              <RadioGroup
                label="Action"
                name="bulk-mode"
                value={bulkMode}
                onChange={(value) => {
                  setBulkMode(value);
                  setBulkResults(null);
                }}
                options={[
                  { value: 'verify', label: 'Verify', description: 'Allow these addresses to receive payments.' },
                  { value: 'remove', label: 'Remove', description: 'Stop these addresses receiving payments.' },
                ]}
              />
              <TextArea
                label="Payee addresses"
                hint="One Stellar address per line."
                placeholder={'G…\nG…\nG…'}
                rows={6}
                value={bulkText}
                onChange={(event) => {
                  setBulkText(event.target.value);
                  setBulkResults(null);
                }}
                spellCheck={false}
              />
              <div>
                <Button
                  variant="secondary"
                  onClick={() => void handleCheckBulk()}
                  loading={bulkChecking}
                  disabled={parseBulkAddresses(bulkText).length === 0}
                >
                  Check addresses
                </Button>
              </div>

              {bulkResults && (
                // Not a live region: reading sixty addresses back is noise. The
                // summary speaks; batch progress goes through the shared announcer.
                <div className="payee-mgmt__bulk-results">
                  <ul className="payee-mgmt__bulk-list">
                    {bulkResults.map((entry) => {
                      const tone = entry.status === 'eligible' ? 'success' : entry.status === 'invalid' ? 'danger' : 'neutral';
                      const text =
                        entry.status === 'eligible'
                          ? bulkMode === 'verify'
                            ? 'Will be verified'
                            : 'Will be removed'
                          : entry.status === 'invalid'
                            ? 'Not a valid address'
                            : entry.status === 'duplicate'
                              ? 'Duplicate in this list'
                              : entry.status === 'already-verified'
                                ? 'Already verified — skipped'
                                : 'Not currently verified — skipped';
                      return (
                        <li key={entry.address}>
                          <code className="numeric">{entry.address}</code>
                          <Badge tone={tone}>{text}</Badge>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="payee-mgmt__bulk-summary" aria-live="polite">
                    {bulkCheckSummary(bulkCounts, bulkMode, batches.length)}
                  </p>
                  <div>
                    <Button
                      variant={bulkMode === 'remove' ? 'danger' : 'primary'}
                      onClick={() => void handleSendBulk()}
                      loading={bulkSending}
                      disabled={!isCreator || eligibleAddresses.length === 0}
                    >
                      {bulkMode === 'verify' ? 'Verify' : 'Remove'} {eligibleAddresses.length} payee
                      {eligibleAddresses.length === 1 ? '' : 's'}
                    </Button>
                  </div>
                  {bulkProgress && (
                    <p className="payee-mgmt__fine payee-mgmt__bulk-progress">
                      Sending batch {Math.min(bulkProgress.done + 1, bulkProgress.total)} of {bulkProgress.total}
                      {bulkProgress.done > 0 && ` (${bulkProgress.done} done)`}…
                    </p>
                  )}
                </div>
              )}
              {/* The shared announcer reads a failed batch once, so this panel stays quiet. */}
              {bulkTx.error && <ErrorPanel explained={bulkTx.error} live={false} />}
            </div>
          </section>
        </>
      )}

      <TxSheet
        open={single !== null}
        onClose={() => {
          setSingle(null);
          tx.reset();
        }}
        tx={tx}
        eyebrow="Payees"
        pendingTitle={single?.kind === 'remove' ? 'Removing the payee' : 'Verifying the payee'}
        doneTitle={single?.kind === 'remove' ? 'Payee removed' : 'Payee verified'}
        doneText={
          single?.kind === 'remove'
            ? 'Future payments can’t go to this address. Money already paid stays where it is.'
            : 'The address can now receive Direct payments or be chosen from escrow.'
        }
        doneRows={single ? [{ label: 'Address', value: truncateAddress(single.address, 6, 6) }] : undefined}
        failTitle={single?.kind === 'remove' ? 'Payee not removed' : 'Payee not verified'}
        onRetry={
          single
            ? () => {
                if (!programme) return;
                void tx.send(() =>
                  single.kind === 'remove'
                    ? programme.deny_payee({ payee: single.address })
                    : programme.allow_payee({ payee: single.address }),
                );
              }
            : undefined
        }
      />
    </div>
  );
};
