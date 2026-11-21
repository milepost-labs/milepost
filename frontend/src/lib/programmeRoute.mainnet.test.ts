import { describe, expect, it, vi } from 'vitest';

vi.mock('./samples', () => ({ samplesEnabled: () => false }));

vi.mock('../config/network', () => ({
  NETWORK: {
    name: 'mainnet',
    passphrase: 'Public Global Stellar Network ; September 2015',
    rpcUrl: 'https://rpc.example.org',
    indexerUrl: 'https://index.example.org/v1',
    contracts: { registry: 'CREGISTRY', attest: 'CATTEST', record: 'CRECORD', policy: 'CPOLICY' },
    explorer: 'public',
    friendbot: false,
    demoProgrammeId: null,
  },
  explorerFor: () => 'public',
}));

import { programmeRouteState } from './programmeView';
import { FIXTURE_PROGRAMMES } from '../fixtures/programmes';

describe('programme routes on mainnet', () => {
  it('sends the bare route to the directory', () => {
    expect(programmeRouteState(null)).toBe('directory');
  });

  it('does not treat a sample address as a programme', () => {
    expect(programmeRouteState(FIXTURE_PROGRAMMES[0].id)).toBe('not-a-programme');
  });

  it('still opens a real programme', () => {
    expect(programmeRouteState('CREAL')).toBe('programme');
  });
});
