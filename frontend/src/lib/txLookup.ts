/**
 * Rebuilding a contribution receipt from a transaction hash.
 *
 * A receipt used to exist only in the tab that sent the contribution. The
 * RPC's `getTransaction(hash)` still knows a recent transaction's result and
 * ledger, and a successful one carries its full envelope — so the contribution
 * itself can be recovered: which programme's `contribute` the transaction
 * called, from which donor, for how much. Everything else on a rebuilt
 * receipt (share of the programme, the state the money sits in now) is
 * re-read on-chain through the shared reader, so it reflects today, not the
 * moment of sending.
 *
 * The response's XDR is already decoded by the SDK, so this is typed access,
 * not string parsing. Old transactions fall out of the RPC's history window;
 * that is the explorer's job, and the lookup screen links there.
 */

import { Address, xdr, scValToNative, rpc } from '@milepost/program';

const TRANSACTION_STATUS = rpc.Api.GetTransactionStatus;

/** A transaction hash is 32 bytes, hex. */
const TX_HASH_PATTERN = /^[0-9a-f]{64}$/i;

export function isValidTxHash(hash: string): boolean {
  return TX_HASH_PATTERN.test(hash.trim());
}

/** A parsed `contribute` call: the parts a receipt is rebuilt from. */
export interface ContributionTx {
  /** The programme whose `contribute` the transaction invoked. */
  programmeId: string;
  /** The address the donor contributed from. */
  donor: string;
  /** Stroops, as signed on-chain. */
  amount: bigint;
}

/** What the RPC answered for a hash. */
export type TxLookup =
  | {
      status: 'SUCCESS';
      ledger: number;
      /** Unix seconds, from the RPC. */
      createdAt: number | null;
      /** The contribution, or null when this transaction is not one. */
      contribution: ContributionTx | null;
      /** How many operations the transaction carried. */
      opCount: number;
    }
  | {
      /** The network refused it — nothing was contributed. */
      status: 'FAILED';
      ledger: number;
      createdAt: number | null;
    }
  | {
      /** Outside the RPC's retention window; the explorer is the next stop. */
      status: 'NOT_FOUND';
    };

/** Construct an RPC server for `rpcUrl`. The testnet RPC endpoint is http-only. */
export function rpcServer(rpcUrl: string): rpc.Server {
  return new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });
}

export async function lookupTransaction(server: rpc.Server, hash: string): Promise<TxLookup> {
  const response = await server.getTransaction(hash);

  switch (response.status) {
    case TRANSACTION_STATUS.NOT_FOUND:
      return { status: 'NOT_FOUND' };
    case TRANSACTION_STATUS.FAILED:
      return {
        status: 'FAILED',
        ledger: response.ledger,
        createdAt: typeof response.createdAt === 'number' ? response.createdAt : null,
      };
    case TRANSACTION_STATUS.SUCCESS:
      return {
        status: 'SUCCESS',
        ledger: response.ledger,
        createdAt: typeof response.createdAt === 'number' ? response.createdAt : null,
        contribution: parseContribution(response.envelopeXdr),
        opCount: operationsOf(response.envelopeXdr).length,
      };
  }
}

/** Find the first `contribute` invocation in a transaction's envelope. */
export function parseContribution(envelope: xdr.TransactionEnvelope): ContributionTx | null {
  for (const operation of operationsOf(envelope)) {
    const invocation = contractInvocation(operation);
    if (!invocation) continue;
    if (invocation.functionName().toString() !== 'contribute') continue;

    const args = invocation.args();

    // contribute(donor: Address, amount: i128) — anything else is not this.
    if (args.length !== 2) continue;
    try {
      const native = args.map(scValToNative);
      if (typeof native[0] !== 'string' || typeof native[1] !== 'bigint') continue;
      // The invocation's "contract address" is the programme being called.
      const programmeId = Address.fromScAddress(invocation.contractAddress()).toString();
      return { programmeId, donor: native[0], amount: native[1] };
    } catch {
      continue; // Not an address-shaped invocation; skip without failing the lookup.
    }
  }
  return null;
}

/** Envelope operations, through fee-bump wrappers, for any envelope version. */
function operationsOf(envelope: xdr.TransactionEnvelope): xdr.Operation[] {
  try {
    switch (envelope.switch().value) {
      case xdr.EnvelopeType.envelopeTypeTxV0().value:
        return envelope.v0().tx().operations();
      case xdr.EnvelopeType.envelopeTypeTx().value:
        return envelope.v1().tx().operations();
      case xdr.EnvelopeType.envelopeTypeTxFeeBump().value:
        return operationsOf(envelope.feeBump().tx().innerTx() as unknown as xdr.TransactionEnvelope);
      default:
        return [];
    }
  } catch {
    return [];
  }
}

/**
 * The `invokeContract` args of an operation, or null for every other kind.
 *
 * `Operation` is a struct around an `OperationBody` union; both older SDK
 * accessors for the invoke arm are tried before giving up, so a bindings
 * upgrade cannot quietly strand this path.
 */
function contractInvocation(operation: xdr.Operation): xdr.InvokeContractArgs | null {
  try {
    const body = operation.body();
    if (body.switch().value !== xdr.OperationType.invokeHostFunction().value) return null;
    const hostOperation = body.invokeHostFunctionOp().hostFunction();
    if (hostOperation.switch().value !== xdr.HostFunctionType.hostFunctionTypeInvokeContract().value) {
      return null;
    }
    return hostOperation.invokeContract();
  } catch {
    return null;
  }
}
