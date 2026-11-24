import { describe, it, expect } from 'vitest';
import { Networks } from '@stellar/stellar-sdk';
import { networks as registryNetworks } from '@milepost/registry';
import { networks as attestNetworks } from '@milepost/attest';
import { networks as recordNetworks } from '@milepost/record';
import { networks as policyNetworks } from '@milepost/policy-spend';
import { NETWORK, explorerFor, resolveNetwork } from './network';
import { MAINNET_VARS, assertMainnetEnv, missingMainnetVars } from './networkEnv';

const MAINNET_ENV = {
  VITE_NETWORK: 'mainnet',
  VITE_MAINNET_RPC_URL: 'https://rpc.example.org/',
  VITE_MAINNET_INDEXER_URL: 'https://index.example.org/v1/',
  VITE_MAINNET_REGISTRY_ID: 'CREGISTRY',
  VITE_MAINNET_ATTEST_ID: 'CATTEST',
  VITE_MAINNET_RECORD_ID: 'CRECORD',
  VITE_MAINNET_POLICY_ID: 'CPOLICY',
};

describe('the values written out in network.ts', () => {
  // network.ts avoids importing the SDK and the bindings so the landing page
  // doesn't load them. These checks are what keep its copies honest.
  it('match the SDK passphrases and every binding deployment', () => {
    const testnet = resolveNetwork({});
    expect(testnet.passphrase).toBe(Networks.TESTNET);
    expect(testnet.passphrase).toBe(registryNetworks.testnet.networkPassphrase);
    expect(testnet.contracts).toEqual({
      registry: registryNetworks.testnet.contractId,
      attest: attestNetworks.testnet.contractId,
      record: recordNetworks.testnet.contractId,
      policy: policyNetworks.testnet.contractId,
    });
    expect(resolveNetwork(MAINNET_ENV).passphrase).toBe(Networks.PUBLIC);
  });
});

describe('testnet (the default)', () => {
  it('uses what the app used before, when nothing is set', () => {
    const config = resolveNetwork({});
    expect(config).toEqual({
      name: 'testnet',
      passphrase: registryNetworks.testnet.networkPassphrase,
      rpcUrl: 'https://soroban-testnet.stellar.org',
      indexerUrl: 'https://milepost-labs.github.io/milepost-indexer/v1',
      contracts: {
        registry: registryNetworks.testnet.contractId,
        attest: attestNetworks.testnet.contractId,
        record: recordNetworks.testnet.contractId,
        policy: policyNetworks.testnet.contractId,
      },
      explorer: 'testnet',
      friendbot: true,
      demoProgrammeId: 'CD6X33SKLUEMANS67ID3LJL572FFGERMMJCIFRW7P7EKZQLH35XT67C6',
    });
  });

  it('treats VITE_NETWORK=testnet as the default', () => {
    expect(resolveNetwork({ VITE_NETWORK: 'testnet' })).toEqual(resolveNetwork({}));
  });

  it('lets the RPC, indexer and programme overrides win, and drops trailing slashes', () => {
    const config = resolveNetwork({
      VITE_SOROBAN_RPC_URL: 'http://localhost:8000/',
      VITE_INDEXER_URL: 'https://index.example.org/v1//',
      VITE_PROGRAMME_ID: 'COVERRIDE',
    });
    expect(config.rpcUrl).toBe('http://localhost:8000');
    expect(config.indexerUrl).toBe('https://index.example.org/v1');
    expect(config.demoProgrammeId).toBe('COVERRIDE');
  });

  it('is frozen', () => {
    expect(Object.isFrozen(NETWORK)).toBe(true);
    expect(Object.isFrozen(NETWORK.contracts)).toBe(true);
  });

  it('is what this test run is built for', () => {
    expect(NETWORK.name).toBe('testnet');
  });

  it('rejects a network it does not know', () => {
    expect(() => resolveNetwork({ VITE_NETWORK: 'futurenet' })).toThrow(/VITE_NETWORK/);
  });
});

describe('mainnet', () => {
  it('reads every value from its own variables', () => {
    const config = resolveNetwork(MAINNET_ENV);
    expect(config).toEqual({
      name: 'mainnet',
      passphrase: Networks.PUBLIC,
      rpcUrl: 'https://rpc.example.org',
      indexerUrl: 'https://index.example.org/v1',
      contracts: { registry: 'CREGISTRY', attest: 'CATTEST', record: 'CRECORD', policy: 'CPOLICY' },
      explorer: 'public',
      friendbot: false,
      demoProgrammeId: null,
    });
  });

  it('ignores the testnet overrides', () => {
    const config = resolveNetwork({
      ...MAINNET_ENV,
      VITE_SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org',
      VITE_PROGRAMME_ID: 'CDEMO',
    });
    expect(config.rpcUrl).toBe('https://rpc.example.org');
    expect(config.demoProgrammeId).toBeNull();
  });

  it.each(Object.values(MAINNET_VARS))('names %s when it is missing', (name) => {
    const env: Record<string, string | undefined> = { ...MAINNET_ENV };
    delete env[name];
    expect(missingMainnetVars(env)).toEqual([name]);
    expect(() => resolveNetwork(env)).toThrow(name);
    expect(() => assertMainnetEnv(env)).toThrow(name);
  });

  it('treats a blank value as missing', () => {
    expect(missingMainnetVars({ ...MAINNET_ENV, VITE_MAINNET_RPC_URL: '  ' })).toEqual([MAINNET_VARS.rpcUrl]);
  });

  it('names every missing variable at once', () => {
    const missing = Object.values(MAINNET_VARS);
    expect(missingMainnetVars({ VITE_NETWORK: 'mainnet' })).toEqual(missing);
    expect(() => assertMainnetEnv({ VITE_NETWORK: 'mainnet' })).toThrow(new RegExp(missing.join('.*')));
  });

  it('asks nothing of a testnet build', () => {
    expect(missingMainnetVars({})).toEqual([]);
  });
});

describe('explorerFor', () => {
  it('maps a wallet network name, defaulting to the app network', () => {
    expect(explorerFor('TESTNET')).toBe('testnet');
    expect(explorerFor('PUBLIC')).toBe('public');
    expect(explorerFor()).toBe(NETWORK.explorer);
  });
});
