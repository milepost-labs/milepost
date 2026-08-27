import { useState } from 'react';
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

const formatXlm = (amount: bigint) => formatAmount(amount, { asset: 'XLM' });
const formatDate = (seconds: bigint) => new Date(Number(seconds) * 1000).toLocaleString();

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
          <Card title="Track record" aside={<Badge tone="accent">Cross-programme</Badge>}>
            <div className="standing-grid">
              <Stat label="Programmes" value={data.programmes} />
              <Stat label="Tranches released" value={data.tranches} />
              <Stat label="Total received" value={formatXlm(data.total_received)} numeric />
              <Stat label="First seen" value={formatDate(data.first_seen)} />
              <Stat label="Last updated" value={formatDate(data.last_updated)} />
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
        )}
      </AsyncView>
    </div>
  );
};
