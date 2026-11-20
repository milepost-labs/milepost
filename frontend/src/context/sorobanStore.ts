import { createContext } from 'react';
import { NETWORK } from '../config/network';
import type { Client as Registry } from '@milepost/registry';
import type { Client as Programme } from '@milepost/program';
import type { Client as Attest } from '@milepost/attest';
import type { Client as Record } from '@milepost/record';
import type { Client as PolicySpend } from '@milepost/policy-spend';

/** Context object and types, kept apart from the provider for Fast Refresh. */

/**
 * The seeded programme, used until listings exist. Empty on a network that has
 * none (mainnet); callers that would show it check for that.
 */
export const DEMO_PROGRAMME_ID = NETWORK.demoProgrammeId ?? '';

export interface SorobanState {
  registry: Registry;
  attest: Attest;
  record: Record;
  policy: PolicySpend;
  programmeAt: (contractId: string) => Programme;
  /** The seeded programme, so pages have something real to render. */
  demoProgramme: Programme;
  rpcUrl: string;
}

export const SorobanContext = createContext<SorobanState | undefined>(undefined);
