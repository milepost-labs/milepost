import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Buffer } from 'buffer';
import {
  sessionRead,
  readProgrammeChain,
  readContribution,
  readAward,
  readRegistryProgrammes,
  type ProgrammeClientFactory,
} from './programmeReads';
import type { Client as Programme } from '@milepost/program';
import type { Client as Registry } from '@milepost/registry';

/** Helper to create controllable promises resolved or rejected by hand */
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('programmeReads', () => {
  let uniqueKeyCounter = 0;
  const nextKey = () => `test-key-${Date.now()}-${++uniqueKeyCounter}`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('concurrency limit and queuing', () => {
    it('never exceeds the MAX_CONCURRENT (4) limit when running more items than the limit', async () => {
      let inFlight = 0;
      let peakInFlight = 0;
      const count = 10;
      const defs = Array.from({ length: count }, () => deferred<number>());

      const promises = defs.map((d) =>
        sessionRead(nextKey(), async () => {
          inFlight += 1;
          peakInFlight = Math.max(peakInFlight, inFlight);
          const val = await d.promise;
          inFlight -= 1;
          return val;
        }),
      );

      // Yield event loop to let first wave enter admitted()
      await new Promise((r) => setTimeout(r, 0));

      expect(inFlight).toBe(4);
      expect(peakInFlight).toBe(4);

      // Resolve the first 4 tasks
      for (let i = 0; i < 4; i++) {
        defs[i].resolve(i);
      }

      await new Promise((r) => setTimeout(r, 0));

      // As slots free up, subsequent tasks are admitted up to cap of 4
      expect(peakInFlight).toBe(4);

      // Resolve the rest
      for (let i = 4; i < count; i++) {
        defs[i].resolve(i);
      }

      const results = await Promise.all(promises);
      expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(peakInFlight).toBe(4);
      expect(inFlight).toBe(0);
    });

    it('handles exactly the concurrency limit (4 items)', async () => {
      let inFlight = 0;
      let peakInFlight = 0;
      const defs = Array.from({ length: 4 }, () => deferred<string>());

      const promises = defs.map((d) =>
        sessionRead(nextKey(), async () => {
          inFlight += 1;
          peakInFlight = Math.max(peakInFlight, inFlight);
          const res = await d.promise;
          inFlight -= 1;
          return res;
        }),
      );

      await new Promise((r) => setTimeout(r, 0));
      expect(inFlight).toBe(4);
      expect(peakInFlight).toBe(4);

      defs.forEach((d, i) => d.resolve(`val-${i}`));
      const results = await Promise.all(promises);
      expect(results).toEqual(['val-0', 'val-1', 'val-2', 'val-3']);
      expect(peakInFlight).toBe(4);
    });

    it('handles fewer items than the concurrency limit (2 items)', async () => {
      let inFlight = 0;
      let peakInFlight = 0;
      const defs = Array.from({ length: 2 }, () => deferred<string>());

      const promises = defs.map((d) =>
        sessionRead(nextKey(), async () => {
          inFlight += 1;
          peakInFlight = Math.max(peakInFlight, inFlight);
          const res = await d.promise;
          inFlight -= 1;
          return res;
        }),
      );

      await new Promise((r) => setTimeout(r, 0));
      expect(inFlight).toBe(2);
      expect(peakInFlight).toBe(2);

      defs.forEach((d, i) => d.resolve(`val-${i}`));
      const results = await Promise.all(promises);
      expect(results).toEqual(['val-0', 'val-1']);
      expect(peakInFlight).toBe(2);
    });

    it('handles zero items without error', async () => {
      const results = await Promise.all([]);
      expect(results).toEqual([]);
    });

    it('releases concurrency slot immediately after a failure so later items are not stuck', async () => {
      let inFlight = 0;
      let peakInFlight = 0;
      const defs = Array.from({ length: 6 }, () => deferred<string>());

      const promises = defs.map((d) =>
        sessionRead(nextKey(), async () => {
          inFlight += 1;
          peakInFlight = Math.max(peakInFlight, inFlight);
          try {
            return await d.promise;
          } finally {
            inFlight -= 1;
          }
        }),
      );
      // Settled up front: task 0 rejects during the waits below, before the
      // assertion further down, and an unhandled rejection fails the whole run.
      const firstOutcome = promises[0].then(
        () => null,
        (error: unknown) => error,
      );

      await new Promise((r) => setTimeout(r, 0));
      expect(inFlight).toBe(4);

      // Fail task 0
      defs[0].reject(new Error('Simulated failure in slot 0'));

      await new Promise((r) => setTimeout(r, 0));

      // Task 4 should now have been admitted into the freed slot
      expect(inFlight).toBe(4);
      expect(peakInFlight).toBe(4);

      // Resolve remaining
      for (let i = 1; i < 6; i++) {
        defs[i].resolve(`success-${i}`);
      }

      expect(((await firstOutcome) as Error).message).toBe('Simulated failure in slot 0');
      const successfulResults = await Promise.all(promises.slice(1));
      expect(successfulResults).toEqual([
        'success-1',
        'success-2',
        'success-3',
        'success-4',
        'success-5',
      ]);
      expect(inFlight).toBe(0);
    });
  });

  describe('ordering and failure isolation', () => {
    it('returns results in the same order as inputs even when later reads finish first', async () => {
      const defA = deferred<string>();
      const defB = deferred<string>();
      const defC = deferred<string>();

      const promiseA = sessionRead(nextKey(), () => defA.promise);
      const promiseB = sessionRead(nextKey(), () => defB.promise);
      const promiseC = sessionRead(nextKey(), () => defC.promise);

      // Resolve in reverse order: C, then B, then A
      defC.resolve('result-C');
      defB.resolve('result-B');
      defA.resolve('result-A');

      const all = await Promise.all([promiseA, promiseB, promiseC]);
      expect(all).toEqual(['result-A', 'result-B', 'result-C']);
    });

    it('ensures one failure does not fail other concurrent reads', async () => {
      const def1 = deferred<string>();
      const def2 = deferred<string>();
      const def3 = deferred<string>();

      const p1 = sessionRead(nextKey(), () => def1.promise);
      const p2 = sessionRead(nextKey(), () => def2.promise);
      const p3 = sessionRead(nextKey(), () => def3.promise);

      def1.resolve('first-ok');
      def2.reject(new Error('second-failed'));
      def3.resolve('third-ok');

      const settledResults = await Promise.allSettled([p1, p2, p3]);
      expect(settledResults[0]).toEqual({ status: 'fulfilled', value: 'first-ok' });
      expect(settledResults[1].status).toBe('rejected');
      if (settledResults[1].status === 'rejected') {
        expect((settledResults[1].reason as Error).message).toBe('second-failed');
      }
      expect(settledResults[2]).toEqual({ status: 'fulfilled', value: 'third-ok' });
    });
  });

  describe('retry and caching behavior', () => {
    it('shares a single in-flight promise for concurrent reads with the same key', async () => {
      const key = nextKey();
      let callCount = 0;
      const def = deferred<string>();

      const p1 = sessionRead(key, () => {
        callCount++;
        return def.promise;
      });
      const p2 = sessionRead(key, () => {
        callCount++;
        return def.promise;
      });

      // The read starts once the limiter admits it, a tick later.
      await vi.waitFor(() => expect(callCount).toBe(1));
      def.resolve('shared-result');

      const [res1, res2] = await Promise.all([p1, p2]);
      expect(res1).toBe('shared-result');
      expect(res2).toBe('shared-result');
      expect(callCount).toBe(1);
    });

    it('removes failed key from session cache allowing subsequent retry to succeed', async () => {
      const key = nextKey();
      let attempts = 0;

      const runTask = async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error('Temporary RPC rate limit');
        }
        return 'recovered-value';
      };

      // First attempt fails
      await expect(sessionRead(key, runTask)).rejects.toThrow('Temporary RPC rate limit');
      expect(attempts).toBe(1);

      // Retry attempt with same key succeeds because failed key was removed from settled cache
      const retryResult = await sessionRead(key, runTask);
      expect(retryResult).toBe('recovered-value');
      expect(attempts).toBe(2);
    });

    it('surfaces exhausted failures to the caller on persistent failure', async () => {
      const key = nextKey();
      let attempts = 0;

      const runAlwaysFails = async () => {
        attempts++;
        throw new Error(`Persistent failure attempt ${attempts}`);
      };

      await expect(sessionRead(key, runAlwaysFails)).rejects.toThrow('Persistent failure attempt 1');
      await expect(sessionRead(key, runAlwaysFails)).rejects.toThrow('Persistent failure attempt 2');
      expect(attempts).toBe(2);
    });
  });

  describe('readProgrammeChain', () => {
    const programmeId = 'CBQ4SCHOOLBURSARY2026XK3ZP7M2QWJ5T8VN4RD6HY';

    it('reads all fields successfully on healthy programme', async () => {
      const mockClient = {
        get_phase: vi.fn().mockResolvedValue({
          result: { unwrap: () => ({ tag: 'Open' }) },
        }),
        budget: vi.fn().mockResolvedValue({
          result: { unwrap: () => 1_000_000_000n },
        }),
        total_contributed: vi.fn().mockResolvedValue({ result: 1_200_000_000n }),
        total_granted: vi.fn().mockResolvedValue({ result: 800_000_000n }),
        total_released: vi.fn().mockResolvedValue({ result: 400_000_000n }),
        total_refunded: vi.fn().mockResolvedValue({ result: 0n }),
        get_config: vi.fn().mockResolvedValue({
          result: {
            // Shaped like the contract's ProgrammeConfig: u32 fields are numbers.
            unwrap: () => ({
              fee_bps: 200,
              quorum: 3,
              apply_deadline: 1_800_000_000n,
              metadata_hash: Buffer.alloc(32, 0xab),
            }),
          },
        }),
      } as unknown as Programme;

      const factory: ProgrammeClientFactory = () => mockClient;
      const data = await readProgrammeChain(`test-healthy-${programmeId}`, factory);

      expect(data.phase).toBe('Open');
      expect(data.budget).toBe(1_000_000_000n);
      expect(data.contributed).toBe(1_200_000_000n);
      expect(data.granted).toBe(800_000_000n);
      expect(data.released).toBe(400_000_000n);
      expect(data.refunded).toBe(0n);
      expect(data.feeBps).toBe(200);
      expect(data.quorum).toBe(3);
      expect(data.applyDeadline).toBe(1_800_000_000n);
      expect(data.metadataHash).toBe('ab'.repeat(32));
    });

    it('degrades optional totals and config to nulls when their calls fail', async () => {
      const mockClient = {
        get_phase: vi.fn().mockResolvedValue({
          result: { unwrap: () => ({ tag: 'Review' }) },
        }),
        budget: vi.fn().mockResolvedValue({
          result: { unwrap: () => 500_000_000n },
        }),
        total_contributed: vi.fn().mockRejectedValue(new Error('RPC rate limit')),
        total_granted: vi.fn().mockRejectedValue(new Error('RPC rate limit')),
        total_released: vi.fn().mockRejectedValue(new Error('RPC rate limit')),
        total_refunded: vi.fn().mockRejectedValue(new Error('RPC rate limit')),
        get_config: vi.fn().mockRejectedValue(new Error('RPC rate limit')),
      } as unknown as Programme;

      const factory: ProgrammeClientFactory = () => mockClient;
      const data = await readProgrammeChain(`test-degraded-${programmeId}`, factory);

      expect(data.phase).toBe('Review');
      expect(data.budget).toBe(500_000_000n);
      expect(data.contributed).toBeNull();
      expect(data.granted).toBeNull();
      expect(data.released).toBeNull();
      expect(data.refunded).toBeNull();
      expect(data.feeBps).toBeNull();
      expect(data.quorum).toBeNull();
      expect(data.applyDeadline).toBeNull();
    });

    it('fails the whole read when get_phase fails', async () => {
      const mockClient = {
        get_phase: vi.fn().mockRejectedValue(new Error('Network down')),
        budget: vi.fn().mockResolvedValue({ result: { unwrap: () => 100n } }),
      } as unknown as Programme;

      const factory: ProgrammeClientFactory = () => mockClient;
      await expect(readProgrammeChain(`test-fail-phase-${programmeId}`, factory)).rejects.toThrow(
        'Network down',
      );
    });

    it('fails the whole read when get_phase answers an unknown phase tag', async () => {
      const mockClient = {
        get_phase: vi.fn().mockResolvedValue({
          result: { unwrap: () => ({ tag: 'UnrecognizedPhase' }) },
        }),
        budget: vi.fn().mockResolvedValue({ result: { unwrap: () => 100n } }),
      } as unknown as Programme;

      const factory: ProgrammeClientFactory = () => mockClient;
      await expect(readProgrammeChain(`test-unknown-phase-${programmeId}`, factory)).rejects.toThrow(
        'The contract answered an unknown phase: UnrecognizedPhase',
      );
    });

    it('fails the whole read when budget fails', async () => {
      const mockClient = {
        get_phase: vi.fn().mockResolvedValue({
          result: { unwrap: () => ({ tag: 'Open' }) },
        }),
        budget: vi.fn().mockRejectedValue(new Error('Budget simulation error')),
      } as unknown as Programme;

      const factory: ProgrammeClientFactory = () => mockClient;
      await expect(readProgrammeChain(`test-fail-budget-${programmeId}`, factory)).rejects.toThrow(
        'Budget simulation error',
      );
    });
  });

  describe('readContribution', () => {
    it('returns the contributed amount in stroops', async () => {
      const mockClient = {
        contributed_by: vi.fn().mockResolvedValue({ result: 250_000_000n }),
      } as unknown as Programme;

      const res = await readContribution('prog-1', 'G_DONOR', () => mockClient);
      expect(res).toBe(250_000_000n);
    });
  });

  describe('readAward', () => {
    it('returns formatted award with BigInt amounts when present', async () => {
      const mockClient = {
        get_award: vi.fn().mockResolvedValue({
          result: {
            unwrap: () => ({
              recipient: 'G_RECIP',
              granted: '1000',
              released: '250',
            }),
          },
        }),
      } as unknown as Programme;

      const award = await readAward('prog-1', 'G_RECIP', () => mockClient);
      expect(award).not.toBeNull();
      expect(award!.recipient).toBe('G_RECIP');
      expect(award!.granted).toBe(1000n);
      expect(award!.released).toBe(250n);
    });

    it('returns null when get_award throws or rejects (AwardNotFound)', async () => {
      const mockClient = {
        get_award: vi.fn().mockRejectedValue(new Error('AwardNotFound (20)')),
      } as unknown as Programme;

      const award = await readAward('prog-1', 'G_UNKNOWN', () => mockClient);
      expect(award).toBeNull();
    });
  });

  describe('readRegistryProgrammes', () => {
    it('walks nonce, derives addresses, and filters confirmed programmes', async () => {
      const mockRegistry = {
        nonce: vi.fn().mockResolvedValue({ result: 3n }),
        programme_address: vi.fn().mockImplementation(({ n }: { n: bigint }) => {
          return Promise.resolve({ result: `C_ADDR_${n.toString()}` });
        }),
        is_programme: vi.fn().mockImplementation(({ addr }: { addr: string }) => {
          // addr 0 and 2 are valid, 1 is not
          return Promise.resolve({ result: addr !== 'C_ADDR_1' });
        }),
      } as unknown as Registry;

      const addresses = await readRegistryProgrammes(mockRegistry);
      expect(addresses).toEqual(['C_ADDR_0', 'C_ADDR_2']);
      expect(mockRegistry.programme_address).toHaveBeenCalledTimes(3);
      expect(mockRegistry.is_programme).toHaveBeenCalledTimes(3);
    });
  });
});
