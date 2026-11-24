import { MAINNET_VARS, assertMainnetEnv, selectedNetwork, type EnvSource } from './networkEnv';

/**
 * The one network setting. Everything that needs the passphrase, the RPC, a
 * contract id, the indexer or an explorer reads it from here; nothing else in
 * the app names a network. The network is fixed per build by `VITE_NETWORK`.
 */

export interface NetworkConfig {
  name: 'testnet' | 'mainnet';
  passphrase: string;
  rpcUrl: string;
  indexerUrl: string;
  contracts: {
    registry: string;
    attest: string;
    record: string;
    policy: string;
  };
  /** The Stellar Expert path segment. */
  explorer: 'testnet' | 'public';
  /** Friendbot exists only on testnet. */
  friendbot: boolean;
  /** The seeded programme, or null where there is none. */
  demoProgrammeId: string | null;
}

/**
 * The two network passphrases, and the shared testnet deployment's contract
 * ids, written out here rather than read from `@stellar/stellar-sdk` and the
 * `@milepost/*` bindings. This module sits on the landing page's path, and
 * importing either would pull the whole Stellar SDK into the first load.
 * `network.test.ts` checks every value against the SDK and the bindings, so
 * a redeploy that updates `packages/testnet.json` fails there until this file
 * follows it.
 */
const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
const PUBLIC_PASSPHRASE = 'Public Global Stellar Network ; September 2015';
const TESTNET_CONTRACTS = Object.freeze({
  registry: 'CCBQHBNIG5FIJEM6SQZQGTQRO3XXHV2BGVGGUY5JXXZ3Y55ZJSV3HMVF',
  attest: 'CC3PQUJKHPRSIHIH53GNIC6DIDOIJWCCGQ7NYZROBAS6TZLUGLOM5XQC',
  record: 'CCQCHPJGDR4VYJQEGCSNO3XQDQ2VT4GARVT4CV25K4AEKCFMATRFGAFF',
  policy: 'CD2F5HMCPZCPXFHEFRNVNCQFYKYZZND4EIV3BQXK2NP7PYFY57OZIYTS',
});

const TESTNET_RPC_URL = 'https://soroban-testnet.stellar.org';
const TESTNET_INDEXER_URL = 'https://milepost-labs.github.io/milepost-indexer/v1';
const TESTNET_PROGRAMME_ID = 'CD6X33SKLUEMANS67ID3LJL572FFGERMMJCIFRW7P7EKZQLH35XT67C6';

const trimUrl = (url: string) => url.trim().replace(/\/+$/, '');

function resolveMainnet(env: EnvSource): Readonly<NetworkConfig> {
  assertMainnetEnv(env);
  const get = (name: string) => (env[name] as string).trim();
  return Object.freeze({
    name: 'mainnet',
    passphrase: PUBLIC_PASSPHRASE,
    rpcUrl: trimUrl(get(MAINNET_VARS.rpcUrl)),
    indexerUrl: trimUrl(get(MAINNET_VARS.indexerUrl)),
    contracts: Object.freeze({
      registry: get(MAINNET_VARS.registry),
      attest: get(MAINNET_VARS.attest),
      record: get(MAINNET_VARS.record),
      policy: get(MAINNET_VARS.policy),
    }),
    explorer: 'public',
    friendbot: false,
    demoProgrammeId: null,
  });
}

function resolveTestnet(env: EnvSource): Readonly<NetworkConfig> {
  return Object.freeze({
    name: 'testnet',
    passphrase: TESTNET_PASSPHRASE,
    rpcUrl: trimUrl(env.VITE_SOROBAN_RPC_URL?.trim() || TESTNET_RPC_URL),
    indexerUrl: trimUrl(env.VITE_INDEXER_URL?.trim() || TESTNET_INDEXER_URL),
    contracts: TESTNET_CONTRACTS,
    explorer: 'testnet',
    friendbot: true,
    demoProgrammeId: env.VITE_PROGRAMME_ID?.trim() || TESTNET_PROGRAMME_ID,
  });
}

/** Build the setting from an environment. Throws on a mainnet build with variables missing. */
export function resolveNetwork(env: EnvSource): Readonly<NetworkConfig> {
  return selectedNetwork(env) === 'mainnet' ? resolveMainnet(env) : resolveTestnet(env);
}

/**
 * `__MILEPOST_NETWORK__` is replaced with "testnet" or "mainnet" at build time
 * (see vite.config.ts), from the same `VITE_NETWORK`. Branching on it here,
 * rather than inside `resolveNetwork`, lets a mainnet bundle drop the testnet
 * branch, and the seeded testnet programme with it.
 */
export const NETWORK: Readonly<NetworkConfig> =
  __MILEPOST_NETWORK__ === 'mainnet' ? resolveMainnet(import.meta.env) : resolveTestnet(import.meta.env);

/**
 * The explorer path segment for a network name. A wallet reports "TESTNET" or
 * "PUBLIC"; anything not naming testnet is treated as mainnet, the safer default.
 * With no name, the app's own network.
 */
export function explorerFor(network?: string): NetworkConfig['explorer'] {
  if (network === undefined) return NETWORK.explorer;
  return network.toLowerCase().includes('testnet') ? 'testnet' : 'public';
}
