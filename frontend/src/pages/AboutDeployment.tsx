import { Link } from 'react-router-dom';
import { NETWORK } from '../config/network';
import { useSoroban } from '../context/useSoroban';
import { INDEXER_BASE_URL } from '../lib/indexer';
import { AddressChip, Notice, PageHead, Receipt } from '../components/ui';
import { ProtocolConfigCard } from '../components/admin/ProtocolConfigCard';
import { usePageTitle } from '../hooks/usePageTitle';
import './AboutDeployment.css';

export interface DeploymentContract {
  name: string;
  /** The contract's name in the code: `registry`, `attest`, `record`, `policy_spend`, `program`. */
  code: string;
  id: string;
  description: string;
}

const DEPLOYED_CONTRACTS: DeploymentContract[] = [
  {
    name: 'Registry',
    code: 'registry',
    id: NETWORK.contracts.registry,
    description: 'Deploys programmes and holds the protocol config.',
  },
  {
    name: 'Attestations',
    code: 'attest',
    id: NETWORK.contracts.attest,
    description: 'Signed claims under registered schemas.',
  },
  {
    name: 'Standing',
    code: 'record',
    id: NETWORK.contracts.record,
    description: 'Recipients’ portable totals across programmes.',
  },
  {
    name: 'Spend policy',
    code: 'policy_spend',
    id: NETWORK.contracts.policy,
    description: 'The default policy signer for Restricted awards.',
  },
  ...(NETWORK.demoProgrammeId
    ? [
        {
          name: 'Testnet pilot',
          code: 'program',
          id: NETWORK.demoProgrammeId,
          description: 'The seeded programme. Every programme is its own contract.',
        },
      ]
    : []),
];

const APP_BUILD_VERSION = import.meta.env.VITE_APP_VERSION || 'dev';

/**
 * `/about`: which network, contracts and build this app runs against, for
 * anyone reporting a problem or checking the work. Contract ids come from the
 * published bindings, the protocol config from the registry.
 */
export function AboutDeployment() {
  usePageTitle('About this deployment');
  const { rpcUrl } = useSoroban();

  return (
    <div className="about">
      <PageHead eyebrow="Programmes" title="About this deployment">
        <p>Which network, contracts and build this app is running. Useful when reporting a problem or checking our work.</p>
      </PageHead>

      <Notice tone="risk">
        {NETWORK.name === 'mainnet' ? (
          <span>
            <strong>Stellar mainnet, pre-audit.</strong> The contracts have not been audited. Funds you send are real.
          </span>
        ) : (
          <span>
            <strong>Stellar testnet, pre-audit.</strong> The contracts have not been audited. Don’t use real funds.
          </span>
        )}
      </Notice>

      <div className="about__grid">
        <section className="about__panel" aria-labelledby="about-contracts">
          <h2 id="about-contracts">Contracts</h2>
          <table className="ui-table">
            <thead>
              <tr>
                <th scope="col">Contract</th>
                <th scope="col">Id</th>
              </tr>
            </thead>
            <tbody>
              {DEPLOYED_CONTRACTS.map((c) => (
                <tr key={c.name}>
                  <td data-label="Contract">
                    <span className="about__contract">
                      <b>{c.name}</b>
                      <span className="numeric">{c.code}</span>
                      <span className="about__desc">{c.description}</span>
                    </span>
                  </td>
                  <td data-label="Id">
                    <AddressChip address={c.id} showExplorerLink copyLabel={`Copy the ${c.name} contract id`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="about__fine">
            Each programme is its own contract, deployed by the registry. Programme pages show their own id.
          </p>
        </section>

        <aside className="about__aside">
          <section className="about__panel about__panel--sunk" aria-labelledby="about-network">
            <h2 id="about-network">Network and build</h2>
            <Receipt
              rows={[
                { label: 'Network', value: NETWORK.name === 'mainnet' ? 'Stellar mainnet' : 'Stellar testnet', text: true },
                { label: 'Passphrase', value: NETWORK.passphrase, text: true },
                { label: 'RPC', value: rpcUrl.replace(/^https?:\/\//, '') },
                { label: 'App build', value: APP_BUILD_VERSION },
                {
                  label: 'Index',
                  value: (
                    <a href={INDEXER_BASE_URL} target="_blank" rel="noreferrer">
                      {INDEXER_BASE_URL.replace(/^https?:\/\//, '')}
                    </a>
                  ),
                },
              ]}
            />
            <Link to="/status" className="about__link">
              Index status →
            </Link>
          </section>
          <ProtocolConfigCard readOnly />
        </aside>
      </div>
    </div>
  );
}
