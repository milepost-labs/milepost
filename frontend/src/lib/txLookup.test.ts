/**
 * Unit and integration tests for transaction lookup and receipt reconstruction (Issue #633).
 *
 * NOTE ON FIXTURES:
 * As documented in src/test/txFixtures.ts, the repository does not contain recorded
 * testnet XDR captures. All fixtures used below are SDK-constructed using fixed test keys
 * and labeled accordingly. A mocked RPC server is used so no tests touch the live network.
 */
import { describe, it, expect, vi } from 'vitest';
import { Address, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import {
  isValidTxHash,
  lookupTransaction,
  parseContribution,
  parseRefund,
  rpcServer,
} from './txLookup';
import {
  FIXTURE_PROGRAMME_ID,
  FIXTURE_DONOR_ADDRESS,
  FIXTURE_VALID_TX_HASH,
  toI128,
  buildContributionEnvelope,
  buildRefundEnvelope,
  buildRefundPartialEnvelope,
  buildOtherContractCallEnvelope,
  buildNonContractOpEnvelope,
  buildFeeBumpEnvelope,
  buildV0Envelope,
  buildUploadWasmEnvelope,
} from '../test/txFixtures';

const PROGRAMME = FIXTURE_PROGRAMME_ID;
const DONOR = FIXTURE_DONOR_ADDRESS;
const donorScVal = new Address(DONOR).toScVal();

// ---------------------------------------------------------------------------
// isValidTxHash — validation and malformed hash rejection
// ---------------------------------------------------------------------------
describe('isValidTxHash', () => {
  it('accepts valid 64-character lowercase hex hashes', () => {
    expect(isValidTxHash('a'.repeat(64))).toBe(true);
    expect(isValidTxHash(FIXTURE_VALID_TX_HASH)).toBe(true);
  });

  it('accepts valid 64-character uppercase and mixed-case hex hashes', () => {
    expect(isValidTxHash('A'.repeat(64))).toBe(true);
    expect(isValidTxHash('0123456789ABCDEF'.repeat(2) + '0123456789abcdef'.repeat(2))).toBe(true);
  });

  it('accepts hashes with leading or trailing whitespace (trimmed)', () => {
    expect(isValidTxHash(`  ${FIXTURE_VALID_TX_HASH}  `)).toBe(true);
  });

  it('rejects malformed hashes before any network call', () => {
    // Too short (< 64 chars)
    expect(isValidTxHash('0123456789abcdef')).toBe(false);
    expect(isValidTxHash('a'.repeat(63))).toBe(false);

    // Too long (> 64 chars)
    expect(isValidTxHash('a'.repeat(65))).toBe(false);

    // Non-hex characters
    expect(isValidTxHash('g'.repeat(64))).toBe(false);
    expect(isValidTxHash('0123456789abcdef0123456789abcdef0123456789abcdef0123456789zzzzzz')).toBe(false);

    // Empty and whitespace only
    expect(isValidTxHash('')).toBe(false);
    expect(isValidTxHash('   ')).toBe(false);
  });

  it('ensures callers can reject malformed hashes without querying the RPC', async () => {
    const mockServer = {
      getTransaction: vi.fn(),
    };

    const invalidHash = 'malformed-hash-123';
    if (!isValidTxHash(invalidHash)) {
      // Caller refuses to query RPC
    } else {
      await lookupTransaction(mockServer as never, invalidHash);
    }

    expect(mockServer.getTransaction).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// parseContribution — unit tests
// ---------------------------------------------------------------------------
describe('parseContribution', () => {
  it('parses a contribute(donor, amount) transaction envelope correctly', () => {
    // SDK-constructed contribution envelope
    const envelope = buildContributionEnvelope(PROGRAMME, DONOR, 250_000_000n);

    const result = parseContribution(envelope);
    expect(result).not.toBeNull();
    expect(result!.programmeId).toBe(PROGRAMME);
    expect(result!.donor).toBe(DONOR);
    expect(result!.amount).toBe(250_000_000n);
  });

  it('returns null for a refund transaction', () => {
    const envelope = buildRefundEnvelope(PROGRAMME, DONOR);
    expect(parseContribution(envelope)).toBeNull();
  });

  it('returns null for a transaction calling another contract method', () => {
    const envelope = buildOtherContractCallEnvelope(PROGRAMME, 'apply', []);
    expect(parseContribution(envelope)).toBeNull();
  });

  it('returns null for non-contract operations (e.g. payment)', () => {
    const envelope = buildNonContractOpEnvelope();
    expect(parseContribution(envelope)).toBeNull();
  });

  it('returns null for host function operations that are not invokeContract', () => {
    const envelope = buildUploadWasmEnvelope();
    expect(parseContribution(envelope)).toBeNull();
  });

  it('returns null if contribute arguments are missing or malformed', () => {
    // Calling contribute with only 1 arg
    const envelopeWrongArgs = buildOtherContractCallEnvelope(PROGRAMME, 'contribute', [donorScVal]);
    expect(parseContribution(envelopeWrongArgs)).toBeNull();

    // Calling contribute with non-bigint amount (e.g. symbol)
    const envelopeSymbolArg = buildOtherContractCallEnvelope(PROGRAMME, 'contribute', [
      donorScVal,
      nativeToScVal('not-an-amount', { type: 'symbol' }),
    ]);
    expect(parseContribution(envelopeSymbolArg)).toBeNull();
  });

  it('parses a legacy V0 transaction envelope calling contribute', () => {
    const envelopeV0 = buildV0Envelope(PROGRAMME, 'contribute', [donorScVal, toI128(150_000_000n)]);
    const result = parseContribution(envelopeV0);
    expect(result).not.toBeNull();
    expect(result!.programmeId).toBe(PROGRAMME);
    expect(result!.donor).toBe(DONOR);
    expect(result!.amount).toBe(150_000_000n);
  });
});

// ---------------------------------------------------------------------------
// parseRefund — unit tests
// ---------------------------------------------------------------------------
describe('parseRefund', () => {
  it('parses a full refund(donor) and reads the amount from returnValue', () => {
    const envelope = buildRefundEnvelope(PROGRAMME, DONOR);
    const returnValue = toI128(180_000_000n); // 18 XLM

    const result = parseRefund(envelope, returnValue);

    expect(result).not.toBeNull();
    expect(result!.programmeId).toBe(PROGRAMME);
    expect(result!.donor).toBe(DONOR);
    expect(result!.amount).toBe(180_000_000n);
    expect(result!.partial).toBe(false);
  });

  it('parses a refund_partial(donor, amount) and sets partial = true', () => {
    const envelope = buildRefundPartialEnvelope(PROGRAMME, DONOR, 50_000_000n);
    const returnValue = toI128(50_000_000n); // 5 XLM returned

    const result = parseRefund(envelope, returnValue);

    expect(result).not.toBeNull();
    expect(result!.donor).toBe(DONOR);
    expect(result!.amount).toBe(50_000_000n);
    expect(result!.partial).toBe(true);
  });

  it('returns null for a contribute transaction', () => {
    const envelope = buildContributionEnvelope(PROGRAMME, DONOR, 100_000_000n);
    expect(parseRefund(envelope, toI128(100_000_000n))).toBeNull();
  });

  it('returns null when returnValue is absent', () => {
    const envelope = buildRefundEnvelope(PROGRAMME, DONOR);
    expect(parseRefund(envelope, undefined)).toBeNull();
  });

  it('returns null when the returned amount is zero or negative', () => {
    const envelope = buildRefundEnvelope(PROGRAMME, DONOR);
    expect(parseRefund(envelope, toI128(0n))).toBeNull();
    expect(parseRefund(envelope, toI128(-50_000n))).toBeNull();
  });

  it('returns null for non-contract operations', () => {
    const envelope = buildNonContractOpEnvelope();
    expect(parseRefund(envelope, toI128(100_000_000n))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// lookupTransaction — full coverage across all transaction states
// ---------------------------------------------------------------------------
describe('lookupTransaction', () => {
  const BASE_RESPONSE = {
    ledger: 5_000_000,
    createdAt: 1_790_000_000,
  };

  it('case 1: successful contribution recovers full receipt details', async () => {
    // SDK-constructed contribution envelope
    const envelope = buildContributionEnvelope(PROGRAMME, DONOR, 350_000_000n);

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

    const result = await lookupTransaction(mockServer as never, FIXTURE_VALID_TX_HASH);

    expect(result.status).toBe('SUCCESS');
    if (result.status !== 'SUCCESS') return;

    expect(result.ledger).toBe(5_000_000);
    expect(result.createdAt).toBe(1_790_000_000);
    expect(result.opCount).toBe(1);

    // Contribution receipt verification
    expect(result.contribution).not.toBeNull();
    expect(result.contribution!.programmeId).toBe(PROGRAMME);
    expect(result.contribution!.donor).toBe(DONOR);
    expect(result.contribution!.amount).toBe(350_000_000n);

    // Refund is null on a contribution
    expect(result.refund).toBeNull();
  });

  it('case 2: failed transaction returns FAILED status and ledger without receipt', async () => {
    const mockServer = {
      getTransaction: vi.fn().mockResolvedValue({
        status: 'FAILED',
        ledger: 5_000_123,
        createdAt: 1_790_000_050,
      }),
    };

    const result = await lookupTransaction(mockServer as never, FIXTURE_VALID_TX_HASH);

    expect(result.status).toBe('FAILED');
    if (result.status !== 'FAILED') return;

    expect(result.ledger).toBe(5_000_123);
    expect(result.createdAt).toBe(1_790_000_050);
  });

  it('case 3: transaction hash outside RPC retention window returns NOT_FOUND', async () => {
    const mockServer = {
      getTransaction: vi.fn().mockResolvedValue({
        status: 'NOT_FOUND',
      }),
    };

    const result = await lookupTransaction(mockServer as never, FIXTURE_VALID_TX_HASH);
    expect(result.status).toBe('NOT_FOUND');
  });

  it('case 4: fee-bump envelope unwraps inner transaction to decode contribution', async () => {
    // SDK-constructed fee-bump wrapping a contribution
    const innerEnvelope = buildContributionEnvelope(PROGRAMME, DONOR, 120_000_000n);
    const feeBumpEnvelope = buildFeeBumpEnvelope(innerEnvelope);

    const mockServer = {
      getTransaction: vi.fn().mockResolvedValue({
        status: 'SUCCESS',
        ...BASE_RESPONSE,
        envelopeXdr: feeBumpEnvelope,
        returnValue: undefined,
        resultXdr: {} as xdr.TransactionResult,
        resultMetaXdr: {} as xdr.TransactionMeta,
      }),
    };

    const result = await lookupTransaction(mockServer as never, FIXTURE_VALID_TX_HASH);

    expect(result.status).toBe('SUCCESS');
    if (result.status !== 'SUCCESS') return;

    expect(result.contribution).not.toBeNull();
    expect(result.contribution!.programmeId).toBe(PROGRAMME);
    expect(result.contribution!.donor).toBe(DONOR);
    expect(result.contribution!.amount).toBe(120_000_000n);
    expect(result.refund).toBeNull();
  });

  it('case 4b: fee-bump envelope unwraps inner transaction to decode refund', async () => {
    const innerEnvelope = buildRefundEnvelope(PROGRAMME, DONOR);
    const feeBumpEnvelope = buildFeeBumpEnvelope(innerEnvelope);
    const returnValue = toI128(75_000_000n);

    const mockServer = {
      getTransaction: vi.fn().mockResolvedValue({
        status: 'SUCCESS',
        ...BASE_RESPONSE,
        envelopeXdr: feeBumpEnvelope,
        returnValue,
        resultXdr: {} as xdr.TransactionResult,
        resultMetaXdr: {} as xdr.TransactionMeta,
      }),
    };

    const result = await lookupTransaction(mockServer as never, FIXTURE_VALID_TX_HASH);

    expect(result.status).toBe('SUCCESS');
    if (result.status !== 'SUCCESS') return;

    expect(result.refund).not.toBeNull();
    expect(result.refund!.amount).toBe(75_000_000n);
    expect(result.refund!.donor).toBe(DONOR);
    expect(result.contribution).toBeNull();
  });

  it('case 5: transaction that calls something other than contribute returns null contribution', async () => {
    // Calling 'vote' or 'apply' instead of 'contribute'
    const envelope = buildOtherContractCallEnvelope(PROGRAMME, 'apply', []);

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

    const result = await lookupTransaction(mockServer as never, FIXTURE_VALID_TX_HASH);

    expect(result.status).toBe('SUCCESS');
    if (result.status !== 'SUCCESS') return;

    expect(result.contribution).toBeNull();
    expect(result.refund).toBeNull();
    expect(result.opCount).toBe(1);
  });

  it('case 5b: transaction with non-contract operation leaves contribution and refund null', async () => {
    const envelope = buildNonContractOpEnvelope();

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

    const result = await lookupTransaction(mockServer as never, FIXTURE_VALID_TX_HASH);

    expect(result.status).toBe('SUCCESS');
    if (result.status !== 'SUCCESS') return;

    expect(result.contribution).toBeNull();
    expect(result.refund).toBeNull();
  });

  it('handles null createdAt timestamps gracefully in both SUCCESS and FAILED states', async () => {
    const envelope = buildContributionEnvelope(PROGRAMME, DONOR, 100_000_000n);

    const mockSuccessServer = {
      getTransaction: vi.fn().mockResolvedValue({
        status: 'SUCCESS',
        ledger: 5_000_000,
        createdAt: undefined, // Non-number
        envelopeXdr: envelope,
        returnValue: undefined,
        resultXdr: {} as xdr.TransactionResult,
        resultMetaXdr: {} as xdr.TransactionMeta,
      }),
    };

    const successResult = await lookupTransaction(mockSuccessServer as never, FIXTURE_VALID_TX_HASH);
    if (successResult.status === 'SUCCESS') {
      expect(successResult.createdAt).toBeNull();
    }

    const mockFailedServer = {
      getTransaction: vi.fn().mockResolvedValue({
        status: 'FAILED',
        ledger: 5_000_000,
        createdAt: null,
      }),
    };

    const failedResult = await lookupTransaction(mockFailedServer as never, FIXTURE_VALID_TX_HASH);
    if (failedResult.status === 'FAILED') {
      expect(failedResult.createdAt).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// rpcServer — factory helper tests
// ---------------------------------------------------------------------------
describe('rpcServer', () => {
  it('constructs an rpc.Server allowing HTTP for http:// URLs', () => {
    const server = rpcServer('http://localhost:8000/soroban/rpc');
    expect(server).toBeDefined();
  });

  it('constructs an rpc.Server for https:// URLs', () => {
    const server = rpcServer('https://soroban-testnet.stellar.org');
    expect(server).toBeDefined();
  });
});
