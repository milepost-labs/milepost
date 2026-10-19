import React from 'react';
import './WhyStellar.css';

type StellarFeature = {
  t: string;
  d: string;
  tech: string;
};

const STELLAR_FEATURES: StellarFeature[] = [
  { t: 'Cash out locally', d: 'Anchors turn stablecoins into local money through bank and mobile-money off-ramps. Without them, the rest is theatre.', tech: 'SEP-24 · SEP-31' },
  { t: 'Designed for no gas to buy', d: 'Stellar can sponsor transaction fees, so a recipient does not have to hold XLM. This app does not sponsor fees yet: you pay your own network fees.', tech: 'Fee-bump / sponsored transactions' },
  { t: 'Designed for smart wallets', d: 'Stellar smart wallets can replace a seed phrase with Face ID or a fingerprint. The app does not offer passkey sign-in yet: sign-in today is with the Freighter extension.', tech: 'Smart wallets (secp256r1)' },
  { t: 'Spending rules in the wallet', d: 'A policy can limit grant money to one asset, verified payees and a cap.', tech: 'policy_spend signer' },
];

export const WhyStellar: React.FC = () => {
  return (
    <section aria-labelledby="h-stellar" className="why-stellar-section">
      <div className="why-stellar-header">
        <span className="eyebrow" style={{ color: 'var(--accent-strong)' }}>Why Stellar</span>
        <h2 id="h-stellar">Built for people who have never used crypto.</h2>
      </div>
      <div className="stellar-grid">
        {STELLAR_FEATURES.map((s, i) => (
          <div key={i} className="stellar-card">
            <span className="stellar-title">{s.t}</span>
            <span className="stellar-desc">{s.d}</span>
            <span className="stellar-tech">{s.tech}</span>
          </div>
        ))}
      </div>
    </section>
  );
};
