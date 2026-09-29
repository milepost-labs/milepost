import React from 'react';
import './AboutDeployment.css';
import { networks as registryNetworks } from '@milepost/registry';
import { networks as attestNetworks } from '@milepost/attest';
import { networks as recordNetworks } from '@milepost/record';
import { networks as policyNetworks } from '@milepost/policy-spend';
import { DEMO_PROGRAMME_ID } from '../context/sorobanStore';
import { INDEXER_BASE_URL } from '../lib/indexer';
import { AddressChip } from '../components/ui/AddressChip';
import { usePageTitle } from '../hooks/usePageTitle';

export interface DeploymentContract {
  name: string;
  id: string;
  description: string;
}

const DEPLOYED_CONTRACTS: DeploymentContract[] = [
  {
    name: 'Registry',
    id: registryNetworks.testnet.contractId,
    description: 'Deploys programmes and holds protocol configuration.',
  },
  {
    name: 'Attest',
    id: attestNetworks.testnet.contractId,
    description: 'General-purpose schema-based attestation registry.',
  },
  {
    name: 'Record',
    id: recordNetworks.testnet.contractId,
    description: 'Portable recipient standing and credit history.',
  },
  {
    name: 'Policy Spend',
    id: policyNetworks.testnet.contractId,
    description: 'Smart wallet policy signer for restricted transfers.',
  },
  {
    name: 'Program (Demo)',
    id: DEMO_PROGRAMME_ID,
    description: 'Seeded testnet programme instance for conditional disbursements.',
  },
];

const APP_BUILD_VERSION = import.meta.env.VITE_APP_VERSION || 'dev';

export function AboutDeployment(): React.JSX.Element {
  usePageTitle('About This Deployment');

  return (
    <div className="container page-wrapper about-deployment">
      <header className="about-header">
        <span className="eyebrow">Deployment & Configuration</span>
        <h1 className="about-title">About this deployment</h1>
        <p className="text-muted about-lead">
          Verified contracts, network endpoints, and build metadata powering this Milepost instance.
        </p>
      </header>

      <section className="about-section" aria-labelledby="network-heading">
        <h2 id="network-heading" className="about-section-heading">Network</h2>
        <div className="about-grid">
          <div className="about-card">
            <span className="about-label">Network</span>
            <strong className="about-value">Stellar Testnet</strong>
          </div>
          <div className="about-card">
            <span className="about-label">Build version</span>
            <strong className="about-value numeric">{APP_BUILD_VERSION}</strong>
          </div>
          <div className="about-card about-card--full">
            <span className="about-label">Indexer Base URL</span>
            <a
              href={INDEXER_BASE_URL}
              target="_blank"
              rel="noreferrer"
              className="about-indexer-link"
            >
              <code>{INDEXER_BASE_URL}</code>
            </a>
          </div>
        </div>
      </section>

      <section className="about-section" aria-labelledby="contracts-heading">
        <h2 id="contracts-heading" className="about-section-heading">Deployed Contracts</h2>
        <ul className="about-contract-list">
          {DEPLOYED_CONTRACTS.map((contract) => (
            <li key={contract.name} className="about-contract-card">
              <div className="about-contract-info">
                <span className="about-contract-name">{contract.name}</span>
                <p className="about-contract-desc text-muted">{contract.description}</p>
              </div>
              <div className="about-contract-chip">
                <AddressChip
                  address={contract.id}
                  showExplorerLink
                  copyLabel={`Copy ${contract.name} contract address`}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
