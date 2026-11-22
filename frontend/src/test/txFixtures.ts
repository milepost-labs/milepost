/**
 * Transaction fixtures for transaction lookup tests (Issue #633).
 *
 * NOTE ON FIXTURE SOURCES:
 * The repository does not currently contain recorded testnet XDR fixtures.
 * In accordance with protocol testing guidelines, all fixtures below are
 * clearly labeled as SDK-CONSTRUCTED (not recorded from testnet).
 *
 * Each fixture includes metadata documenting the exact testnet transaction
 * type that should be recorded to replace it when live network recording
 * is performed.
 */

import { Buffer } from 'buffer';
import { Address, nativeToScVal, xdr } from '@stellar/stellar-sdk';

export const FIXTURE_PROGRAMME_ID = 'CBJWECZ3EUVNAE73YIMT2KWWNRHRF7NNWVKOLQRVOHSKYRYE32XBRPW7';
export const FIXTURE_DONOR_ADDRESS = 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ';
export const FIXTURE_FEE_SOURCE = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';

export const FIXTURE_VALID_TX_HASH = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

/** Build an i128 ScVal from a bigint. */
export function toI128(amount: bigint): xdr.ScVal {
  return nativeToScVal(amount, { type: 'i128' });
}

/**
 * SDK-CONSTRUCTED (not recorded).
 * Replace with: Testnet transaction invoking `contribute(donor: Address, amount: i128)` on a programme contract.
 */
export function buildContributionEnvelope(
  contractId: string = FIXTURE_PROGRAMME_ID,
  donor: string = FIXTURE_DONOR_ADDRESS,
  amount: bigint = 250_000_000n,
): xdr.TransactionEnvelope {
  const contractAddress = Address.fromString(contractId).toScAddress();
  const donorScVal = new Address(donor).toScVal();
  const amountScVal = toI128(amount);

  const invokeArgs = new xdr.InvokeContractArgs({
    contractAddress,
    functionName: 'contribute',
    args: [donorScVal, amountScVal],
  });
  const hostFn = xdr.HostFunction.hostFunctionTypeInvokeContract(invokeArgs);
  const op = new xdr.Operation({
    sourceAccount: null,
    body: xdr.OperationBody.invokeHostFunction(
      new xdr.InvokeHostFunctionOp({ hostFunction: hostFn, auth: [] }),
    ),
  });
  const account = xdr.MuxedAccount.keyTypeEd25519(Buffer.alloc(32));
  const tx = new xdr.Transaction({
    sourceAccount: account,
    fee: 100,
    seqNum: xdr.Int64.fromString('1'),
    cond: xdr.Preconditions.precondNone(),
    memo: xdr.Memo.memoNone(),
    operations: [op],
    ext: new xdr.TransactionExt(0),
  });
  return xdr.TransactionEnvelope.envelopeTypeTx(
    new xdr.TransactionV1Envelope({ tx, signatures: [] }),
  );
}

/**
 * SDK-CONSTRUCTED (not recorded).
 * Replace with: Testnet transaction invoking `refund(donor: Address)` on a programme contract.
 */
export function buildRefundEnvelope(
  contractId: string = FIXTURE_PROGRAMME_ID,
  donor: string = FIXTURE_DONOR_ADDRESS,
): xdr.TransactionEnvelope {
  const contractAddress = Address.fromString(contractId).toScAddress();
  const donorScVal = new Address(donor).toScVal();

  const invokeArgs = new xdr.InvokeContractArgs({
    contractAddress,
    functionName: 'refund',
    args: [donorScVal],
  });
  const hostFn = xdr.HostFunction.hostFunctionTypeInvokeContract(invokeArgs);
  const op = new xdr.Operation({
    sourceAccount: null,
    body: xdr.OperationBody.invokeHostFunction(
      new xdr.InvokeHostFunctionOp({ hostFunction: hostFn, auth: [] }),
    ),
  });
  const account = xdr.MuxedAccount.keyTypeEd25519(Buffer.alloc(32));
  const tx = new xdr.Transaction({
    sourceAccount: account,
    fee: 100,
    seqNum: xdr.Int64.fromString('1'),
    cond: xdr.Preconditions.precondNone(),
    memo: xdr.Memo.memoNone(),
    operations: [op],
    ext: new xdr.TransactionExt(0),
  });
  return xdr.TransactionEnvelope.envelopeTypeTx(
    new xdr.TransactionV1Envelope({ tx, signatures: [] }),
  );
}

/**
 * SDK-CONSTRUCTED (not recorded).
 * Replace with: Testnet transaction invoking `refund_partial(donor: Address, amount: i128)` on a programme contract.
 */
export function buildRefundPartialEnvelope(
  contractId: string = FIXTURE_PROGRAMME_ID,
  donor: string = FIXTURE_DONOR_ADDRESS,
  amount: bigint = 50_000_000n,
): xdr.TransactionEnvelope {
  const contractAddress = Address.fromString(contractId).toScAddress();
  const donorScVal = new Address(donor).toScVal();
  const amountScVal = toI128(amount);

  const invokeArgs = new xdr.InvokeContractArgs({
    contractAddress,
    functionName: 'refund_partial',
    args: [donorScVal, amountScVal],
  });
  const hostFn = xdr.HostFunction.hostFunctionTypeInvokeContract(invokeArgs);
  const op = new xdr.Operation({
    sourceAccount: null,
    body: xdr.OperationBody.invokeHostFunction(
      new xdr.InvokeHostFunctionOp({ hostFunction: hostFn, auth: [] }),
    ),
  });
  const account = xdr.MuxedAccount.keyTypeEd25519(Buffer.alloc(32));
  const tx = new xdr.Transaction({
    sourceAccount: account,
    fee: 100,
    seqNum: xdr.Int64.fromString('1'),
    cond: xdr.Preconditions.precondNone(),
    memo: xdr.Memo.memoNone(),
    operations: [op],
    ext: new xdr.TransactionExt(0),
  });
  return xdr.TransactionEnvelope.envelopeTypeTx(
    new xdr.TransactionV1Envelope({ tx, signatures: [] }),
  );
}

/**
 * SDK-CONSTRUCTED (not recorded).
 * Replace with: Testnet transaction invoking a non-contribution/non-refund method, e.g. `apply` or `review`.
 */
export function buildOtherContractCallEnvelope(
  contractId: string = FIXTURE_PROGRAMME_ID,
  functionName: string = 'apply',
  args: xdr.ScVal[] = [],
): xdr.TransactionEnvelope {
  const contractAddress = Address.fromString(contractId).toScAddress();
  const invokeArgs = new xdr.InvokeContractArgs({
    contractAddress,
    functionName,
    args,
  });
  const hostFn = xdr.HostFunction.hostFunctionTypeInvokeContract(invokeArgs);
  const op = new xdr.Operation({
    sourceAccount: null,
    body: xdr.OperationBody.invokeHostFunction(
      new xdr.InvokeHostFunctionOp({ hostFunction: hostFn, auth: [] }),
    ),
  });
  const account = xdr.MuxedAccount.keyTypeEd25519(Buffer.alloc(32));
  const tx = new xdr.Transaction({
    sourceAccount: account,
    fee: 100,
    seqNum: xdr.Int64.fromString('1'),
    cond: xdr.Preconditions.precondNone(),
    memo: xdr.Memo.memoNone(),
    operations: [op],
    ext: new xdr.TransactionExt(0),
  });
  return xdr.TransactionEnvelope.envelopeTypeTx(
    new xdr.TransactionV1Envelope({ tx, signatures: [] }),
  );
}

/**
 * SDK-CONSTRUCTED (not recorded).
 * Replace with: Testnet transaction containing standard Stellar operations (e.g. payment) without Soroban host functions.
 */
export function buildNonContractOpEnvelope(): xdr.TransactionEnvelope {
  const destination = xdr.MuxedAccount.keyTypeEd25519(Buffer.alloc(32));
  const asset = xdr.Asset.assetTypeNative();
  const op = new xdr.Operation({
    sourceAccount: null,
    body: xdr.OperationBody.payment(
      new xdr.PaymentOp({
        destination,
        asset,
        amount: xdr.Int64.fromString('10000000'),
      }),
    ),
  });
  const account = xdr.MuxedAccount.keyTypeEd25519(Buffer.alloc(32));
  const tx = new xdr.Transaction({
    sourceAccount: account,
    fee: 100,
    seqNum: xdr.Int64.fromString('1'),
    cond: xdr.Preconditions.precondNone(),
    memo: xdr.Memo.memoNone(),
    operations: [op],
    ext: new xdr.TransactionExt(0),
  });
  return xdr.TransactionEnvelope.envelopeTypeTx(
    new xdr.TransactionV1Envelope({ tx, signatures: [] }),
  );
}

/**
 * SDK-CONSTRUCTED (not recorded).
 * Replace with: Testnet fee-bump transaction wrapping a Soroban transaction envelope.
 */
export function buildFeeBumpEnvelope(
  innerEnvelope: xdr.TransactionEnvelope,
  feeSource: string = FIXTURE_FEE_SOURCE,
): xdr.TransactionEnvelope {
  const feeAccount = new Address(feeSource);
  const muxedSource = xdr.MuxedAccount.keyTypeEd25519(feeAccount.toBuffer());
  const innerTx = xdr.FeeBumpTransactionInnerTx.envelopeTypeTx(innerEnvelope.v1());

  const feeBumpTx = new xdr.FeeBumpTransaction({
    feeSource: muxedSource,
    fee: xdr.Int64.fromString('500'),
    innerTx,
    ext: new xdr.FeeBumpTransactionExt(0),
  });
  return xdr.TransactionEnvelope.envelopeTypeTxFeeBump(
    new xdr.FeeBumpTransactionEnvelope({
      tx: feeBumpTx,
      signatures: [],
    }),
  );
}

/**
 * SDK-CONSTRUCTED (not recorded).
 * Replace with: Testnet legacy V0 transaction envelope invoking a contract function.
 */
export function buildV0Envelope(
  contractId: string = FIXTURE_PROGRAMME_ID,
  functionName: string = 'contribute',
  args: xdr.ScVal[] = [new Address(FIXTURE_DONOR_ADDRESS).toScVal(), toI128(100_000_000n)],
): xdr.TransactionEnvelope {
  const contractAddress = Address.fromString(contractId).toScAddress();
  const invokeArgs = new xdr.InvokeContractArgs({
    contractAddress,
    functionName,
    args,
  });
  const hostFn = xdr.HostFunction.hostFunctionTypeInvokeContract(invokeArgs);
  const op = new xdr.Operation({
    sourceAccount: null,
    body: xdr.OperationBody.invokeHostFunction(
      new xdr.InvokeHostFunctionOp({ hostFunction: hostFn, auth: [] }),
    ),
  });
  const account = Buffer.alloc(32);
  const tx = new xdr.TransactionV0({
    sourceAccountEd25519: account,
    fee: 100,
    seqNum: xdr.Int64.fromString('1'),
    timeBounds: null,
    memo: xdr.Memo.memoNone(),
    operations: [op],
    ext: new xdr.TransactionV0Ext(0),
  });
  return xdr.TransactionEnvelope.envelopeTypeTxV0(
    new xdr.TransactionV0Envelope({ tx, signatures: [] }),
  );
}

/**
 * SDK-CONSTRUCTED (not recorded).
 * Replace with: Testnet transaction with a non-invokeContract host function (e.g. uploadContractWasm).
 */
export function buildUploadWasmEnvelope(): xdr.TransactionEnvelope {
  const hostFn = xdr.HostFunction.hostFunctionTypeUploadContractWasm(Buffer.alloc(8));
  const op = new xdr.Operation({
    sourceAccount: null,
    body: xdr.OperationBody.invokeHostFunction(
      new xdr.InvokeHostFunctionOp({ hostFunction: hostFn, auth: [] }),
    ),
  });
  const account = xdr.MuxedAccount.keyTypeEd25519(Buffer.alloc(32));
  const tx = new xdr.Transaction({
    sourceAccount: account,
    fee: 100,
    seqNum: xdr.Int64.fromString('1'),
    cond: xdr.Preconditions.precondNone(),
    memo: xdr.Memo.memoNone(),
    operations: [op],
    ext: new xdr.TransactionExt(0),
  });
  return xdr.TransactionEnvelope.envelopeTypeTx(
    new xdr.TransactionV1Envelope({ tx, signatures: [] }),
  );
}
