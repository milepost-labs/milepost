import { createContext } from 'react';
import type { Client as Registry } from '@milepost/registry';
import type { Client as Programme } from '@milepost/program';
import type { Client as Attest } from '@milepost/attest';
import type { Client as Record } from '@milepost/record';

/** Context object and types, kept apart from the provider for Fast Refresh. */

/** Seeded testnet programme, used until listings exist. */
export const DEMO_PROGRAMME_ID =
  import.meta.env.VITE_PROGRAMME_ID || 'CD6X33SKLUEMANS67ID3LJL572FFGERMMJCIFRW7P7EKZQLH35XT67C6';

export interface SorobanState {
  registry: Registry;
  attest: Attest;
  record: Record;
  programmeAt: (contractId: string) => Programme;
  /** The seeded programme, so pages have something real to render. */
  demoProgramme: Programme;
  rpcUrl: string;
}

export const SorobanContext = createContext<SorobanState | undefined>(undefined);
