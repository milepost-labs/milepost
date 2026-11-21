/**
 * Unit tests for refund receipt parsing.
 *
 * Each test builds a minimal transaction envelope with the SDK's XDR builders
 * (one `invokeHostFunction` calling `refund`, `refund_partial` or
 * `contribute` on a programme) and, for `lookupTransaction`, feeds it through
 * a mocked RPC server, so nothing touches the network.
 */
import { describe, it, expect, vi } from 'vitest';
import { Buffer } from 'buffer';
import { Address, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { lookupTransaction, parseContribution, parseRefund } from './txLookup';

const PROGRAMME = 'CBJWECZ3EUVNAE73YIMT2KWWNRHRF7NNWVKOLQRVOHSKYRYE32XBRPW7';

// ---------------------------------------------------------------------------
// Helpers that build minimal valid XDR for the two refund call shapes.
// We use the SDK's own builders (not raw bytes) so the tests are resilient
// to XDR schema changes in the SDK.
// ---------------------------------------------------------------------------

/** Build an i128 ScVal from a bigint. */
function i128(amount: bigint): xdr.ScVal {
  return nativeToScVal(amount, { type: 'i128' });
}

/** Minimal envelope: a single invokeHostFunction for `fnName(contractId, ...args)`. */
function minimalEnvelope(
  contractId: string,
  fnName: string,
  args: xdr.ScVal[],
): xdr.TransactionEnvelope {
  const contractAddress = Address.fromString(contractId).toScAddress();
  const invokeArgs = new xdr.InvokeContractArgs({
    contractAddress,
    functionName: fnName,
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

// ---------------------------------------------------------------------------
// The donor: a real account address, so the parsed donor can be checked.
// ---------------------------------------------------------------------------
const DONOR = 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ';
const donorScVal = new Address(DONOR).toScVal();

// ---------------------------------------------------------------------------
// parseRefund — direct unit tests
// ---------------------------------------------------------------------------
describe('parseRefund', () => {
  it('parses a full refund(donor) and reads the amount from returnValue', () => {
    const envelope = minimalEnvelope(PROGRAMME, 'refund', [donorScVal]);
    const returnValue = i128(180_000_000n); // 18 XLM

    const result = parseRefund(envelope, returnValue);

    expect(result).not.toBeNull();
    expect(result!.programmeId).toBe(PROGRAMME);
    expect(result!.donor).toBe(DONOR);
    expect(result!.amount).toBe(180_000_000n);
    expect(result!.partial).toBe(false);
  });

  it('parses a refund_partial(donor, amount) and sets partial = true', () => {
    const amountArg = i128(50_000_000n);
    const envelope = minimalEnvelope(PROGRAMME, 'refund_partial', [donorScVal, amountArg]);
    const returnValue = i128(50_000_000n); // 5 XLM returned

    const result = parseRefund(envelope, returnValue);

    expect(result).not.toBeNull();
    expect(result!.donor).toBe(DONOR);
    expect(result!.amount).toBe(50_000_000n);
    expect(result!.partial).toBe(true);
  });

  it('returns null for a contribute transaction', () => {
    const amtArg = i128(100_000_000n);
    const envelope = minimalEnvelope(PROGRAMME, 'contribute', [donorScVal, amtArg]);

    expect(parseRefund(envelope, i128(100_000_000n))).toBeNull();
  });

  it('returns null when returnValue is absent', () => {
    const envelope = minimalEnvelope(PROGRAMME, 'refund', [donorScVal]);

    expect(parseRefund(envelope, undefined)).toBeNull();
  });

  it('returns null when the returned amount is zero', () => {
    const envelope = minimalEnvelope(PROGRAMME, 'refund', [donorScVal]);

    expect(parseRefund(envelope, i128(0n))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseContribution — verify it still works alongside the new parser
// ---------------------------------------------------------------------------
describe('parseContribution', () => {
  it('still parses a contribute(donor, amount) correctly', () => {
    const amtArg = i128(250_000_000n);
    const envelope = minimalEnvelope(PROGRAMME, 'contribute', [donorScVal, amtArg]);

    const result = parseContribution(envelope);

    expect(result).not.toBeNull();
    expect(result!.programmeId).toBe(PROGRAMME);
    expect(result!.donor).toBe(DONOR);
    expect(result!.amount).toBe(250_000_000n);
  });

  it('returns null for a refund transaction', () => {
    const envelope = minimalEnvelope(PROGRAMME, 'refund', [donorScVal]);

    expect(parseContribution(envelope)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// lookupTransaction — integration tests via mocked RPC server
// ---------------------------------------------------------------------------
describe('lookupTransaction', () => {
  const BASE_RESPONSE = {
    ledger: 5_000_000,
    createdAt: 1_790_000_000,
  };

  it('populates refund on a successful refund transaction', async () => {
    const envelope = minimalEnvelope(PROGRAMME, 'refund', [donorScVal]);
    const returnValue = i128(180_000_000n);

    const mockServer = {
      getTransaction: vi.fn().mockResolvedValue({
        status: 'SUCCESS',
        ...BASE_RESPONSE,
        envelopeXdr: envelope,
        returnValue,
        resultXdr: {} as xdr.TransactionResult,
        resultMetaXdr: {} as xdr.TransactionMeta,
      }),
    };

    const result = await lookupTransaction(mockServer as never, 'ab'.repeat(32));

    expect(result.status).toBe('SUCCESS');
    if (result.status !== 'SUCCESS') return;
    expect(result.refund).not.toBeNull();
    expect(result.refund!.amount).toBe(180_000_000n);
    expect(result.refund!.partial).toBe(false);
    expect(result.contribution).toBeNull();
  });

  it('populates contribution on a contribute transaction and leaves refund null', async () => {
    const amtArg = i128(250_000_000n);
    const envelope = minimalEnvelope(PROGRAMME, 'contribute', [donorScVal, amtArg]);

    const mockServer = {
      getTransaction: vi.fn().mockResolvedValue({
        status: 'SUCCESS',
        ...BASE_RESPONSE,
        envelopeXdr: envelope,
        returnValue: undefined,
        resultXdr: {} as xdr.TransactionResult,
        resultMetaXdr: {} as xdr.TransactionMeta,
      }),
    };

    const result = await lookupTransaction(mockServer as never, 'ab'.repeat(32));

    expect(result.status).toBe('SUCCESS');
    if (result.status !== 'SUCCESS') return;
    expect(result.contribution).not.toBeNull();
    expect(result.refund).toBeNull();
  });
});
