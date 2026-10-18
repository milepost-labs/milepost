import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { FIXTURE_BALANCE } from '../fixtures/funding';
import { chainFor } from '../fixtures/programmes';
import type { DirectoryProgramme } from '../lib/programmeView';
import { useProgrammeBalance } from './useProgrammeBalance';

const mocks = vi.hoisted(() => ({ queryContract: vi.fn(), getConfig: vi.fn() }));

// The balance is read through an RPC server; only its contract query matters here.
vi.mock('@milepost/program', () => ({
  rpc: {
    Server: class {
      queryContract = mocks.queryContract;
    },
  },
}));

vi.mock('../context/useWallet', () => ({
  useWallet: () => ({ address: 'GDONOR', status: 'connected' }),
}));

vi.mock('../context/useSoroban', () => ({
  useSoroban: () => ({
    rpcUrl: 'https://rpc.testnet.stellar.org',
    programmeAt: () => ({ get_config: mocks.getConfig }),
  }),
}));

const TOKEN = 'CTOKENCONTRACTFORTHEPROGRAMMEASSETAAAAAAAAAAAAAAAAAAAAA';
const PROGRAMME = 'CPROGRAMMECONTRACTIDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

const programme: DirectoryProgramme = {
  id: PROGRAMME,
  name: 'Real programme',
  creator: null,
  createdLedger: 1,
  sample: false,
  chain: { ...chainFor(PROGRAMME), phase: 'Open' },
};

const sample: DirectoryProgramme = { ...programme, id: 'sample-1', sample: true };

/** `get_config` returns a `Result`; the hook unwraps it. */
const config = { result: { unwrap: () => ({ token: TOKEN }) } };

describe('useProgrammeBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConfig.mockResolvedValue(config);
    mocks.queryContract.mockResolvedValue({ result: 52_500_000_000n });
  });

  it('reads balance(address) on the programme token contract', async () => {
    const { result } = renderHook(() => useProgrammeBalance(programme));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.balance).toBe(52_500_000_000n);
    expect(mocks.queryContract).toHaveBeenCalledWith(TOKEN, 'balance', { id: 'GDONOR' });
  });

  it('says the balance is unavailable, not zero, when the read fails', async () => {
    mocks.queryContract.mockRejectedValue(new Error('host error'));

    const { result } = renderHook(() => useProgrammeBalance(programme));

    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.balance).toBeNull();
  });

  it('refetches the balance after a contribution', async () => {
    const { result } = renderHook(() => useProgrammeBalance(programme));
    await waitFor(() => expect(result.current.balance).toBe(52_500_000_000n));

    mocks.queryContract.mockResolvedValue({ result: 51_500_000_000n });
    act(() => {
      window.dispatchEvent(new Event('milepost:transaction-success'));
    });

    await waitFor(() => expect(result.current.balance).toBe(51_500_000_000n));
  });

  it('uses the stand-in balance for a sample programme, with no chain read', () => {
    const { result } = renderHook(() => useProgrammeBalance(sample));

    expect(result.current.status).toBe('ready');
    expect(result.current.balance).toBe(BigInt(FIXTURE_BALANCE));
    expect(mocks.getConfig).not.toHaveBeenCalled();
    expect(mocks.queryContract).not.toHaveBeenCalled();
  });

  it('has nothing to read without a chosen programme', () => {
    const { result } = renderHook(() => useProgrammeBalance(null));

    expect(result.current.status).toBe('idle');
    expect(result.current.balance).toBeNull();
  });
});
