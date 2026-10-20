import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ProgrammeConfig } from '@milepost/program';
import { useSoroban } from '../context/useSoroban';
import { useWallet } from '../context/useWallet';
import { useAnnouncer } from '../context/useAnnouncer';
import { useContractResult, useProgrammeParam, useTransaction } from '../hooks';
import { AddressChip, Badge, Button, Card, Field, RadioGroup, TextArea } from '../components/ui';
import { ProgrammeParamNotice } from '../components/programme/ProgrammeParamNotice';
import { Empty, ErrorPanel, ErrorState, PendingState, TransactionOutcome } from '../components/state/AsyncStates';
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

  const [sessionChanges, setSessionChanges] = useState<Record<string, SessionChange[]>>({});
  const currentSessionChanges = sessionChanges[programmeId] ?? [];

  const [checkInput, setCheckInput] = useState('');
  const [checkError, setCheckError] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<{ address: string; verified: boolean } | null>(null);
  const [checkLoading, setCheckLoading] = useState(false);

  const handleCheckAddress = async () => {
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
      [programmeId]: [...(prev[programmeId] ?? []), payee],
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

  const tx = useTransaction({
    contract: 'program',
    onSuccess: () => {
      const addr = addressInput.trim();
      const lbl = labelInput.trim() || 'Verified payee';
      remember({ address: addr, label: lbl });
      setSessionChanges((prev) => ({
        ...prev,
        [programmeId]: [
          { address: addr, label: lbl, action: 'added' },
          ...(prev[programmeId] ?? []).filter((c) => c.address !== addr),
        ],
      }));
      setAddressInput('');
      setLabelInput('');
    },
  });

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
    void tx.send(() => programme.allow_payee({ payee: address }));
  };

  const handleRevoke = (address: string) => {
    if (!programme) return;
    void tx.send(() => programme.deny_payee({ payee: address }));
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
        [programmeId]: [
          ...verifiedInThisRun.map((address) => ({ address, label: 'Bulk verified', action: 'added' as const })),
          ...(prev[programmeId] ?? []).filter((c) => !verifiedInThisRun.includes(c.address)),
        ],
      }));
    }
    if (bulkMode === 'remove' && eligibleAddresses.length > 0) {
      setSessionChanges((prev) => ({
        ...prev,
        [programmeId]: [
          ...eligibleAddresses.map((address) => ({ address, label: 'Bulk removed', action: 'removed' as const })),
          ...(prev[programmeId] ?? []).filter((c) => !eligibleAddresses.includes(c.address)),
        ],
      }));
    }
    setBulkText('');
    setBulkResults(null);
    setBulkProgress(null);
    setBulkSending(false);
  };

  const bulkCounts = useMemo(() => countBulkAddresses(bulkResults), [bulkResults]);

  return (
    <div className="payee-mgmt">
      <header className="payee-mgmt__header">
        <h1>Payee management</h1>
        <p className="typo-text text-muted">
          Direct and Allocated awards can only pay a verified payee — verifying one is a
          prerequisite for money moving at all. A payee is a wallet, business or institution: a
          school, clinic or supplier, so it gets a label here, not only an address.
        </p>
      </header>

      <ProgrammeParamNotice state={programmeParam} />

      <Card title="Programme">
        <div className="payee-mgmt__programme">
          <Field
            label="Programme address"
            value={programmeInput}
            onChange={(event) => {
              setProgrammeInputOverride(event.target.value);
              setProgrammeError(null);
            }}
            error={programmeError}
            hint="The funding round whose payees you're managing. Open this page from a programme to fill it in."
          />
          <Button onClick={handleLookupProgramme}>Look up</Button>
        </div>
        {config.data && (
          <p className="payee-mgmt__creator">
            Creator{' '}
            <AddressChip address={config.data.creator} copyLabel="Copy creator address" />
          </p>
        )}
      </Card>

      {!programme || programmeParam.blocksProgramme ? (
        <Empty
          title="Choose a programme"
          description="Paste a programme contract address above, or open Payee management from the programme’s page. Nothing is preselected."
        />
      ) : config.error ? (
        <ErrorState error={config.error} contract="program" onRetry={config.refetch} />
      ) : config.loading && !config.data ? (
        <PendingState title="Reading the programme…" note="Checking who created it and whether you can manage its payees." />
      ) : (
        <>
      {!wallet.address && (
        <Empty
          title="Sign in to verify or remove a payee"
          description="Anyone can check whether an address is verified. Only the programme's creator can verify or remove one."
          action={<Button onClick={() => void wallet.connect()}>Sign in</Button>}
        />
      )}

      <Card title="Check a payee address">
        <p className="payee-mgmt__consequence">
          Any address can be checked with <span className="numeric">is_payee</span> to confirm whether it is currently verified on-chain.
        </p>
        <div className="payee-mgmt__check-form">
          <Field
            label="Check payee address"
            placeholder="G..."
            value={checkInput}
            onChange={(event) => {
              setCheckInput(event.target.value);
              setCheckError(null);
            }}
            error={checkError}
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
          <div className="payee-mgmt__check-result" role="status">
            <AddressChip address={checkResult.address} copyLabel="Copy checked address" />
            <Badge tone={checkResult.verified ? 'success' : 'danger'}>
              {checkResult.verified ? 'Verified on-chain' : 'Not verified'}
            </Badge>
          </div>
        )}
      </Card>

      <Card title="Verify a payee">
        <p className="payee-mgmt__consequence">
          Verifying an address lets the programme pay it directly under Direct mode, or lets a
          recipient in Allocated mode direct escrow to it. Allocations already directed to a
          payee are untouched if it is later removed — removing stops future payments, it does
          not claw back past ones.
        </p>
        {wallet.address && !isCreator && (
          <p className="payee-mgmt__readonly" role="note">
            Only the programme&rsquo;s creator can verify or remove a payee. You can still check
            any address below.
          </p>
        )}
        <form onSubmit={handleVerify} className="payee-mgmt__form">
          <Field
            label="Payee address"
            placeholder="G..."
            value={addressInput}
            onChange={(event) => {
              setAddressInput(event.target.value);
              setAddError(null);
            }}
            error={addError}
          />
          <Field
            label="Label"
            placeholder="e.g. Riverside Clinic"
            hint="Shown in this app only — the contract stores the address, not a name."
            value={labelInput}
            onChange={(event) => setLabelInput(event.target.value)}
          />
          <Button type="submit" loading={tx.busy} disabled={!canSubmit}>
            Verify payee
          </Button>
        </form>
        <TransactionOutcome
          phase={tx.phase}
          error={tx.error}
          successTitle="Payee verified"
          successDescription="The address can now receive Direct payments or be chosen from escrow."
        />
      </Card>

      <Card title="Verify or remove payees in bulk">
        <p className="payee-mgmt__consequence">
          A programme paying fifty schools needs fifty payees verified. Paste one address per
          line below; each is validated and checked against the current on-chain status before
          anything is sent. Duplicates and addresses already in the state you're asking for are
          skipped, not rejected — they simply won't be included in what gets sent.
        </p>
        {wallet.address && !isCreator && (
          <p className="payee-mgmt__readonly" role="note">
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
              { value: 'remove', label: 'Remove', description: 'Revoke payment eligibility for these addresses.' },
            ]}
          />
          <TextArea
            label="Payee addresses"
            hint="One Stellar address per line."
            placeholder={'G...\nG...\nG...'}
            rows={6}
            value={bulkText}
            onChange={(event) => {
              setBulkText(event.target.value);
              setBulkResults(null);
            }}
          />
          <Button
            variant="secondary"
            onClick={() => void handleCheckBulk()}
            loading={bulkChecking}
            disabled={parseBulkAddresses(bulkText).length === 0}
          >
            Check addresses
          </Button>

          {bulkResults && (
            // The pasted list is deliberately not a live region — reading sixty
            // addresses back is noise. The summary line carries the polite
            // announcement of what the check found; batch progress goes
            // through the shared announcer (issue #482).
            <div className="payee-mgmt__bulk-results">
              <ul className="payee-mgmt__bulk-list">
                {bulkResults.map((entry) => {
                  const tone =
                    entry.status === 'eligible'
                      ? 'success'
                      : entry.status === 'invalid'
                      ? 'danger'
                      : 'neutral';
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
                    <li key={entry.address} className="payee-mgmt__bulk-row">
                      <code className="mono">{entry.address}</code>
                      <Badge tone={tone}>{text}</Badge>
                    </li>
                  );
                })}
              </ul>
              <p className="payee-mgmt__bulk-summary" aria-live="polite">
                {bulkCheckSummary(bulkCounts, bulkMode, batches.length)}
              </p>
              <Button
                variant={bulkMode === 'remove' ? 'danger' : 'primary'}
                onClick={() => void handleSendBulk()}
                loading={bulkSending}
                disabled={!isCreator || eligibleAddresses.length === 0}
              >
                {bulkMode === 'verify' ? 'Verify' : 'Remove'} {eligibleAddresses.length} payee
                {eligibleAddresses.length === 1 ? '' : 's'}
              </Button>
              {bulkProgress && (
                <p className="payee-mgmt__bulk-progress">
                  Sending batch {Math.min(bulkProgress.done + 1, bulkProgress.total)} of {bulkProgress.total}
                  {bulkProgress.done > 0 && ` (${bulkProgress.done} done)`}…
                </p>
              )}
            </div>
          )}
          {/* Announced by the shared announcer the moment a batch fails, so
              the panel stays visual (`live={false}`) and the reason is read
              once, alongside how much of the run landed. */}
          {bulkTx.error && <ErrorPanel explained={bulkTx.error} live={false} />}
        </div>
      </Card>

      <Card title={isSample ? 'Verified payees (Sample data)' : 'Payees changed this session'}>
        {isSample ? (
          candidates.length === 0 ? (
            <Empty
              title="No payees checked yet"
              description="Verifying a payee is what makes Direct and Allocated payments possible — until at least one address is verified, no tranche in those modes can be paid out."
            />
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
                  <li key={candidate.address} className="payee-mgmt__row">
                    <div className="payee-mgmt__row-info">
                      <span className="payee-mgmt__row-label">{candidate.label}</span>
                      <AddressChip address={candidate.address} copyLabel="Copy payee address" />
                    </div>
                    <div className="payee-mgmt__row-actions">
                      <Badge tone="warning">Sample data</Badge>
                      <Badge tone={tone}>{label}</Badge>
                      {isCreator && status === 'verified' && (
                        <Button
                          variant="secondary"
                          onClick={() => handleRevoke(candidate.address)}
                          loading={tx.busy}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        ) : (
          currentSessionChanges.length === 0 ? (
            <Empty
              title="No payees changed this session"
              description="Real programmes show no fixture payees. Addresses added or removed this session in this browser are listed here and labelled as session-only."
            />
          ) : (
            <ul className="payee-mgmt__list">
              {currentSessionChanges.map((entry) => (
                <li key={entry.address} className="payee-mgmt__row">
                  <div className="payee-mgmt__row-info">
                    <span className="payee-mgmt__row-label">{entry.label}</span>
                    <AddressChip address={entry.address} copyLabel="Copy payee address" />
                  </div>
                  <div className="payee-mgmt__row-actions">
                    <Badge tone="neutral">Session-only</Badge>
                    <Badge tone={entry.action === 'added' ? 'success' : 'danger'}>
                      {entry.action === 'added' ? 'Verified' : 'Removed'}
                    </Badge>
                    {isCreator && entry.action === 'added' && (
                      <Button
                        variant="secondary"
                        onClick={() => handleRevoke(entry.address)}
                        loading={tx.busy}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )
        )}
      </Card>
        </>
      )}
    </div>
  );
};
