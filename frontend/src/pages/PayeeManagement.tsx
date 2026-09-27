import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { ProgrammeConfig } from '@milepost/program';
import { useSoroban } from '../context/useSoroban';
import { useWallet } from '../context/useWallet';
import { useContractResult, useTransaction } from '../hooks';
import { AddressChip, Badge, Button, Card, Field } from '../components/ui';
import { Empty, TransactionOutcome } from '../components/state/AsyncStates';
import { DEMO_PROGRAMME_ID } from '../context/sorobanStore';
import { FIXTURE_PAYEES, type PayeeFixture } from '../fixtures/payeeFixtures';
import './PayeeManagement.css';

const PROGRAMME_ADDRESS = /^C[A-Z2-7]{55}$/;
const PAYEE_ADDRESS = /^G[A-Z2-7]{55}$/;

type PayeeStatus = 'checking' | 'verified' | 'unverified' | 'error';

const storageKey = (programmeId: string) => `milepost:programme-payees:${programmeId}`;

function loadCandidates(programmeId: string): PayeeFixture[] {
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

  const [programmeInput, setProgrammeInput] = useState(DEMO_PROGRAMME_ID);
  const [programmeId, setProgrammeId] = useState(DEMO_PROGRAMME_ID);
  const [programmeError, setProgrammeError] = useState<string | null>(null);

  const programme = useMemo(() => programmeAt(programmeId), [programmeAt, programmeId]);

  const config = useContractResult<ProgrammeConfig>(
    () => programme.get_config(),
    [programme],
    { contract: 'program' },
  );
  const isCreator = Boolean(wallet.address && config.data && config.data.creator === wallet.address);

  const [sessionAdds, setSessionAdds] = useState<Record<string, PayeeFixture[]>>({});
  const candidates = useMemo(() => {
    const stored = loadCandidates(programmeId);
    const extra = (sessionAdds[programmeId] ?? []).filter(
      (c) => !stored.some((s) => s.address === c.address),
    );
    return [...stored, ...extra];
  }, [programmeId, sessionAdds]);

  const [statusByAddress, setStatusByAddress] = useState<Record<string, PayeeStatus>>({});
  useEffect(() => {
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
    if (!PROGRAMME_ADDRESS.test(value)) {
      setProgrammeError('Enter a valid programme contract address.');
      return;
    }
    setProgrammeError(null);
    setProgrammeId(value);
  };

  const [addressInput, setAddressInput] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  const tx = useTransaction({
    contract: 'program',
    onSuccess: () => {
      remember({ address: addressInput.trim(), label: labelInput.trim() || 'Verified payee' });
      setAddressInput('');
      setLabelInput('');
    },
  });

  const handleVerify = (event: FormEvent) => {
    event.preventDefault();
    const address = addressInput.trim();
    if (!PAYEE_ADDRESS.test(address)) {
      setAddError('Enter a valid Stellar address.');
      return;
    }
    setAddError(null);
    void tx.send(() => programme.allow_payee({ payee: address }));
  };

  const handleRevoke = (address: string) => {
    void tx.send(() => programme.deny_payee({ payee: address }));
  };

  const canSubmit = isCreator && PAYEE_ADDRESS.test(addressInput.trim());

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

      <Card title="Programme">
        <div className="payee-mgmt__programme">
          <Field
            label="Programme address"
            value={programmeInput}
            onChange={(event) => {
              setProgrammeInput(event.target.value);
              setProgrammeError(null);
            }}
            error={programmeError}
            hint="The funding round whose payees you're managing."
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

      {!wallet.address && (
        <Empty
          title="Sign in to verify or remove a payee"
          description="Anyone can check whether an address is verified. Only the programme's creator can verify or remove one."
          action={<Button onClick={() => void wallet.connect()}>Sign in</Button>}
        />
      )}

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

      <Card title="Verified payees">
        {candidates.length === 0 ? (
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
        )}
      </Card>
    </div>
  );
};
