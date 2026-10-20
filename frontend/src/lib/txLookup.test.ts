import { describe, expect, it, vi } from 'vitest';
import { Buffer } from 'buffer';
import { Address, nativeToScVal, rpc, xdr } from '@milepost/program';
import {
  isValidTxHash,
  lookupTransaction,
  parseContribution,
  rpcServer,
} from './txLookup';

/**
 * The contribution receipt is rebuilt from a transaction envelope. A wrong
 * answer here shows someone a receipt for money they did not send, so every
 * arm of the lookup — success, a different call, a failed transaction and a
 * hash outside the RPC's window — is exercised below.
 *
 * `getTransaction` is mocked; nothing here touches the network. Envelopes are
 * small hand-built stand-ins for the SDK's XDR accessors, because the public
 * functions we test only walk the handful of accessors a real envelope
 * exposes. The argument values themselves are real `ScVal`s, so the conversion
 * back to a donor address and an i128 amount is the production path.
 */

const DONOR = 'GAH3D4RM45ETE4W7VDRCWZBPRPT63CJXAGXFYVBC2FGANBZTS4OTKXCA';
const PROGRAMME = 'CD236SGR4CHW3N5WA5REW7CDLCS4ZLDEX6JVEAIHZK7NSN4W7WD7YDAL';
const OTHER_CONTRACT = 'CBJWECZ3EUVNAE73YIMT2KWWNRHRF7NNWVKOLQRVOHSKYRYE32XBRPW7';
const HASH = 'a'.repeat(64);

type FakeInvocation = {
  functionName: () => unknown;
  args: () => unknown[];
  contractAddress: () => unknown;
};

/** The `invokeContract` args of a `contribute`-shaped call. */
function invocation(
  name: string,
  args: unknown[],
  contractId = PROGRAMME,
): FakeInvocation {
  return {
    functionName: () => Buffer.from(name),
    args: () => args,
    contractAddress: () => new Address(contractId).toScAddress(),
  };
}

/** One operation whose body invokes a host function. */
function invokeOperation(
  contract: FakeInvocation | null,
  hostFunctionType = xdr.HostFunctionType.hostFunctionTypeInvokeContract().value,
): unknown {
  return {
    body: () => ({
      switch: () => ({ value: xdr.OperationType.invokeHostFunction().value }),
      invokeHostFunctionOp: () => ({
        hostFunction: () => ({
          switch: () => ({ value: hostFunctionType }),
          invokeContract: () => {
            if (!contract) throw new Error('not an invocation');
            return contract;
          },
        }),
      }),
    }),
  };
}

/** One operation that is not a contract invocation at all. */
function otherOperation(): unknown {
  return {
    body: () => ({
      switch: () => ({ value: xdr.OperationType.payment().value }),
    }),
  };
}

function v1Envelope(operations: unknown[], options: { throwing?: boolean } = {}): xdr.TransactionEnvelope {
  return {
    switch: () => ({ value: xdr.EnvelopeType.envelopeTypeTx().value }),
    v1: () => ({
      tx: () => ({
        operations: () => {
          if (options.throwing) throw new Error('unreadable envelope');
          return operations;
        },
      }),
    }),
  } as unknown as xdr.TransactionEnvelope;
}

function v0Envelope(operations: unknown[]): xdr.TransactionEnvelope {
  return {
    switch: () => ({ value: xdr.EnvelopeType.envelopeTypeTxV0().value }),
    v0: () => ({ tx: () => ({ operations: () => operations }) }),
  } as unknown as xdr.TransactionEnvelope;
}

function feeBumpEnvelope(inner: xdr.TransactionEnvelope): xdr.TransactionEnvelope {
  return {
    switch: () => ({ value: xdr.EnvelopeType.envelopeTypeTxFeeBump().value }),
    feeBump: () => ({ tx: () => ({ innerTx: () => inner }) }),
  } as unknown as xdr.TransactionEnvelope;
}

function serverReturning(response: unknown): rpc.Server {
  return {
    getTransaction: vi.fn(async () => response),
  } as unknown as rpc.Server;
}

const donorValue = new Address(DONOR).toScVal();
const amountValue = nativeToScVal(25_0000000n, { type: 'i128' });

describe('isValidTxHash', () => {
  it('accepts a 64-character hex hash in either case, with surrounding space', () => {
    expect(isValidTxHash('a'.repeat(64))).toBe(true);
    expect(isValidTxHash('A'.repeat(64))).toBe(true);
    expect(isValidTxHash(`  ${'0123456789abcdef'.repeat(4)}  `)).toBe(true);
  });

  it('rejects anything that is not 64 hex characters', () => {
    expect(isValidTxHash('')).toBe(false);
    expect(isValidTxHash('a'.repeat(63))).toBe(false);
    expect(isValidTxHash('a'.repeat(65))).toBe(false);
    expect(isValidTxHash('g'.repeat(64))).toBe(false);
    expect(isValidTxHash('0x' + 'a'.repeat(62))).toBe(false);
  });
});

describe('rpcServer', () => {
  it('builds a client for http and https endpoints', () => {
    expect(rpcServer('http://localhost:8000/soroban/rpc')).toBeInstanceOf(rpc.Server);
    expect(rpcServer('https://soroban-testnet.stellar.org')).toBeInstanceOf(rpc.Server);
  });
});

describe('lookupTransaction', () => {
  it('rebuilds the contribution from a successful transaction', async () => {
    const envelope = v1Envelope([
      otherOperation(),
      invokeOperation(invocation('contribute', [donorValue, amountValue])),
    ]);

    const result = await lookupTransaction(
      serverReturning({
        status: rpc.Api.GetTransactionStatus.SUCCESS,
        ledger: 5_123_456,
        createdAt: 1_772_712_000,
        envelopeXdr: envelope,
      }),
      HASH,
    );

    expect(result).toEqual({
      status: 'SUCCESS',
      ledger: 5_123_456,
      createdAt: 1_772_712_000,
      contribution: {
        programmeId: PROGRAMME,
        donor: DONOR,
        amount: 25_0000000n,
      },
      opCount: 2,
    });
  });

  it('reports a successful transaction that calls something else, with its operation count', async () => {
    const envelope = v1Envelope([
      invokeOperation(invocation('apply', [donorValue, amountValue])),
    ]);

    const result = await lookupTransaction(
      serverReturning({
        status: rpc.Api.GetTransactionStatus.SUCCESS,
        ledger: 42,
        createdAt: 1_772_712_001,
        envelopeXdr: envelope,
      }),
      HASH,
    );

    expect(result).toMatchObject({
      status: 'SUCCESS',
      contribution: null,
      opCount: 1,
    });
  });

  it('does not report a contribution for a contract that does not expose contribute', async () => {
    // This is the non-registry, non-programme case: a contract call that is
    // not `contribute` is not a contribution no matter which contract it is.
    const envelope = v1Envelope([
      invokeOperation(
        invocation('transfer', [donorValue, amountValue], OTHER_CONTRACT),
      ),
    ]);

    const result = await lookupTransaction(
      serverReturning({
        status: rpc.Api.GetTransactionStatus.SUCCESS,
        ledger: 77,
        createdAt: 1_772_712_002,
        envelopeXdr: envelope,
      }),
      HASH,
    );

    expect(result.status).toBe('SUCCESS');
    if (result.status === 'SUCCESS') {
      expect(result.contribution).toBeNull();
      expect(result.opCount).toBe(1);
    }
  });

  it('reports a failed transaction and no contribution', async () => {
    const result = await lookupTransaction(
      serverReturning({
        status: rpc.Api.GetTransactionStatus.FAILED,
        ledger: 5_123_457,
        createdAt: 1_772_712_003,
      }),
      HASH,
    );

    expect(result).toEqual({
      status: 'FAILED',
      ledger: 5_123_457,
      createdAt: 1_772_712_003,
    });
  });

  it('leaves createdAt null when the RPC omits it', async () => {
    const failed = await lookupTransaction(
      serverReturning({
        status: rpc.Api.GetTransactionStatus.FAILED,
        ledger: 7,
      }),
      HASH,
    );
    expect(failed).toEqual({ status: 'FAILED', ledger: 7, createdAt: null });

    const succeeded = await lookupTransaction(
      serverReturning({
        status: rpc.Api.GetTransactionStatus.SUCCESS,
        ledger: 8,
        envelopeXdr: v1Envelope([]),
      }),
      HASH,
    );
    expect(succeeded).toEqual({
      status: 'SUCCESS',
      ledger: 8,
      createdAt: null,
      contribution: null,
      opCount: 0,
    });
  });

  it('reports a hash the RPC no longer retains', async () => {
    const result = await lookupTransaction(
      serverReturning({ status: rpc.Api.GetTransactionStatus.NOT_FOUND }),
      HASH,
    );

    expect(result).toEqual({ status: 'NOT_FOUND' });
  });

  it('does not fail a successful lookup because the envelope cannot be walked', async () => {
    const result = await lookupTransaction(
      serverReturning({
        status: rpc.Api.GetTransactionStatus.SUCCESS,
        ledger: 9,
        createdAt: 1_772_712_004,
        envelopeXdr: v1Envelope([], { throwing: true }),
      }),
      HASH,
    );

    expect(result).toMatchObject({
      status: 'SUCCESS',
      contribution: null,
      opCount: 0,
    });
  });
});

describe('parseContribution', () => {
  it('reads the contribution from an envelope v0 transaction', () => {
    expect(
      parseContribution(
        v0Envelope([
          invokeOperation(invocation('contribute', [donorValue, amountValue])),
        ]),
      ),
    ).toEqual({ programmeId: PROGRAMME, donor: DONOR, amount: 25_0000000n });
  });

  it('reads through a fee-bump wrapper', () => {
    const inner = v1Envelope([
      invokeOperation(invocation('contribute', [donorValue, amountValue])),
    ]);

    expect(parseContribution(feeBumpEnvelope(inner))).toEqual({
      programmeId: PROGRAMME,
      donor: DONOR,
      amount: 25_0000000n,
    });
  });

  it('ignores envelopes it cannot walk', () => {
    const unknownVersion = {
      switch: () => ({ value: 999 }),
    } as unknown as xdr.TransactionEnvelope;
    const throwingVersion = {
      switch: () => {
        throw new Error('bad envelope');
      },
    } as unknown as xdr.TransactionEnvelope;

    expect(parseContribution(unknownVersion)).toBeNull();
    expect(parseContribution(throwingVersion)).toBeNull();
  });

  it('ignores operations that are not contract invocations', () => {
    expect(parseContribution(v1Envelope([otherOperation()]))).toBeNull();
  });

  it('ignores host functions other than invokeContract', () => {
    const createContract = xdr.HostFunctionType.hostFunctionTypeCreateContract().value;
    expect(
      parseContribution(
        v1Envelope([
          invokeOperation(
            invocation('contribute', [donorValue, amountValue]),
            createContract,
          ),
        ]),
      ),
    ).toBeNull();
  });

  it('ignores an invocation that cannot be read', () => {
    expect(parseContribution(v1Envelope([invokeOperation(null)]))).toBeNull();
  });

  it('requires exactly a donor and an amount', () => {
    expect(
      parseContribution(
        v1Envelope([
          invokeOperation(invocation('contribute', [donorValue])),
        ]),
      ),
    ).toBeNull();

    expect(
      parseContribution(
        v1Envelope([
          invokeOperation(
            invocation('contribute', [donorValue, amountValue, amountValue]),
          ),
        ]),
      ),
    ).toBeNull();
  });

  it('requires the first argument to be an address and the second an i128', () => {
    const numberValue = nativeToScVal(7, { type: 'u32' });
    const stringValue = nativeToScVal('not an amount');

    expect(
      parseContribution(
        v1Envelope([
          invokeOperation(invocation('contribute', [numberValue, amountValue])),
        ]),
      ),
    ).toBeNull();

    expect(
      parseContribution(
        v1Envelope([
          invokeOperation(invocation('contribute', [donorValue, stringValue])),
        ]),
      ),
    ).toBeNull();
  });

  it('skips a malformed call and keeps looking for a valid one', () => {
    const malformed = invocation('contribute', [
      null as unknown as xdr.ScVal,
      amountValue,
    ]);

    expect(
      parseContribution(
        v1Envelope([
          invokeOperation(malformed),
          invokeOperation(
            invocation('contribute', [donorValue, amountValue], OTHER_CONTRACT),
          ),
        ]),
      ),
    ).toEqual({
      programmeId: OTHER_CONTRACT,
      donor: DONOR,
      amount: 25_0000000n,
    });
  });

  it('skips an invocation whose contract address is not address-shaped', () => {
    const broken: FakeInvocation = {
      functionName: () => Buffer.from('contribute'),
      args: () => [donorValue, amountValue],
      contractAddress: () => {
        throw new Error('not an address');
      },
    };

    expect(parseContribution(v1Envelope([invokeOperation(broken)]))).toBeNull();
  });

  it('returns null for an empty transaction', () => {
    expect(parseContribution(v1Envelope([]))).toBeNull();
  });
});
