import { describe, expect, it, vi } from 'vitest';
import { SorobanDataBuilder, rpc } from '@stellar/stellar-sdk';
import { restoreFromAssembled, restoreOf } from './restore';

const preamble = { minResourceFee: '4900', transactionData: new SorobanDataBuilder() };
const restoreSimulation = {
  id: '1',
  latestLedger: 10,
  events: [],
  _parsed: true,
  transactionData: new SorobanDataBuilder(),
  minResourceFee: '100',
  cost: { cpuInsns: '0', memBytes: '0' },
  result: undefined,
  restorePreamble: preamble,
} as unknown as rpc.Api.SimulateTransactionResponse;
const { restorePreamble: _unused, ...plain } = restoreSimulation as unknown as Record<string, unknown>;
void _unused;
const plainSimulation = plain as unknown as rpc.Api.SimulateTransactionResponse;

function assembled(simulation: rpc.Api.SimulateTransactionResponse, status = rpc.Api.GetTransactionStatus.SUCCESS) {
  return {
    simulation,
    options: {} as { signTransaction?: unknown },
    restoreFootprint: vi.fn(async () => ({ status }) as rpc.Api.GetTransactionResponse),
  };
}

describe('restore before a write', () => {
  it('reads the restore and its fee from the simulation', () => {
    const step = restoreFromAssembled(assembled(restoreSimulation));

    expect(step?.feeStroops).toBe(5_000n);
  });

  it('needs nothing when the simulation asks for no restore, or there is no simulation', () => {
    expect(restoreFromAssembled(assembled(plainSimulation))).toBeNull();
    expect(restoreFromAssembled({ signAndSend: vi.fn() })).toBeNull();
    expect(restoreFromAssembled(null)).toBeNull();
  });

  it('restores with the wallet\'s signer', async () => {
    const tx = assembled(restoreSimulation);
    const sign = vi.fn();

    await restoreFromAssembled(tx)!.run(sign);

    expect(tx.options.signTransaction).toBe(sign);
    expect(tx.restoreFootprint).toHaveBeenCalledWith(preamble);
  });

  it('fails when the restore does not land', async () => {
    const tx = assembled(restoreSimulation, rpc.Api.GetTransactionStatus.FAILED);

    await expect(restoreFromAssembled(tx)!.run(vi.fn())).rejects.toThrow(/did not go through/);
  });

  it('takes the restore a wrapper names over its own check', () => {
    const step = { feeStroops: 1n, run: vi.fn() };

    expect(restoreOf({ signAndSend: vi.fn(), restore: step })).toBe(step);
    expect(restoreOf({ signAndSend: vi.fn(), restore: null })).toBeNull();
    expect(restoreOf(assembled(restoreSimulation))?.feeStroops).toBe(5_000n);
  });
});
