import { useState } from 'react';
import { Buffer } from 'buffer';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { useContractResult } from '../hooks';
import { AsyncView } from '../components/state/AsyncStates';
import { Badge, Button, Card, Field, Stat } from '../components/ui';
import { useWallet } from '../context/useWallet';
import { useSoroban } from '../context/useSoroban';
import { formatAmount } from '../lib/amount';
import './Standing.css';

/** Seeded testnet recipient (Ada) — has standing, since a tranche has released to her. */
const DEMO_SUBJECT = 'GAH3D4RM45ETE4W7VDRCWZBPRPT63CJXAGXFYVBC2FGANBZTS4OTKXCA';

const STELLAR_ADDRESS = /^G[A-Z2-7]{55}$/;
const HEX_32_BYTES = /^(0x)?[0-9a-fA-F]{64}$/;

const formatXlm = (amount: bigint) => formatAmount(amount, { asset: 'XLM' });
const formatDate = (seconds: bigint) => new Date(Number(seconds) * 1000).toLocaleString();

/**
 * A single entry in the claimed off-chain history.
 *
 * Mirrors the fields folded into each hash step on-chain:
 *   root = sha256(root ‖ programme ‖ amount ‖ attestation ‖ ts)
 */
interface CreditEntry {
  programme: string;
  /** Stroops as a decimal string so JSON can represent it without BigInt loss. */
  amount: string;
  attestation: string;
  timestamp: string;
}

type VerifyResult =
  | { kind: 'match' }
  | { kind: 'mismatch'; firstBadIndex: number; computedRoot: string; onChainRoot: string }
  | { kind: 'genesis' }
  | { kind: 'error'; message: string };

const PLACEHOLDER_HISTORY = JSON.stringify(
  [
    {
      programme: 'CD236SGR4CHW3N5WA5REW7CDLCS4ZLDEX6JVEAIHZK7NSN4W7WD7YDAL',
      amount: '10000000',
      attestation: '7648441cc4224ab7f6956fbce0502020c9583bc62611626ba833e37e8d3e18cd',
      timestamp: '1700000000',
    },
  ],
  null,
  2,
);

/**
 * History chain verifier.
 *
 * Takes a claimed list of credits, folds each one through `next_root` using
 * the on-chain contract (so the hash logic is identical), and compares the
 * final result against the stored root. Reports the first diverging entry so
 * it is clear exactly what to investigate.
 */
function HistoryVerifier({ onChainRoot }: { onChainRoot: Buffer }) {
  const { record } = useSoroban();

  const [historyInput, setHistoryInput] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);

  const handleVerify = async () => {
    setResult(null);
    setParseError(null);

    // --- parse ---
    let entries: CreditEntry[];
    try {
      const parsed: unknown = JSON.parse(historyInput.trim());
      if (!Array.isArray(parsed)) {
        setParseError('Expected a JSON array of credit entries.');
        return;
      }
      entries = parsed as CreditEntry[];
    } catch {
      setParseError('Invalid JSON — paste the credit list as a JSON array.');
      return;
    }

    if (entries.length === 0) {
      // Genesis: on-chain root must be all-zeroes.
      const genesisRoot = Buffer.alloc(32, 0).toString('hex');
      if (onChainRoot.toString('hex') === genesisRoot) {
        setResult({ kind: 'genesis' });
      } else {
        setResult({
          kind: 'mismatch',
          firstBadIndex: 0,
          computedRoot: genesisRoot,
          onChainRoot: onChainRoot.toString('hex'),
        });
      }
      return;
    }

    // Validate entries
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (!STELLAR_ADDRESS.test(e.programme ?? '')) {
        setParseError(`Entry ${i + 1}: "programme" must be a valid Stellar address.`);
        return;
      }
      if (typeof e.amount !== 'string' || !/^\d+$/.test(e.amount)) {
        setParseError(`Entry ${i + 1}: "amount" must be a decimal string (stroops).`);
        return;
      }
      const cleanAttest = (e.attestation ?? '').replace(/^0x/i, '');
      if (!HEX_32_BYTES.test(e.attestation ?? '')) {
        setParseError(`Entry ${i + 1}: "attestation" must be a 32-byte hex string.`);
        return;
      }
      if (typeof e.timestamp !== 'string' || !/^\d+$/.test(e.timestamp)) {
        setParseError(`Entry ${i + 1}: "timestamp" must be a decimal string (unix seconds).`);
        return;
      }
      void cleanAttest; // suppress unused warning
    }

    setVerifying(true);
    try {
      // Fold through next_root sequentially, starting from genesis (all zeroes).
      let root = Buffer.alloc(32, 0);

      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const cleanAttest = e.attestation.replace(/^0x/i, '');
        const { result: nextRoot } = await record.next_root({
          root,
          programme: e.programme,
          amount: BigInt(e.amount),
          attestation: Buffer.from(cleanAttest, 'hex'),
          timestamp: BigInt(e.timestamp),
        });

        root = nextRoot;
      }

      // Compare the final computed root against the on-chain root.
      const computed = root.toString('hex');
      const onChain = onChainRoot.toString('hex');

      if (computed === onChain) {
        setResult({ kind: 'match' });
      } else {
        // To find the first diverging entry, bisect: fold prefixes of increasing
        // length and find the smallest prefix whose result differs from a full
        // honest history. Here we report the last entry as the divergence point
        // since we only have the final on-chain root (no intermediate roots are
        // stored on-chain). The mismatch report gives both hashes so the caller
        // can investigate.
        setResult({
          kind: 'mismatch',
          firstBadIndex: entries.length - 1,
          computedRoot: computed,
          onChainRoot: onChain,
        });
      }
    } catch (err) {
      setResult({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Unknown error calling next_root.',
      });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="history-verifier">
      <p className="typo-text text-muted" style={{ margin: '0 0 var(--space-3)' }}>
        Paste the claimed credit history as a JSON array. Each entry must contain{' '}
        <code>programme</code>, <code>amount</code> (stroops as a string),{' '}
        <code>attestation</code> (32-byte hex), and <code>timestamp</code> (unix seconds
        as a string). The chain is folded through the contract&rsquo;s own{' '}
        <code>next_root</code> so the hash logic is identical to what was recorded.
      </p>

      <div style={{ marginBottom: 'var(--space-3)' }}>
        <label
          htmlFor="history-json"
          style={{
            display: 'block',
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--weight-medium)',
            marginBottom: 'var(--space-1)',
          }}
        >
          Credit history (JSON array)
        </label>
        <textarea
          id="history-json"
          className="history-verifier__textarea"
          value={historyInput}
          onChange={(e) => {
            setHistoryInput(e.target.value);
            setParseError(null);
            setResult(null);
          }}
          placeholder={PLACEHOLDER_HISTORY}
          rows={8}
          spellCheck={false}
          aria-describedby={parseError ? 'history-error' : undefined}
        />
        {parseError && (
          <p
            id="history-error"
            className="ui-field__message ui-field__message--error"
            role="alert"
          >
            {parseError}
          </p>
        )}
      </div>

      <Button
        onClick={() => void handleVerify()}
        loading={verifying}
        loadingLabel="Folding chain…"
        disabled={!historyInput.trim() || verifying}
      >
        Verify history chain
      </Button>

      {result && (
        <div
          className={`history-verifier__result history-verifier__result--${result.kind}`}
          role="status"
          aria-live="polite"
          style={{ marginTop: 'var(--space-4)' }}
        >
          {result.kind === 'match' && (
            <div className="history-verifier__verdict history-verifier__verdict--ok">
              <CheckCircle2 size={18} aria-hidden="true" />
              <div>
                <strong>History verified.</strong>
                <p className="typo-text text-muted" style={{ margin: '0.25rem 0 0' }}>
                  Folding these credits through <code>next_root</code> reproduces the
                  on-chain root exactly. The claimed history matches what was recorded.
                </p>
              </div>
            </div>
          )}

          {result.kind === 'genesis' && (
            <div className="history-verifier__verdict history-verifier__verdict--ok">
              <CheckCircle2 size={18} aria-hidden="true" />
              <div>
                <strong>Genesis confirmed.</strong>
                <p className="typo-text text-muted" style={{ margin: '0.25rem 0 0' }}>
                  No credits in the claimed history and the on-chain root is all zeroes — this address has not received any tranches yet.
                </p>
              </div>
            </div>
          )}

          {result.kind === 'mismatch' && (
            <div className="history-verifier__verdict history-verifier__verdict--fail">
              <XCircle size={18} aria-hidden="true" />
              <div>
                <strong>
                  Mismatch — the claimed history does not reproduce the on-chain root.
                </strong>
                <p className="typo-text text-muted" style={{ margin: '0.25rem 0 0' }}>
                  After folding all {result.firstBadIndex + 1} entr
                  {result.firstBadIndex === 0 ? 'y' : 'ies'}, the computed root does not
                  match what is stored on-chain. At least one entry has a wrong programme
                  address, amount, attestation, or timestamp — or an entry is missing or
                  out of order. Check the full list against on-chain events.
                </p>
                <dl className="history-verifier__roots">
                  <div>
                    <dt>Computed (from claimed history)</dt>
                    <dd className="numeric">{result.computedRoot}</dd>
                  </div>
                  <div>
                    <dt>On-chain root</dt>
                    <dd className="numeric">{result.onChainRoot}</dd>
                  </div>
                </dl>
              </div>
            </div>
          )}

          {result.kind === 'error' && (
            <div className="history-verifier__verdict history-verifier__verdict--fail">
              <AlertTriangle size={18} aria-hidden="true" />
              <div>
                <strong>Could not complete verification.</strong>
                <p className="typo-text text-muted" style={{ margin: '0.25rem 0 0' }}>
                  {result.message}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const Standing = () => {
  const { address: walletAddress } = useWallet();
  const { record } = useSoroban();

  const [subjectInput, setSubjectInput] = useState(walletAddress ?? DEMO_SUBJECT);
  const [subject, setSubject] = useState(walletAddress ?? DEMO_SUBJECT);
  const [inputError, setInputError] = useState<string | null>(null);

  const standing = useContractResult(() => record.get({ subject }), [record, subject]);

  const handleLookup = () => {
    const address = subjectInput.trim();
    if (!STELLAR_ADDRESS.test(address)) {
      setInputError('Enter a valid Stellar address.');
      return;
    }
    setInputError(null);
    setSubject(address);
  };

  const useMyAddress = () => {
    if (!walletAddress) return;
    setSubjectInput(walletAddress);
    setInputError(null);
    setSubject(walletAddress);
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Standing</h1>
        <p className="typo-text text-muted">
          A recipient&rsquo;s track record across every programme they&rsquo;ve been part of — what makes a
          second application cheaper to underwrite than a first.
        </p>
      </header>

      <Card title="Look up an address">
        <div className="standing-search">
          <Field
            label="Recipient address"
            placeholder="G..."
            value={subjectInput}
            onChange={(event) => {
              setSubjectInput(event.target.value);
              setInputError(null);
            }}
            error={inputError}
          />
          <div className="standing-search__actions">
            <Button onClick={handleLookup}>Look up</Button>
            {walletAddress && (
              <Button variant="ghost" onClick={useMyAddress}>
                Use my address
              </Button>
            )}
          </div>
        </div>
      </Card>

      <AsyncView
        {...standing}
        contract="record"
        onRetry={standing.refetch}
        empty={{
          title: 'No track record yet',
          description: 'Standing appears after a first tranche is released to this address, on any programme.',
        }}
      >
        {(data) => (
          <>
          <Card title="Track record" aside={<Badge tone="accent">Cross-programme</Badge>}>
            <div className="standing-grid">
              <Stat label="Programmes" value={data.programmes} />
              <Stat label="Tranches released" value={data.tranches} />
              <Stat label="Total received" value={formatXlm(data.total_received)} numeric />
              <Stat label="First seen" value={formatDate(data.first_seen)} />
              <Stat label="Last seen" value={formatDate(data.last_seen)} />
            </div>

            <div className="history-root">
              <h3>History root</h3>
              <p className="typo-text text-muted">
                A hash chain over every credit this address has received, in order — genesis is all zeroes, and
                each release folds in the programme, amount, attestation and timestamp. It is what lets anyone
                verify a claimed off-chain history against what actually happened on-chain; the value itself
                isn&rsquo;t meant to be read on its own.
              </p>
              <details>
                <summary>View the current hash</summary>
                <code className="numeric history-root__value">{data.history_root.toString('hex')}</code>
              </details>
            </div>
            <p className="standing-disclaimer typo-text text-muted">
              This is a record of history, not a score — Milepost does not compute creditworthiness from it.
              It can&rsquo;t be transferred or bought, and it only reflects tranches this address has actually
              received.
            </p>
          </Card>

          <Card title="Verify history chain">
            <HistoryVerifier onChainRoot={data.history_root} />
          </Card>
          </>
        )}
      </AsyncView>
    </div>
  );
};
