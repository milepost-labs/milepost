import React from 'react';
import './VerifierDashboard.css';
import { ShieldCheck, Clock, FileSignature } from 'lucide-react';

export const VerifierDashboard: React.FC = () => {
  return (
    <div className="dashboard-container">
      <header className="dashboard-header animate-fade-up">
        <h1>Verifier Dashboard</h1>
        <p className="typo-text text-muted">Review conditions and sign on-chain attestations to unlock funds.</p>
      </header>

      <section className="stats-grid animate-fade-up" style={{ animationDelay: '100ms' }}>
        <div className="stat-card glass-panel">
          <div className="stat-icon" aria-hidden="true"><Clock size={24} /></div>
          <div className="stat-content">
            <span className="stat-label">Pending Reviews</span>
            <span className="stat-value" aria-label="12 pending reviews">12</span>
          </div>
        </div>
        <div className="stat-card glass-panel">
          <div className="stat-icon" aria-hidden="true"><ShieldCheck size={24} /></div>
          <div className="stat-content">
            <span className="stat-label">Total Attested</span>
            <span className="stat-value" aria-label="458 total attested">458</span>
          </div>
        </div>
      </section>

      <section className="queue-section animate-fade-up" style={{ animationDelay: '200ms' }}>
        <h2>Attestation Queue</h2>
        <div className="queue-list">
          
          <div className="queue-item glass-panel">
            <div className="queue-item-icon" aria-hidden="true">
              <FileSignature size={24} />
            </div>
            <div className="queue-item-content">
              <div className="queue-item-header">
                <h3>Semester Completion</h3>
                <span className="badge badge-pending">Pending</span>
              </div>
              <p className="typo-text text-muted">
                <strong>Recipient:</strong> GCS-2026-042 <br/>
                <strong>Program:</strong> CS Scholarship 2026 <br/>
                <strong>Tranche Unlock:</strong> $1,000 Stipend
              </p>
            </div>
            <div className="queue-item-actions">
              <button type="button" className="btn-secondary" aria-label="View proof for Semester Completion">View Proof</button>
              <button type="button" className="btn-primary" aria-label="Sign attestation for Semester Completion">Sign Attestation</button>
            </div>
          </div>

          <div className="queue-item glass-panel">
            <div className="queue-item-icon" aria-hidden="true">
              <FileSignature size={24} />
            </div>
            <div className="queue-item-content">
              <div className="queue-item-header">
                <h3>Enrollment Verification</h3>
                <span className="badge badge-pending">Pending</span>
              </div>
              <p className="typo-text text-muted">
                <strong>Recipient:</strong> GCS-2026-089 <br/>
                <strong>Program:</strong> CS Scholarship 2026 <br/>
                <strong>Tranche Unlock:</strong> $1,500 Tuition
              </p>
            </div>
            <div className="queue-item-actions">
              <button type="button" className="btn-secondary" aria-label="View proof for Enrollment Verification">View Proof</button>
              <button type="button" className="btn-primary" aria-label="Sign attestation for Enrollment Verification">Sign Attestation</button>
            </div>
          </div>

        </div>
      </section>
    </div>
  );
};
