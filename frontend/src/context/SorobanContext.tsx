import { useMemo, type ReactNode } from 'react';
import { SorobanContext, DEMO_PROGRAMME_ID, type SorobanState } from './sorobanStore';
import { Client as Registry } from '@milepost/registry';
import { Client as Programme } from '@milepost/program';
import { Client as Attest } from '@milepost/attest';
import { Client as Record } from '@milepost/record';
import { Client as PolicySpend } from '@milepost/policy-spend';
import { NETWORK } from '../config/network';

/**
 * Contract clients, constructed once.
 *
 * The four singleton contracts take their address from the network setting.
 * A programme does not: every programme is its own contract, so
 * `programmeAt(id)` builds a client per address rather than pretending there
 * is one.
 */

const RPC_URL = NETWORK.rpcUrl;

const common = { networkPassphrase: NETWORK.passphrase, rpcUrl: RPC_URL };



export function SorobanProvider({ children }: { children: ReactNode }) {
  const value = useMemo<SorobanState>(() => {
    // One client per contract id. Reads key on the client they were given, so a
    // fresh client on every call would look like a new programme each render.
    const clients = new Map<string, Programme>();
    const programmeAt = (contractId: string) => {
      let client = clients.get(contractId);
      if (!client) {
        client = new Programme({ contractId, ...common });
        clients.set(contractId, client);
      }
      return client;
    };
    return {
      registry: new Registry({ ...common, contractId: NETWORK.contracts.registry }),
      attest: new Attest({ ...common, contractId: NETWORK.contracts.attest }),
      record: new Record({ ...common, contractId: NETWORK.contracts.record }),
      policy: new PolicySpend({ ...common, contractId: NETWORK.contracts.policy }),
      programmeAt,
      demoProgramme: programmeAt(DEMO_PROGRAMME_ID),
      rpcUrl: RPC_URL,
    };
  }, []);

  return <SorobanContext.Provider value={value}>{children}</SorobanContext.Provider>;
}


