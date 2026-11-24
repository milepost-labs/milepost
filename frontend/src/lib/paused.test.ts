import { describe, expect, it, vi } from 'vitest';
import { forgetPaused, PAUSED_TTL_MS, readPaused, type PausedReader } from './paused';

const reader = (answers: Array<boolean | Error>, id: string): PausedReader & { calls: () => number } => {
  const is_paused = vi.fn(async () => {
    const next = answers.shift();
    if (next instanceof Error) throw next;
    return { result: next ?? false };
  });
  return { options: { contractId: id }, is_paused, calls: () => is_paused.mock.calls.length };
};

describe('readPaused', () => {
  it('shares one read between callers', async () => {
    forgetPaused();
    const client = reader([true], 'CSHARED');
    const [a, b] = await Promise.all([readPaused(client, 0, 1000), readPaused(client, 0, 1001)]);
    expect([a, b]).toEqual([true, true]);
    expect(client.calls()).toBe(1);
  });

  it('asks again after the share window, so a resume is seen', async () => {
    forgetPaused();
    const client = reader([true, false], 'CRESUME');
    expect(await readPaused(client, 0, 1000)).toBe(true);
    expect(await readPaused(client, 0, 1000 + PAUSED_TTL_MS)).toBe(false);
  });

  it('reads fresh for a newer version', async () => {
    forgetPaused();
    const client = reader([true, false], 'CVERSION');
    expect(await readPaused(client, 0, 1000)).toBe(true);
    expect(await readPaused(client, 1, 1001)).toBe(false);
  });

  it('forgets a programme the creator just paused or resumed', async () => {
    forgetPaused();
    const client = reader([false, true], 'CFORGET');
    expect(await readPaused(client, 0, 1000)).toBe(false);
    forgetPaused('CFORGET');
    expect(await readPaused(client, 0, 1001)).toBe(true);
  });

  it('does not keep a failed read', async () => {
    forgetPaused();
    const client = reader([new Error('rpc down'), true], 'CFAIL');
    await expect(readPaused(client, 0, 1000)).rejects.toThrow('rpc down');
    expect(await readPaused(client, 0, 1001)).toBe(true);
  });
});
