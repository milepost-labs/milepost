import { StrKey } from '@stellar/stellar-sdk';
import { networks as attestNetworks } from '@milepost/attest';
import { networks as policyNetworks } from '@milepost/policy-spend';
import { networks as recordNetworks } from '@milepost/record';
import { networks as registryNetworks } from '@milepost/registry';
import { describe, expect, it } from 'vitest';
import { DEMO_PROGRAMME_ID } from '../context/sorobanStore';
import { looksLikeAddress } from '../lib/format';
import { FIXTURE_PROGRAMMES, SAMPLE_PROGRAMME_SEEDS } from './programmes';

const sampleIds = FIXTURE_PROGRAMMES.map((p) => p.id);

describe('sample programme ids', () => {
  it('are valid-format contract addresses', () => {
    for (const id of sampleIds) {
      expect(looksLikeAddress(id)).toBe(true);
      expect(StrKey.isValidContract(id)).toBe(true);
    }
  });

  it('are derived from their documented seeds', async () => {
    expect(Object.keys(SAMPLE_PROGRAMME_SEEDS).sort()).toEqual([...sampleIds].sort());
    for (const id of sampleIds) {
      const seed = new TextEncoder().encode(`milepost-sample:${SAMPLE_PROGRAMME_SEEDS[id]}`);
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', seed));
      expect(Array.from(StrKey.decodeContract(id))).toEqual(Array.from(digest));
    }
  });

  it('are not real deployed contracts', () => {
    const deployed = [
      DEMO_PROGRAMME_ID,
      registryNetworks.testnet.contractId,
      attestNetworks.testnet.contractId,
      recordNetworks.testnet.contractId,
      policyNetworks.testnet.contractId,
    ];
    for (const id of sampleIds) {
      expect(deployed).not.toContain(id);
    }
  });
});
