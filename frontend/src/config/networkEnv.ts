/**
 * The environment variables a mainnet build must set. Kept free of
 * `import.meta` and of the contract bindings so `vite.config.ts` can import it
 * and fail the build before anything is bundled.
 */

export const MAINNET_VARS = {
  rpcUrl: 'VITE_MAINNET_RPC_URL',
  indexerUrl: 'VITE_MAINNET_INDEXER_URL',
  registry: 'VITE_MAINNET_REGISTRY_ID',
  attest: 'VITE_MAINNET_ATTEST_ID',
  record: 'VITE_MAINNET_RECORD_ID',
  policy: 'VITE_MAINNET_POLICY_ID',
} as const;

export type EnvSource = Record<string, string | undefined>;

/** Which network the build targets. Unset, or anything but "mainnet", means testnet. */
export function selectedNetwork(env: EnvSource): 'testnet' | 'mainnet' {
  const value = env.VITE_NETWORK?.trim().toLowerCase();
  if (!value || value === 'testnet') return 'testnet';
  if (value === 'mainnet') return 'mainnet';
  throw new Error(`VITE_NETWORK must be "testnet" or "mainnet", got "${env.VITE_NETWORK}".`);
}

/** The mainnet variables that are unset or blank. Empty for a testnet build. */
export function missingMainnetVars(env: EnvSource): string[] {
  if (selectedNetwork(env) !== 'mainnet') return [];
  return Object.values(MAINNET_VARS).filter((name) => !env[name]?.trim());
}

/** Throws a message naming every missing mainnet variable. */
export function assertMainnetEnv(env: EnvSource): void {
  const missing = missingMainnetVars(env);
  if (missing.length > 0) {
    throw new Error(
      `VITE_NETWORK=mainnet needs ${missing.length === 1 ? 'a value for' : 'values for'}: ${missing.join(', ')}.`,
    );
  }
}
