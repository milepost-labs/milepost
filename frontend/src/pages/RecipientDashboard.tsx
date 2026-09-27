import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useContractRead, useContractResult, useProgramme, useTransaction, phaseLabel } from '../hooks';
import { AsyncView, Empty } from '../components/state/AsyncStates';
import { PausedBanner } from '../components/programme/PausedBanner';
import { ProgrammeParamNotice } from '../components/programme/ProgrammeParamNotice';
import { Badge, Button, Card, Field, Modal, Stat } from '../components/ui';
import { useWallet } from '../context/useWallet';
import { RecipientNav } from '../components/recipient/RecipientNav';
import { RecipientAwards } from '../components/recipient/RecipientAwards';
import { ApplyForm } from '../components/recipient/ApplyForm';
import './RecipientDashboard.css';

export function RecipientDashboard() {
  const { address, connect } = useWallet();
  const [searchParams] = useSearchParams();

/**
 * There is no contract call that lists a programme's verified payees: the
 * registry stores them per address, so membership can be checked but not
 * enumerated. The seeded school is known ahead of time, so
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
  const { client: programme, id: programmeId, linkedProgramme, readsEnabled } = useProgramme();
  const isDemo = !walletAddress;
  const recipient = walletAddress || DEMO_RECIPIENT;

  const award = useContractResult(() => programme.get_award({ recipient }), [programme, recipient], {
    enabled: readsEnabled,
  });
  const allocation = useContractRead(() => programme.allocation_of({ recipient }), [programme, recipient], {
    enabled: readsEnabled,
  });
  const config = useContractResult(() => programme.get_config(), [programme], { enabled: readsEnabled });

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
    if (!readsEnabled) return;
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
  }, [programme, candidates, readsEnabled]);

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

  if (linkedProgramme.blocksProgramme) {
    return (
      <div className="dashboard-container">
        <ProgrammeParamNotice state={linkedProgramme} />
      </div>
    );
  }

  return (
    <section className="recipient-page" aria-labelledby="h-recipient-funding">
      <div className="recipient-page__header">
        <h1 id="h-recipient-funding" className="recipient-page__title">
          Your funding
        </h1>
        <p className="recipient-page__desc">
          Apply for what you need, see what's been released, and carry your record to the next programme.
        </p>
      </div>

      {!address ? (
        <div className="recipient-signed-out">
          <div className="recipient-signed-out__callout">
            <h2 className="recipient-signed-out__title">Sign in to see your awards</h2>
            <p className="recipient-signed-out__text">
              Use a passkey (Face ID or fingerprint) or the Freighter extension. No seed phrase, and you won't need XLM for fees.
            </p>
            <div className="recipient-signed-out__actions">
              <button
                type="button"
                className="recipient-signed-out__btn"
                onClick={connect}
              >
                Sign in
              </button>
              <Link to="/directory" className="recipient-signed-out__link">
                Find a programme
              </Link>
            </div>
          </div>

          <ul className="recipient-signed-out__list">
            <li className="recipient-signed-out__item">
              <span className="recipient-signed-out__item-title">Each award and its tranches</span>
              <span className="recipient-signed-out__item-desc">What's released, what's waiting on a verifier</span>
            </li>
            <li className="recipient-signed-out__item">
              <span className="recipient-signed-out__item-title">Where your applications are</span>
              <span className="recipient-signed-out__item-desc">Review votes and how the award is set</span>
            </li>
            <li className="recipient-signed-out__item">
              <span className="recipient-signed-out__item-title">Your standing</span>
              <span className="recipient-signed-out__item-desc">A record the next funder can rely on</span>
            </li>
          </ul>
        </div>
      ) : (
        <>
          <RecipientNav currentSection={isApply ? 'apply' : 'awards'} />
          {isApply ? <ApplyForm /> : <RecipientAwards />}
        </>
      )}
    </section>
  );
}
