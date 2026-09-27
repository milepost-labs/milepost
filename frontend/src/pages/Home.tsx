import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import './Home.css';
import { Shield, Zap, Lock, Unlock } from 'lucide-react';
import { CopyButton } from '../components/ui/CopyButton';
import { HeroDemo } from '../components/landing/HeroDemo';
import { RoleEntryCards } from '../components/landing/RoleEntryCards';
import { ProblemSection } from '../components/landing/ProblemSection';
import { GUARANTEES, LIMITS, ROLES, type Claim } from './homeContent';
import { LiveIndex } from '../components/home/LiveIndex';

/**
 * Every outbound link points at the public repository, which is where the
 * README and docs live.
 */
const REPO_URL = 'https://github.com/milepost-labs/milepost';

const INSTALL_COMMAND =
  'npm install @milepost/registry @milepost/program @milepost/attest @milepost/record @milepost/policy-spend';

/**
 * `docs/end-to-end-tutorial.md`, named in issue #259, does not exist in the
 * repository yet and writing it is explicitly out of scope for this issue —
 * linking to it would be a dead link, which the acceptance criteria forbid.
 * Omitted here; add it back once that doc exists.
 */
const DOC_LINKS = [
  { label: 'README', href: `${REPO_URL}#readme` },
  { label: 'Contributing', href: `${REPO_URL}/blob/main/CONTRIBUTING.md` },
  { label: 'Glossary', href: `${REPO_URL}/blob/main/docs/glossary.md` },
];

const CONTRACTS = [
  {
    name: 'registry',
    description: 'Deploys programmes and holds protocol config. The trust chain starts here.',
  },
  {
    name: 'program',
    description: 'One funding round: contributions, applications, review, awards, release, refunds.',
  },
  {
    name: 'attest',
    description: 'General-purpose, schema-based attestations. Knows nothing else about the protocol.',
  },
  { name: 'record', description: 'Portable, non-transferable standing. Counts and totals, never a list.' },
  {
    name: 'policy_spend',
    description: 'Policy signer for smart wallets: one asset, verified payees, a cap.',
  },
];

const INDEXER = {
  name: 'milepost-indexer',
  href: 'https://github.com/milepost-labs/milepost-indexer',
  description: 'Reads contract events and publishes JSON lists, because the contracts keep none.',
};

/**
 * Both columns render through this one component so neither can drift into
 * being visually quieter than the other: only the heading colour differs.
 */
function ClaimCard({
  heading,
  tone,
  claims,
}: {
  heading: string;
  tone: 'guaranteed' | 'limit';
  claims: Claim[];
}) {
  return (
    <div className="claim-card">
      <h3 className={`claim-card-heading claim-card-heading--${tone}`}>{heading}</h3>
      <dl>
        {claims.map((claim) => (
          <div key={claim.title} className="claim">
            <dt>{claim.title}</dt>
            <dd className="text-muted">{claim.detail}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

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

      {/* Hero: headline + interactive tranche demo (landing section 1). */}
      <section className="hero" aria-labelledby="hero-heading">
        <div className="hero__copy">
          <span className="hero__pill">Conditional disbursement on Stellar · testnet</span>
          <h1 id="hero-heading" className="hero__title">
            Money moves at each milepost, and only at each milepost.
          </h1>
          <p className="hero__mechanism">
            A funder commits money to a programme. Recipients receive it in tranches that unlock
            only when a trusted verifier confirms a condition was met.
          </p>
          <div className="hero__actions">
            <Link to="/directory" className="btn-primary btn-large">
              Launch app
            </Link>
            <a href="#how" className="btn-secondary btn-large">
              How it works ↓
            </a>
          </div>
          <span className="hero__note">Browsing programmes needs no sign-in.</span>
        </div>
        <HeroDemo />
      </section>

      {/* Role entry cards (landing section 2): route visitors in one click. */}
      <RoleEntryCards />

      {/* The problem (landing section 3): why the project exists. */}
      <ProblemSection />

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
              <li><strong>Milestone Escrow:</strong> Funds unlock only when a verifier attests on-chain that a condition was met.</li>
              <li><strong>Policy Signers:</strong> Smart wallets restrict where funds can be spent.</li>
              <li><strong>Money Comes Back:</strong> Anything never paid out returns to funders in proportion to what they put in.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* How it Works (Alternating Split Layout) */}
      <section id="how" className="how-it-works-section">
        <div className="section-header scroll-animate">
          <h2>Protocol Mechanics</h2>
        </div>
        
        <div className="alternating-grid">
          <div className="grid-row scroll-animate">
            <div className="grid-content">
              <div className="step-number">01</div>
              <h3>Funders Commit</h3>
              <p className="text-muted">Funders contribute to a specific programme. Once the release window closes, anything never paid out can be claimed back in proportion to each contribution.</p>
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

      {/* Roles */}
      <section id="roles" className="roles-section scroll-animate" aria-labelledby="roles-heading">
        <div className="section-header">
          <span className="eyebrow">Roles</span>
          <h2 id="roles-heading">Four people, one programme.</h2>
        </div>

        <div className="role-grid">
          {ROLES.map((role) => (
            <article key={role.role} className="role-card">
              <span className="eyebrow">{role.role}</span>
              <h3>{role.does}</h3>
              <p className="text-muted">{role.body}</p>
              <nav className="role-links" aria-label={`${role.role} pages`}>
                {role.links.map((link) => (
                  <Link key={link.path} to={link.path}>
                    {link.label}
                  </Link>
                ))}
              </nav>
            </article>
          ))}
        </div>

        <p className="role-note">
          <strong>Reviewers and verifiers are different jobs.</strong> Reviewers set the amount: each
          votes on what an applicant should get, and the award is the median of their votes.
          Verifiers unlock the payment: they confirm a condition was met, which releases one tranche
          of an amount already set. Both work from the verifier dashboard, in separate sections.
        </p>
      </section>

      {/* Guarantees and limits */}
      <section className="limits-section scroll-animate" aria-labelledby="limits-heading">
        <div className="section-header">
          <span className="eyebrow">Guarantees and limits</span>
          <h2 id="limits-heading">What the contracts promise, and what they don't.</h2>
        </div>

        <div className="claims-grid">
          <ClaimCard heading="Guaranteed" tone="guaranteed" claims={GUARANTEES} />
          <ClaimCard heading="Limits, stated" tone="limit" claims={LIMITS} />
        </div>
      </section>

      {/* Live on testnet */}
      <LiveIndex />

      {/* For developers */}
      <section id="developers" className="developers-section scroll-animate">
        <div className="developers-intro">
          <div className="section-header">
            <span className="eyebrow">For developers</span>
            <h2>Five contracts, typed bindings, a public index.</h2>
          </div>

          <div className="install-block">
            <pre className="install-command">
              <code>{INSTALL_COMMAND}</code>
            </pre>
            <CopyButton value={INSTALL_COMMAND} label="Copy install command" showLabel />
          </div>

          <nav className="doc-links" aria-label="Documentation">
            {DOC_LINKS.map((link) => (
              <a key={link.label} href={link.href} target="_blank" rel="noreferrer noopener">
                {link.label}
              </a>
            ))}
          </nav>
        </div>

        <ul className="contract-list">
          {CONTRACTS.map((contract) => (
            <li key={contract.name} className="contract-row">
              <code className="contract-name">{contract.name}</code>
              <p className="text-muted">{contract.description}</p>
            </li>
          ))}
          <li className="contract-row">
            <a
              className="contract-name"
              href={INDEXER.href}
              target="_blank"
              rel="noreferrer noopener"
            >
              {INDEXER.name}
            </a>
            <p className="text-muted">{INDEXER.description}</p>
          </li>
        </ul>
      </section>

      {/* Footer */}
      <footer className="landing-footer" role="contentinfo">
        <div className="landing-footer-inner">
          <span className="landing-footer-brand">Milepost</span>
          <span className="landing-footer-note">Pre-audit · testnet only</span>
          <nav className="landing-footer-links" aria-label="Footer">
            <a href={REPO_URL} target="_blank" rel="noreferrer noopener">
              Repository
            </a>
            <a href={`${REPO_URL}/blob/main/SECURITY.md`} target="_blank" rel="noreferrer noopener">
              Security policy
            </a>
            <a href={`${REPO_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer noopener">
              Licence
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
};
