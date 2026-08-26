import { useEffect, useState, useMemo } from 'react';
import { useContractRead, useContractResult, useProgramme, useTransaction, phaseLabel } from '../hooks';
import { AsyncView, Empty } from '../components/state/AsyncStates';
import { Badge, Button, Card, Field, Modal, Stat } from '../components/ui';
import { useWallet } from '../context/useWallet';
import { DEMO_PROGRAMME_ID } from '../context/sorobanStore';
import { formatAmount, formatExact, tryParseAmount } from '../lib/amount';
import './RecipientDashboard.css';

/** Seeded testnet recipient (Ada), shown only when no wallet is connected. */
const DEMO_RECIPIENT = 'GAH3D4RM45ETE4W7VDRCWZBPRPT63CJXAGXFYVBC2FGANBZTS4OTKXCA';

/**
 * There is no contract call that lists a programme's verified payees — see
 * docs/frontend-integration.md. The seeded school is known ahead of time, so
 * it seeds the picker; anyone can add another candidate address to check.
 */
const SEEDED_PAYEES: Record<string, string[]> = {
  [DEMO_PROGRAMME_ID]: ['GAUHWES2VEBGS5IWDET2IUYZXG3HCXOV7QIMXWM3AH3KHXE4HWJOSC5A'],
};

const STELLAR_ADDRESS = /^G[A-Z2-7]{55}$/;

type PayeeStatus = 'checking' | 'verified' | 'unverified' | 'error';

const formatXlm = (amount: bigint) => formatAmount(amount, { asset: 'XLM' });
const shorten = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;
const candidateStorageKey = (programmeId: string) => `milepost:recipient-payees:${programmeId}`;

function loadCandidates(programmeId: string): string[] {
  try {
    const stored = window.localStorage.getItem(candidateStorageKey(programmeId));
    if (stored) return JSON.parse(stored) as string[];
  } catch {
    // Corrupt or inaccessible storage — fall back to the seed below.
  }
  return SEEDED_PAYEES[programmeId] ?? [];
}

export const RecipientDashboard = () => {
  const { address: walletAddress } = useWallet();
  const { client: programme, id: programmeId } = useProgramme();
  const isDemo = !walletAddress;
  const recipient = walletAddress || DEMO_RECIPIENT;

  const award = useContractResult(() => programme.get_award({ recipient }), [programme, recipient]);
  const allocation = useContractRead(() => programme.allocation_of({ recipient }), [programme, recipient]);
  const config = useContractResult(() => programme.get_config(), [programme]);

  // Candidate payees to check, persisted per programme so a recipient does
  // not re-enter the same address every visit.
  // Stored candidates are the source of truth; sessionAdds covers the case
  // where the write failed, so the picker still works for this session.
  // Deriving rather than syncing in an effect keeps the programme switch to a
  // single render.
  const [sessionAdds, setSessionAdds] = useState<Record<string, string[]>>({});
  const candidates = useMemo(() => {
    const stored = loadCandidates(programmeId);
    const extra = (sessionAdds[programmeId] ?? []).filter((a) => !stored.includes(a));
    return [...stored, ...extra];
  }, [programmeId, sessionAdds]);

  const [payeeStatus, setPayeeStatus] = useState<Record<string, PayeeStatus>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        candidates.map(async (address): Promise<[string, PayeeStatus]> => {
          try {
            const { result } = await programme.is_payee({ payee: address });
            return [address, result ? 'verified' : 'unverified'];
          } catch {
            return [address, 'error'];
          }
        }),
      );
      if (cancelled) return;
      setPayeeStatus((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    })();
    return () => {
      cancelled = true;
    };
  }, [programme, candidates]);

  const addCandidate = (address: string) => {
    if (candidates.includes(address)) return;
    try {
      const next = [...loadCandidates(programmeId), address];
      window.localStorage.setItem(candidateStorageKey(programmeId), JSON.stringify(next));
    } catch {
      // Best-effort only — sessionAdds below still carries it for this session.
    }
    setSessionAdds((prev) => ({
      ...prev,
      [programmeId]: [...(prev[programmeId] ?? []), address],
    }));
  };

  const [candidateInput, setCandidateInput] = useState('');
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const handleAddCandidate = () => {
    const address = candidateInput.trim();
    if (!STELLAR_ADDRESS.test(address)) {
      setCandidateError('Enter a valid Stellar address.');
      return;
    }
    setCandidateError(null);
    setCandidateInput('');
    addCandidate(address);
  };

  const [selectedPayee, setSelectedPayee] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAmount, setPendingAmount] = useState<bigint | null>(null);

  const transaction = useTransaction<bigint>({ contract: 'program' });

  // Reading the clock during render is impure — two renders would disagree.
  // Ticking it as state matches ProgrammeDetail and keeps the close-out honest
  // without a refresh.
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const interval = window.setInterval(() => setNowSeconds(Math.floor(Date.now() / 1000)), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const sweepDeadline = config.data?.sweep_deadline ?? null;
  const spendClosed = sweepDeadline !== null && BigInt(nowSeconds) >= sweepDeadline;

  const openConfirm = () => {
    if (!selectedPayee) {
      setAmountError('Pick a verified payee first.');
      return;
    }
    const parsed = tryParseAmount(amountInput);
    if (!parsed.ok) {
      setAmountError(parsed.error);
      return;
    }
    if (allocation.data !== null && parsed.value > allocation.data) {
      setAmountError('That is more than you have available to direct.');
      return;
    }
    setAmountError(null);
    setPendingAmount(parsed.value);
    setConfirmOpen(true);
  };

  const closeConfirm = () => {
    if (transaction.busy) return;
    setConfirmOpen(false);
    transaction.reset();
  };

  const handleConfirm = async () => {
    if (!selectedPayee || pendingAmount === null) return;
    const payee = selectedPayee;
    const amount = pendingAmount;

    const result = await transaction.send(async () => {
      const tx = await programme.spend({ recipient, payee, amount });
      return {
        signAndSend: async (options: Parameters<typeof tx.signAndSend>[0]) => {
          const sent = await tx.signAndSend(options);
          return { result: sent.result.unwrap() };
        },
      };
    });

    if (result !== null) {
      setConfirmOpen(false);
      setSelectedPayee(null);
      setAmountInput('');
      setPendingAmount(null);
      allocation.refetch();
    }
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Recipient Dashboard</h1>
        {isDemo && (
          <Badge tone="neutral">Viewing Ada&rsquo;s testnet award — connect a wallet to use your own</Badge>
        )}
        <p className="typo-text text-muted">Track your award and direct your allocation to a verified payee.</p>
      </header>

      <AsyncView
        {...award}
        onRetry={award.refetch}
        empty={{
          title: 'No award yet',
          description: 'This account has no finalised award on this programme.',
        }}
      >
        {(data) => (
          <>
            <section className="stats-grid">
              <Card>
                <Stat label="Granted" value={formatXlm(data.granted)} numeric />
              </Card>
              <Card>
                <Stat label="Released" value={formatXlm(data.released)} numeric />
              </Card>
              <Card>
                <Stat label="Tranches released" value={`${data.tranches_released} / ${data.tranches}`} />
              </Card>
            </section>

            {data.mode.tag === 'Allocated' ? (
              <Card title="Direct your allocation" className="allocation-card">
                <Stat
                  label="Available to direct"
                  numeric
                  value={
                    <AsyncView {...allocation} onRetry={allocation.refetch}>
                      {(value) => formatXlm(value)}
                    </AsyncView>
                  }
                />

                {spendClosed ? (
                  <Empty
                    title="Spending closed"
                    description={
                      sweepDeadline !== null
                        ? `The sweep window opened on ${new Date(Number(sweepDeadline) * 1000).toLocaleString()} — this allocation can no longer be directed and will be swept.`
                        : 'The sweep window has opened — this allocation can no longer be directed.'
                    }
                  />
                ) : (
                  <>
                    <div className="payee-picker">
                      <h3>Verified payees</h3>
                      {candidates.length === 0 && (
                        <p className="typo-text text-muted">
                          No payees checked yet on this device — add one below.
                        </p>
                      )}
                      <div className="payee-list" role="radiogroup" aria-label="Verified payees">
                        {candidates.map((address) => {
                          const status = payeeStatus[address] ?? 'checking';
                          const verified = status === 'verified';
                          return (
                            <label
                              key={address}
                              className={`payee-option${verified ? '' : ' payee-option--disabled'}`}
                            >
                              <input
                                type="radio"
                                name="payee"
                                value={address}
                                checked={selectedPayee === address}
                                disabled={!verified}
                                onChange={() => setSelectedPayee(address)}
                              />
                              <span className="payee-option__address numeric" title={address}>
                                {shorten(address)}
                              </span>
                              <Badge tone={verified ? 'success' : status === 'checking' ? 'neutral' : 'danger'}>
                                {status === 'checking' ? 'Checking…' : verified ? 'Verified' : 'Not verified'}
                              </Badge>
                            </label>
                          );
                        })}
                      </div>

                      <div className="payee-add">
                        <Field
                          label="Add a payee to check"
                          placeholder="G..."
                          value={candidateInput}
                          onChange={(event) => {
                            setCandidateInput(event.target.value);
                            setCandidateError(null);
                          }}
                          error={candidateError}
                          hint="Only the programme creator can verify a payee — this checks whether one already is."
                        />
                        <Button variant="secondary" size="sm" onClick={handleAddCandidate}>
                          Check payee
                        </Button>
                      </div>
                    </div>

                    <Field
                      label="Amount"
                      placeholder="0.00"
                      value={amountInput}
                      onChange={(event) => {
                        setAmountInput(event.target.value);
                        setAmountError(null);
                      }}
                      error={amountError}
                      suffix="XLM"
                    />

                    <Button onClick={openConfirm} disabled={config.loading || allocation.loading} fullWidth>
                      Direct funds
                    </Button>
                  </>
                )}
              </Card>
            ) : (
              <Card title="Payment mode">
                <p className="typo-text text-muted">
                  {data.mode.tag === 'Direct' &&
                    'This award pays straight to a fixed, verified payee. There is nothing for you to direct here.'}
                  {data.mode.tag === 'Restricted' &&
                    "This award is paid into your smart wallet, where a spend policy limits onward payments to verified destinations."}
                  {data.mode.tag === 'Open' && 'This award is paid to you directly, with no restriction.'}
                </p>
              </Card>
            )}
          </>
        )}
      </AsyncView>

      <Modal
        open={confirmOpen}
        onClose={closeConfirm}
        title="Confirm allocation"
        busy={transaction.busy}
        footer={
          <>
            <Button variant="secondary" onClick={closeConfirm} disabled={transaction.busy}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              loading={transaction.busy}
              loadingLabel={phaseLabel(transaction.phase) || 'Confirm'}
            >
              Confirm
            </Button>
          </>
        }
      >
        {selectedPayee && pendingAmount !== null && (
          <div className="confirm-summary">
            <p>
              Send <strong className="numeric">{formatExact(pendingAmount)} XLM</strong> to
            </p>
            <p className="numeric confirm-summary__address">{selectedPayee}</p>
          </div>
        )}
        {transaction.error && (
          <p role="alert" className="confirm-error">
            {transaction.error.message}
            {transaction.error.action ? ` ${transaction.error.action}` : ''}
          </p>
        )}
      </Modal>
    </div>
  );
};
