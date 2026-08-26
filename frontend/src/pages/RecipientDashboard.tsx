import { useEffect, useState } from 'react';
import './RecipientDashboard.css';
import { Award, Unlock, FileText, AlertCircle } from 'lucide-react';
import { useSoroban } from '../context/useSoroban';
import { useWallet } from '../context/useWallet';
import { formatAmount, describeAmount } from '../lib/amount';
import type { Award as AwardData, Application } from '@milepost/program';

// Seeded testnet recipient (Ada) for demo purposes
const DEMO_ADDRESS = "GAH3D4RM45ETE4W7VDRCWZBPRPT63CJXAGXFYVBC2FGANBZTS4OTKXCA";

export const RecipientDashboard = () => {
  const { address } = useWallet();
  const { demoProgramme: programme } = useSoroban();
  const activeAddress = address || DEMO_ADDRESS;
  const isDemo = !address;

  const [award, setAward] = useState<AwardData | null>(null);
  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecipientData = async () => {
      try {
        setLoading(true);
        // 1. Fetch Application
        const appRes = await programme.get_application({ applicant: activeAddress });
        
        const app = appRes.result.unwrap();
        setApplication(app);

        // 2. If finalized, fetch Award
        if (app.finalized) {
          const awardRes = await programme.get_award({ recipient: activeAddress });
          setAward(awardRes.result.unwrap());
        }
      } catch (e) {
        console.error("Not a recipient or data missing:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchRecipientData();
  }, [activeAddress, programme]);

  if (loading) {
    return <div className="dashboard-container"><p>Loading on-chain data...</p></div>;
  }

  if (!application) {
    return (
      <div className="dashboard-container">
        <header className="dashboard-header animate-fade-up">
          <h1>Recipient Dashboard</h1>
          {isDemo && <p className="text-warning">Viewing Demo Address</p>}
        </header>
        <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center' }}>
          <AlertCircle size={48} style={{ margin: '0 auto', color: 'var(--text-muted)' }} aria-hidden="true" />
          <h3 style={{ marginTop: '1rem' }}>No Application Found</h3>
          <p className="text-muted">The connected wallet is not a registered applicant for this programme.</p>
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
          <div className="stat-icon" aria-hidden="true"><Award size={24} /></div>
          <div className="stat-content">
            <span className="stat-label">Total Awarded</span>
            <span className="stat-value" aria-label={award ? `Total awarded: ${describeAmount(award.granted)}` : 'Total awarded: pending'}>
              {award ? `${formatAmount(award.granted)} XLM` : 'Pending'}
            </span>
          </div>
        </div>
        <div className="stat-card glass-panel">
          <div className="stat-icon" aria-hidden="true"><FileText size={24} /></div>
          <div className="stat-content">
            <span className="stat-label">Requested Amount</span>
            <span className="stat-value" aria-label={`Requested: ${describeAmount(application.requested)}`}>
              {formatAmount(application.requested)} XLM
            </span>
          </div>
        </div>
        <div className="stat-card glass-panel">
          <div className="stat-icon" aria-hidden="true"><Unlock size={24} /></div>
          <div className="stat-content">
            <span className="stat-label">Tranches Released</span>
            <span className="stat-value" aria-label={award ? `${award.tranches_released} of ${award.tranches} tranches released` : 'No tranches released yet'}>
              {award ? `${award.tranches_released} / ${award.tranches}` : '0 / 0'}
            </span>
          </div>
        </div>
      </section>

      <section className="milestones-section animate-fade-up" style={{ animationDelay: '200ms' }}>
        <h2>Award Details</h2>
        <div className="milestones-timeline">
          
          <div className="milestone-card glass-panel unlocked">
            <div className="milestone-icon" aria-hidden="true">
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
                        {describeAmount(v)}
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
