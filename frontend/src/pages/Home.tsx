import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import './Home.css';
import { ArrowRight, CheckCircle, Shield, Zap, Lock, Unlock, ArrowUpRight } from 'lucide-react';

export const Home: React.FC = () => {
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
        }
      });
    }, { threshold: 0.1 });

    const hiddenElements = document.querySelectorAll('.scroll-animate');
    hiddenElements.forEach((el) => observerRef.current?.observe(el));

    return () => observerRef.current?.disconnect();
  }, []);

  return (
    <div className="landing-page">
      {/* Abstract Background Elements (Subtle & Professional) */}
      <div className="bg-shape shape-top-right"></div>
      <div className="bg-shape shape-bottom-left"></div>

      {/* Hero Section (Asymmetrical Split Layout) */}
      <section className="hero-split">
        <div className="hero-text-content">
          <div className="badge-pill animate-fade-up" style={{ animationDelay: '100ms' }}>
            <span className="pulse-dot"></span>
            Stellar Grant Escrow Protocol
          </div>
          <h1 className="hero-title animate-fade-up" style={{ animationDelay: '200ms' }}>
            Provable, <br/> Accountable <br/>
            <span className="text-highlight">Educational Impact.</span>
          </h1>
          <p className="hero-subtitle animate-fade-up" style={{ animationDelay: '300ms' }}>
            Milepost is conditional disbursement infrastructure on Stellar. Money moves at each milepost, and only at each milepost. We replace lump-sum transfers with milestone tranches and policy-restricted spending.
          </p>
          <div className="hero-actions animate-fade-up" style={{ animationDelay: '400ms' }}>
            <Link to="/directory" className="btn-primary btn-large">
              Explore Programs <ArrowRight size={20} />
            </Link>
            <a href="https://github.com/gbemi-dev/milepost" target="_blank" rel="noreferrer" className="btn-secondary btn-large">
              Read the Docs <ArrowUpRight size={18} />
            </a>
          </div>
        </div>
        
        <div className="hero-visual-content animate-fade-up" style={{ animationDelay: '300ms' }}>
          {/* Abstract UI Representation of a Milestone */}
          <div className="abstract-ui glass-panel">
            <div className="abstract-header">
              <div className="dots"><span></span><span></span><span></span></div>
              <div className="abstract-title">Disbursement Contract</div>
            </div>
            <div className="abstract-body">
              <div className="ui-row">
                <div className="ui-icon"><CheckCircle size={16}/></div>
                <div className="ui-text">
                  <div className="ui-line skeleton" style={{ width: '80%' }}></div>
                  <div className="ui-line skeleton-sub" style={{ width: '40%' }}></div>
                </div>
                <div className="ui-amount">$1,500</div>
              </div>
              <div className="ui-row locked">
                <div className="ui-icon"><Lock size={16}/></div>
                <div className="ui-text">
                  <div className="ui-line skeleton" style={{ width: '60%' }}></div>
                  <div className="ui-line skeleton-sub" style={{ width: '50%' }}></div>
                </div>
                <div className="ui-amount">$1,000</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Paradigm Shift (Full Width Grid) */}
      <section className="compare-section full-width scroll-animate">
        <div className="section-header">
          <h2>The Paradigm Shift</h2>
          <p className="text-muted">Moving beyond transparent voting to actual accountability.</p>
        </div>
        
        <div className="compare-bento">
          <div className="bento-card old-way glass-panel">
            <div className="bento-header">
              <Lock size={20} className="text-error" />
              <h3>The Old Way</h3>
            </div>
            <p className="text-muted">Lump sums, zero accountability after transfer, and high gas fees that price out micro-philanthropy.</p>
          </div>
          
          <div className="bento-card new-way glass-panel">
            <div className="bento-header">
              <Unlock size={20} className="text-success" />
              <h3>The Milepost Way</h3>
            </div>
            <ul className="bento-list">
              <li><strong>Milestone Escrow:</strong> Funds unlock only on cryptographic proof.</li>
              <li><strong>Policy Signers:</strong> Smart wallets restrict where funds can be spent.</li>
              <li><strong>Zero Friction:</strong> Passkeys and sponsored transactions on Stellar.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* How it Works (Alternating Split Layout) */}
      <section className="how-it-works-section">
        <div className="section-header scroll-animate">
          <h2>Protocol Mechanics</h2>
        </div>
        
        <div className="alternating-grid">
          <div className="grid-row scroll-animate">
            <div className="grid-content">
              <div className="step-number">01</div>
              <h3>Funders Commit</h3>
              <p className="text-muted">Donors pool USDC into a specific program via SEP-24 ramps. Unused tranches automatically recycle for the next cohort, ensuring capital efficiency.</p>
            </div>
            <div className="grid-visual glass-panel">
              <div className="mini-ui funder-ui">
                <div className="mini-header">Program Vault</div>
                <div className="mini-body">
                  <div className="mini-stat">
                    <span>USDC Locked</span>
                    <strong>$250,000</strong>
                  </div>
                  <div className="mini-progress-bar">
                    <div className="mini-progress-fill" style={{ width: '75%' }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid-row reverse scroll-animate">
            <div className="grid-content">
              <div className="step-number">02</div>
              <h3>Verifiers Attest</h3>
              <p className="text-muted">Instead of committee votes, trusted Institutions (like Universities or Clinics) cryptographically sign on-chain attestations when real-world conditions are met.</p>
            </div>
            <div className="grid-visual glass-panel">
              <div className="mini-ui verifier-ui">
                <div className="doc-lines">
                  <div className="doc-line title"></div>
                  <div className="doc-line"></div>
                  <div className="doc-line short"></div>
                </div>
                <div className="doc-seal">
                  <Shield size={20} className="seal-icon" />
                  <span>Attested</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid-row scroll-animate">
            <div className="grid-content">
              <div className="step-number">03</div>
              <h3>Tranches Unlock</h3>
              <p className="text-muted">Attestations trigger a release. Tuition tranches are policy-restricted to only pay the University, while stipends land directly in the recipient's wallet.</p>
            </div>
            <div className="grid-visual glass-panel">
              <div className="mini-ui tranche-ui">
                <div className="tranche-item">
                  <div className="tranche-icon success"><Unlock size={16} /></div>
                  <div className="tranche-details">
                    <div className="tranche-name">Tuition</div>
                    <div className="tranche-amount text-success">$1,500 Disbursed</div>
                  </div>
                </div>
                <div className="tranche-line"></div>
                <div className="tranche-item locked">
                  <div className="tranche-icon"><Lock size={16} /></div>
                  <div className="tranche-details">
                    <div className="tranche-name">Stipend</div>
                    <div className="tranche-amount">$1,000 Locked</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Infrastructure CTA (Full Bleed) */}
      <section className="infrastructure-section full-bleed scroll-animate">
        <div className="infra-container">
          <div className="infra-text">
            <h2>Built for the Ecosystem</h2>
            <p>
              Milepost is built on Soroban. The core modules—<code>attest</code>, <code>record</code>, and <code>policy_spend</code>—are deliberately decoupled as open-source public goods available for any Stellar developer.
            </p>
          </div>
          <div className="infra-action">
             <Link to="/funders" className="btn-primary btn-large btn-inverted">
              View Dashboard <Zap size={18} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};
