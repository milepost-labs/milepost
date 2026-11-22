import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { SorobanContext, type SorobanState } from '../context/sorobanStore';
import { FIXTURE_ASSET_CODE, FIXTURE_PROGRAMMES } from '../fixtures/programmes';
import { resetProgrammeAssetCache, useProgrammeAsset } from './useProgrammeAsset';

const mocks = vi.hoisted(() => ({ fetchTokenName: vi.fn() }));

vi.mock('../lib/token', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/token')>()),
  fetchTokenName: mocks.fetchTokenName,
}));

const NATIVE_TOKEN = 'CNATIVETOKENCONTRACT';
const USDC_TOKEN = 'CUSDCTOKENCONTRACT';
const ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

/** Which token each programme distributes. */
const TOKENS: Record<string, string> = {
  CPROGRAMMEA: NATIVE_TOKEN,
  CPROGRAMMEB: USDC_TOKEN,
  CPROGRAMMEC: USDC_TOKEN,
};

const getConfig = vi.fn();
const programmeAt = vi.fn((id: string) => ({ get_config: () => getConfig(id) }));

function wrapper({ children }: { children: ReactNode }) {
  const value = { programmeAt, rpcUrl: 'https://rpc.example' } as unknown as SorobanState;
  return <SorobanContext.Provider value={value}>{children}</SorobanContext.Provider>;
}

beforeEach(() => {
  resetProgrammeAssetCache();
  getConfig.mockReset();
  programmeAt.mockClear();
  mocks.fetchTokenName.mockReset();
  getConfig.mockImplementation(async (id: string) => ({
    result: { unwrap: () => ({ token: TOKENS[id] }) },
  }));
  mocks.fetchTokenName.mockImplementation(async (token: string) => ({
    result: token === NATIVE_TOKEN ? 'native' : `USDC:${ISSUER}`,
  }));
});

describe('useProgrammeAsset', () => {
  it('names a native token XLM, reading nothing until it has the token', async () => {
    const { result } = renderHook(() => useProgrammeAsset('CPROGRAMMEA'), { wrapper });

    // While reading: no unit, never a guess.
    expect(result.current).toBeNull();

    await waitFor(() => expect(result.current).toBe('XLM'));
    expect(mocks.fetchTokenName).toHaveBeenCalledWith(NATIVE_TOKEN, 'https://rpc.example', expect.any(String));
  });

  it('names a non-native asset by its own code', async () => {
    const { result } = renderHook(() => useProgrammeAsset('CPROGRAMMEB'), { wrapper });

    await waitFor(() => expect(result.current).toBe('USDC'));
    expect(result.current).not.toBe('XLM');
  });

  it('is null when the token cannot be read, never XLM', async () => {
    mocks.fetchTokenName.mockRejectedValue(new Error('rpc down'));

    const { result } = renderHook(() => useProgrammeAsset('CPROGRAMMEA'), { wrapper });

    await waitFor(() => expect(mocks.fetchTokenName).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('is null when the programme config cannot be read', async () => {
    getConfig.mockRejectedValue(new Error('not a programme'));

    const { result } = renderHook(() => useProgrammeAsset('CPROGRAMMEA'), { wrapper });

    await waitFor(() => expect(getConfig).toHaveBeenCalled());
    expect(result.current).toBeNull();
    expect(mocks.fetchTokenName).not.toHaveBeenCalled();
  });

  it('tries again after a failed read instead of remembering the failure', async () => {
    mocks.fetchTokenName.mockRejectedValueOnce(new Error('rpc down'));

    const first = renderHook(() => useProgrammeAsset('CPROGRAMMEB'), { wrapper });
    await waitFor(() => expect(mocks.fetchTokenName).toHaveBeenCalledTimes(1));
    expect(first.result.current).toBeNull();
    first.unmount();

    const second = renderHook(() => useProgrammeAsset('CPROGRAMMEB'), { wrapper });
    await waitFor(() => expect(second.result.current).toBe('USDC'));
  });

  it('reads each token name once, however many programmes and screens ask', async () => {
    const a = renderHook(() => useProgrammeAsset('CPROGRAMMEB'), { wrapper });
    const b = renderHook(() => useProgrammeAsset('CPROGRAMMEC'), { wrapper });
    await waitFor(() => expect(a.result.current).toBe('USDC'));
    await waitFor(() => expect(b.result.current).toBe('USDC'));

    // A later screen asking about the same programme reads nothing more.
    const again = renderHook(() => useProgrammeAsset('CPROGRAMMEB'), { wrapper });
    await waitFor(() => expect(again.result.current).toBe('USDC'));

    expect(mocks.fetchTokenName).toHaveBeenCalledTimes(1);
    expect(getConfig).toHaveBeenCalledTimes(2); // B and C each once
  });

  it("never shows the previous programme's asset after the programme changes", async () => {
    const { result, rerender } = renderHook(({ id }: { id: string }) => useProgrammeAsset(id), {
      wrapper,
      initialProps: { id: 'CPROGRAMMEA' },
    });
    await waitFor(() => expect(result.current).toBe('XLM'));

    // Programme B's read is slow: until it lands there is no unit, not A's.
    let release!: () => void;
    mocks.fetchTokenName.mockImplementationOnce(
      () => new Promise((resolve) => { release = () => resolve({ result: `USDC:${ISSUER}` }); }),
    );
    rerender({ id: 'CPROGRAMMEB' });
    expect(result.current).toBeNull();

    await waitFor(() => expect(release).toBeTypeOf('function'));
    release();
    await waitFor(() => expect(result.current).toBe('USDC'));
  });

  it('gives a sample programme its stand-in asset without reading anything', () => {
    const { result } = renderHook(() => useProgrammeAsset(FIXTURE_PROGRAMMES[0].id), { wrapper });

    expect(result.current).toBe(FIXTURE_ASSET_CODE);
    expect(programmeAt).not.toHaveBeenCalled();
    expect(mocks.fetchTokenName).not.toHaveBeenCalled();
  });

  it('reads nothing without a programme or without a provider', () => {
    const none = renderHook(() => useProgrammeAsset(null), { wrapper });
    expect(none.result.current).toBeNull();

    const bare = renderHook(() => useProgrammeAsset('CPROGRAMMEA'));
    expect(bare.result.current).toBeNull();

    expect(mocks.fetchTokenName).not.toHaveBeenCalled();
  });
});
