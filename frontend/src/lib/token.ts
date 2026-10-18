import { contract, Networks } from '@milepost/program';

/**
 * Base64-encoded XDR for Soroban SEP-41 Token interface function:
 * `name() -> String`
 */
const TOKEN_NAME_SPEC_XDR = 'AAAAAAAAAAAAAAAEbmFtZQAAAAAAAAABAAAAEA==';

export interface TokenAssetInfo {
  code: string;
  issuer: string | null;
  isNative: boolean;
  rawName: string;
}

/**
 * Parses the raw name returned by a Stellar Asset Contract's `name()` call.
 * - 'native' -> XLM (no issuer)
 * - 'CODE:ISSUER' -> Asset code and issuer address
 * - Other strings -> Asset code as name with no issuer
 */
export function parseTokenName(rawName: string): TokenAssetInfo {
  const trimmed = rawName.trim();
  if (trimmed.toLowerCase() === 'native') {
    return {
      code: 'XLM',
      issuer: null,
      isNative: true,
      rawName,
    };
  }

  const colonIdx = trimmed.indexOf(':');
  if (colonIdx !== -1) {
    const code = trimmed.slice(0, colonIdx);
    const issuer = trimmed.slice(colonIdx + 1);
    return {
      code,
      issuer: issuer.length > 0 ? issuer : null,
      isNative: false,
      rawName,
    };
  }

  return {
    code: trimmed,
    issuer: null,
    isNative: false,
    rawName,
  };
}

/**
 * Read the token contract's name() on-chain.
 */
export async function fetchTokenName(
  contractId: string,
  rpcUrl: string,
  networkPassphrase = Networks.TESTNET,
): Promise<{ result: string }> {
  const spec = new contract.Spec([TOKEN_NAME_SPEC_XDR]);
  const client = new contract.Client(spec, {
    contractId,
    rpcUrl,
    networkPassphrase,
  });

  const tx = await (client as unknown as { name: () => Promise<{ result: string }> }).name();
  return { result: tx.result };
}
