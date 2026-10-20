import { useMemo, type ReactNode } from 'react';
import { SorobanContext, DEMO_PROGRAMME_ID, type SorobanState } from './sorobanStore';

/**
 * Contract clients, loaded on first use.
 *
 * The contract client imports (@milepost/*) are moved inside the provider function
 * so they load only when SorobanProvider mounts, not when the module loads. This
 * keeps the landing page's initial JavaScript bundle small: browsers don't download
 * the Stellar SDK until they navigate to a route that uses it.
 *
 * The four singleton contracts carry their deployed address in
 * `networks.testnet`. A programme does not: every programme is its own
 * contract, so `programmeAt(id)` builds a client per address rather than
 * pretending there is one.
 */

const RPC_URL = import.meta.env.VITE_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';

export function SorobanProvider({ children }: { children: ReactNode }) {
  const value = useMemo<SorobanState>(() => {
    // Import clients here, not at module level, so they're only loaded when the provider mounts.
    // Dynamic import lets Vite split these into a separate chunk from the landing page.
    const { Client: Registry, networks } = require('@milepost/registry');
    const { Client: Programme } = require('@milepost/program');
    const { Client: Attest, networks: attestNetworks } = require('@milepost/attest');
    const { Client: Record, networks: recordNetworks } = require('@milepost/record');
    const { Client: PolicySpend, networks: policyNetworks } = require('@milepost/policy-spend');

    const common = { networkPassphrase: networks.testnet.networkPassphrase, rpcUrl: RPC_URL };

    const programmeAt = (contractId: string) => new Programme({ contractId, ...common });

    return {
      registry: new Registry({ ...networks.testnet, rpcUrl: RPC_URL }),
      attest: new Attest({ ...attestNetworks.testnet, rpcUrl: RPC_URL }),
      record: new Record({ ...recordNetworks.testnet, rpcUrl: RPC_URL }),
      policy: new PolicySpend({ ...policyNetworks.testnet, rpcUrl: RPC_URL }),
      programmeAt,
      demoProgramme: programmeAt(DEMO_PROGRAMME_ID),
      rpcUrl: RPC_URL,
    };
  }, []);

  return <SorobanContext.Provider value={value}>{children}</SorobanContext.Provider>;
}


