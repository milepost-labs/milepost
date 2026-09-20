import { useMemo, type ReactNode } from 'react';
import { SorobanContext, DEMO_PROGRAMME_ID, type SorobanState } from './sorobanStore';
import { Client as Registry, networks } from '@milepost/registry';
import { Client as Programme } from '@milepost/program';
import { Client as Attest, networks as attestNetworks } from '@milepost/attest';
import { Client as Record, networks as recordNetworks } from '@milepost/record';

/**
 * Contract clients, constructed once.
 *
 * The four singleton contracts carry their deployed address in
 * `networks.testnet`. A programme does not: every programme is its own
 * contract, so `programmeAt(id)` builds a client per address rather than
 * pretending there is one.
 */

const RPC_URL = import.meta.env.VITE_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';


const common = { networkPassphrase: networks.testnet.networkPassphrase, rpcUrl: RPC_URL };



export function SorobanProvider({ children }: { children: ReactNode }) {
  const value = useMemo<SorobanState>(() => {
    const programmeAt = (contractId: string) => new Programme({ contractId, ...common });
    return {
      registry: new Registry({ ...networks.testnet, rpcUrl: RPC_URL }),
      attest: new Attest({ ...attestNetworks.testnet, rpcUrl: RPC_URL }),
      record: new Record({ ...recordNetworks.testnet, rpcUrl: RPC_URL }),
      programmeAt,
      demoProgramme: programmeAt(DEMO_PROGRAMME_ID),
      rpcUrl: RPC_URL,
    };
  }, []);

  return <SorobanContext.Provider value={value}>{children}</SorobanContext.Provider>;
}


