import type { rpc } from '@stellar/stellar-sdk';

/**
 * Restoring archived entries before a write.
 *
 * Soroban archives entries nobody extends. A write that touches one fails at
 * simulation with a restore preamble: the footprint to restore and its fee.
 * The SDK's assembled transaction carries that simulation and can build, sign
 * and send the restore, after which the write is simulated again from scratch.
 */

type SignTransaction = (xdr: string) => Promise<{ signedTxXdr: string; signerAddress: string }>;

/** What a write needs restored first, and how to do it. */
export interface RestoreStep {
  /** The restore's fee in stroops: its resource fee plus the base fee. */
  feeStroops: bigint;
  /** Builds the restore, has the wallet sign it, and waits for it to land. */
  run: (signTransaction: SignTransaction) => Promise<void>;
}

const BASE_FEE_STROOPS = 100n;

// `rpc.Api.GetTransactionStatus.SUCCESS`, written out so this module, which the
// landing page reaches through the transaction hook, needs only the SDK's types.
const TRANSACTION_SUCCESS = 'SUCCESS';

/**
 * `rpc.Api.isSimulationRestore`, without importing the SDK for it: a successful
 * simulation (it carries `transactionData`) that also carries a restore preamble.
 */
function isSimulationRestore(
  simulation: rpc.Api.SimulateTransactionResponse,
): simulation is rpc.Api.SimulateTransactionRestoreResponse {
  return (
    'transactionData' in simulation &&
    'restorePreamble' in simulation &&
    Boolean((simulation as { restorePreamble?: { transactionData?: unknown } }).restorePreamble?.transactionData)
  );
}

interface AssembledLike {
  simulation?: rpc.Api.SimulateTransactionResponse;
  options: { signTransaction?: unknown };
  restoreFootprint: (
    preamble: rpc.Api.SimulateTransactionRestoreResponse['restorePreamble'],
  ) => Promise<rpc.Api.GetTransactionResponse>;
}

function isAssembled(value: unknown): value is AssembledLike {
  const candidate = value as Partial<AssembledLike> | null;
  return Boolean(
    candidate &&
      typeof candidate.restoreFootprint === 'function' &&
      candidate.options &&
      candidate.simulation,
  );
}

/**
 * The restore an assembled transaction's simulation asks for, or null when
 * it asks for none (or the value is not an assembled transaction).
 */
export function restoreFromAssembled(transaction: unknown): RestoreStep | null {
  if (!isAssembled(transaction)) return null;
  const simulation = transaction.simulation!;
  if (!isSimulationRestore(simulation)) return null;
  const preamble = simulation.restorePreamble;
  return {
    feeStroops: BigInt(preamble.minResourceFee) + BASE_FEE_STROOPS,
    run: async (signTransaction) => {
      // The SDK signs the restore with the client's own signer; this app's
      // clients are built without one and get the wallet's at send time.
      transaction.options.signTransaction = signTransaction;
      const response = await transaction.restoreFootprint(preamble);
      if (response.status !== TRANSACTION_SUCCESS) {
        throw new Error(`The restore did not go through (${response.status}).`);
      }
    },
  };
}

/**
 * The restore a sendable needs: the one it names, for wrappers around an
 * assembled transaction, or the assembled transaction's own.
 */
export function restoreOf(sendable: unknown): RestoreStep | null {
  const named = (sendable as { restore?: RestoreStep | null } | null)?.restore;
  if (named !== undefined) return named;
  return restoreFromAssembled(sendable);
}
