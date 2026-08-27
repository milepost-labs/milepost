import { useEffect, useState, useCallback } from 'react';
import './RecipientDashboard.css';
import { Award, Unlock, FileText, AlertCircle } from 'lucide-react';
import { useWallet } from '../context/useWallet';
import { formatAmount, tryParseAmount } from '../lib/amount';
import type { Award as AwardData, Application } from '@milepost/program';
import { useProgramme, useTransaction, phaseLabel } from '../hooks';
import { Button, Field } from '../components/ui';
import { Buffer } from 'buffer';

// Seeded testnet recipient (Ada) for demo purposes
const DEMO_ADDRESS = "GAH3D4RM45ETE4W7VDRCWZBPRPT63CJXAGXFYVBC2FGANBZTS4OTKXCA";

async function calculateSha256(text: string): Promise<Buffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Buffer.from(hashBuffer);
}

export const RecipientDashboard = () => {
  const { address } = useWallet();
  const { client: programme } = useProgramme();
  const activeAddress = address || DEMO_ADDRESS;
  const isDemo = !address;

  const [award, setAward] = useState<AwardData | null>(null);
  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<string | null>(null);

  // Form state
  const [requested, setRequested] = useState('');
  const [proposal, setProposal] = useState('');
  const [requestedError, setRequestedError] = useState<string | null>(null);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [computedHashHex, setComputedHashHex] = useState('');

  const applyTx = useTransaction({
    contract: 'program',
    onSuccess: () => {
      fetchRecipientData();
    },
  });

  const fetchRecipientData = useCallback(async () => {
    try {
      setLoading(true);
      // Fetch phase
      const phaseRes = await programme.get_phase();
      const currentPhase = phaseRes.result.unwrap().tag;
      setPhase(currentPhase);

      try {
        const appRes = await programme.get_application({ applicant: activeAddress });
        const app = appRes.result.unwrap();
        setApplication(app);

        // If finalized, fetch Award
        if (app.finalized) {
          const awardRes = await programme.get_award({ recipient: activeAddress });
          setAward(awardRes.result.unwrap());
        }
      } catch (appError) {
        // Expected if the user has not applied yet
        setApplication(null);
        setAward(null);
      }
    } catch (e) {
      console.error("Error loading recipient data:", e);
    } finally {
      setLoading(false);
    }
  }, [activeAddress, programme]);

  useEffect(() => {
    fetchRecipientData();
  }, [fetchRecipientData]);

  // Compute live proposal hash
  useEffect(() => {
    if (!proposal.trim()) {
      setComputedHashHex('');
      return;
    }
    const timer = setTimeout(() => {
      calculateSha256(proposal).then((buf) => {
        setComputedHashHex(buf.toString('hex'));
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [proposal]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phase !== 'Open') return;

    let hasError = false;
    if (!proposal.trim()) {
      setProposalError('Proposal text is required');
      hasError = true;
    }

    const parsedAmount = tryParseAmount(requested);
    if (!parsedAmount.ok) {
      setRequestedError(parsedAmount.error);
      hasError = true;
    }

    if (hasError) return;

    const hash = await calculateSha256(proposal);

    const result = await applyTx.send(() =>
      programme.apply({
        applicant: activeAddress,
        requested: parsedAmount.value,
        metadata_hash: hash,
      })
    );

    if (result !== null) {
      fetchRecipientData();
    } else {
      // If submission failed (e.g. AlreadyApplied on-chain), refresh the data to see if it already exists
      await fetchRecipientData();
    }
  };

  if (loading) {
    return <div className="dashboard-container"><p>Loading on-chain data...</p></div>;
  }

  if (!application) {
    return (
      <div className="dashboard-container">
        <header className="dashboard-header animate-fade-up">
          <h1>Recipient Dashboard</h1>
          {isDemo && <p className="badge badge-settled" style={{ display: 'inline-block', marginTop: '0.5rem' }}>Demo Mode (Ada's Data)</p>}
          <p className="typo-text text-muted">Apply for funding or track your submitted applications.</p>
        </header>

        {isDemo && (
          <div className="glass-panel animate-fade-up" style={{ padding: '1rem', marginBottom: '1.5rem', borderLeft: '4px solid var(--color-warning)' }}>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>
              <strong>Viewing Demo Mode:</strong> Connect your wallet in the header to apply with your own account.
            </p>
          </div>
        )}

        {phase !== 'Open' && (
          <div className="glass-panel animate-fade-up" style={{ padding: '1.5rem', marginBottom: '2rem', borderLeft: '4px solid var(--color-error)' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <AlertCircle size={24} style={{ color: 'var(--color-error)' }} />
              <div>
                <h4 style={{ margin: 0, fontWeight: 'bold' }}>Applications Closed</h4>
                <p className="text-muted" style={{ margin: 0, fontSize: '0.95rem' }}>
                  This programme is currently in the <strong>{phase || 'unknown'}</strong> phase. Applications are only accepted during the <strong>Open</strong> phase.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="glass-panel animate-fade-up" style={{ padding: '2.5rem', maxWidth: '640px', margin: '0 auto' }}>
          <h2 style={{ marginBottom: '0.5rem' }}>Submit Funding Application</h2>
          <p className="text-muted" style={{ marginBottom: '2rem', fontSize: '0.95rem' }}>
            State the exact funding amount you need and submit your proposal. Your proposal is hashed client-side to keep your payload secure and verifiable.
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <Field
              label="Requested Amount (XLM)"
              placeholder="e.g. 1000"
              value={requested}
              onChange={(e) => {
                setRequested(e.target.value);
                setRequestedError(null);
              }}
              error={requestedError}
              disabled={phase !== 'Open' || applyTx.busy}
              suffix="XLM"
              required
            />

            <div className="ui-field">
              <label className="ui-field__label">Proposal Text</label>
              <div className={`ui-field__control${proposalError ? ' ui-field__control--error' : ''}`}>
                <textarea
                  style={{
                    width: '100%',
                    minHeight: '120px',
                    padding: 'var(--space-3) var(--space-4)',
                    border: 0,
                    background: 'transparent',
                    color: 'inherit',
                    font: 'inherit',
                    resize: 'vertical',
                    outline: 'none',
                  }}
                  placeholder="Describe your proposal in detail..."
                  value={proposal}
                  onChange={(e) => {
                    setProposal(e.target.value);
                    setProposalError(null);
                  }}
                  disabled={phase !== 'Open' || applyTx.busy}
                  required
                />
              </div>
              {proposalError ? (
                <p className="ui-field__message ui-field__message--error" role="alert">{proposalError}</p>
              ) : (
                <p className="ui-field__message">
                  A detailed description of your proposed project.
                </p>
              )}
            </div>

            {computedHashHex && (
              <div style={{ padding: '1rem', background: 'var(--bg-color)', borderRadius: '6px', border: '1px solid var(--surface-border)' }}>
                <span className="stat-label" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Proposal Hash (SHA-256)</span>
                <code style={{ display: 'block', wordBreak: 'break-all', fontSize: '0.85rem', marginTop: '0.25rem', fontFamily: 'monospace', color: 'var(--text-main)' }}>
                  {computedHashHex}
                </code>
              </div>
            )}

            <div style={{ padding: '1rem', background: 'var(--surface-hover)', borderRadius: '6px', borderLeft: '3px solid var(--color-warning)', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              <strong>Note on Proposal Storage:</strong> The raw proposal text is not stored on-chain to prevent gateway downtime blocking applications. Please save your proposal text and share it with the reviewers out-of-band. Only the 32-byte cryptographic hash is registered on the ledger.
            </div>

            {applyTx.error && (
              <div className="glass-panel" style={{ padding: '1rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--color-error)' }}>
                <p className="text-danger" style={{ fontWeight: '600', margin: 0, color: 'var(--color-error)' }}>{applyTx.error.message}</p>
                {applyTx.error.action && <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.25rem', margin: 0 }}>{applyTx.error.action}</p>}
              </div>
            )}

            <Button
              type="submit"
              loading={applyTx.busy}
              loadingLabel={phaseLabel(applyTx.phase)}
              disabled={phase !== 'Open'}
              fullWidth
            >
              Submit Application
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <header className="dashboard-header animate-fade-up">
        <h1>Recipient Dashboard</h1>
        {isDemo && <p className="badge badge-settled" style={{ display: 'inline-block', marginTop: '0.5rem' }}>Demo Mode (Ada's Data)</p>}
        <p className="typo-text text-muted">Track your milestones and unlock your grant tranches.</p>
      </header>

      <section className="stats-grid animate-fade-up" style={{ animationDelay: '100ms' }}>
        <div className="stat-card glass-panel">
          <div className="stat-icon"><Award size={24} /></div>
          <div className="stat-content">
            <span className="stat-label">Total Awarded</span>
            <span className="stat-value">{award ? `${formatAmount(award.granted)} XLM` : 'Pending'}</span>
          </div>
        </div>
        <div className="stat-card glass-panel">
          <div className="stat-icon"><FileText size={24} /></div>
          <div className="stat-content">
            <span className="stat-label">Requested Amount</span>
            <span className="stat-value">{formatAmount(application.requested)} XLM</span>
          </div>
        </div>
        <div className="stat-card glass-panel">
          <div className="stat-icon"><Unlock size={24} /></div>
          <div className="stat-content">
            <span className="stat-label">Tranches Released</span>
            <span className="stat-value">{award ? `${award.tranches_released} / ${award.tranches}` : '0 / 0'}</span>
          </div>
        </div>
      </section>

      <section className="milestones-section animate-fade-up" style={{ animationDelay: '200ms' }}>
        <h2>Award Details</h2>
        <div className="milestones-timeline">
          
          <div className="milestone-card glass-panel unlocked">
            <div className="milestone-icon">
              <AlertCircle size={20} />
            </div>
            <div className="milestone-details">
              <h3>Funding Mode: {award ? award.mode.tag : 'Pending Settle'}</h3>
              <p className="typo-text text-muted">
                {award?.mode.tag === 'Allocated' && "You can allocate your unlocked tranches to any verified payee."}
                {award?.mode.tag === 'Direct' && "Funds are paid directly to your fixed payee."}
              </p>
              
              {application && application.votes.length > 0 && (
                <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: 'var(--background)', borderRadius: '8px' }}>
                  <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>Reviewer Votes (Median Mechanism)</p>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {application.votes.map((v: bigint, i: number) => (
                      <span key={i} className="badge" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--surface-border)' }}>
                        {formatAmount(v)} XLM
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </section>
    </div>
  );
};
