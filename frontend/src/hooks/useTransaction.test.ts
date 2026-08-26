import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTransaction } from './useTransaction';
import type { WalletState } from '../context/walletStore';

/**
 * The behaviours worth locking down here are the ones that cost real money to
 * get wrong: submitting the same transaction twice, and treating a deliberate
 * "no" from the signer as a failure.
 */

const { useWallet } = vi.hoisted(() => ({ useWallet: vi.fn() }));
vi.mock('../context/useWallet', () => ({ useWallet }));

function connectedWallet(overrides: Partial<WalletState> = {}): WalletState {
  return {
    status: 'connected',
    address: 'GABC',
    network: 'TESTNET',
    networkError: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    signTransaction: vi.fn().mockResolvedValue({ signedTxXdr: 'signed', signerAddress: 'GABC' }),
    ...overrides,
  };
}

/** A promise whose resolution the test controls. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  useWallet.mockReturnValue(connectedWallet());
});

describe('useTransaction', () => {
  it('walks idle → success and hands the result back', async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useTransaction({ onSuccess }));

    expect(result.current.phase).toBe('idle');

    let sent: unknown;
    await act(async () => {
      sent = await result.current.send(async () => ({
        signAndSend: vi.fn().mockResolvedValue({ result: 'award-1' }),
      }));
    });

    expect(sent).toBe('award-1');
    expect(result.current.phase).toBe('success');
    expect(result.current.result).toBe('award-1');
    expect(result.current.error).toBeNull();
    expect(onSuccess).toHaveBeenCalledWith('award-1');
  });

  it('prevents a second submission while one is in flight', async () => {
    const signAndSend = deferred<{ result: string }>();
    const build = vi.fn().mockResolvedValue({
      signAndSend: () => signAndSend.promise,
    });

    const { result } = renderHook(() => useTransaction());

    let firstSend!: Promise<unknown>;
    let secondResult: unknown;
    await act(async () => {
      firstSend = result.current.send(build);
      // Second click, before the first has resolved.
      secondResult = await result.current.send(build);
    });

    expect(secondResult).toBeNull();
    expect(build).toHaveBeenCalledTimes(1);

    await act(async () => {
      signAndSend.resolve({ result: 'ok' });
      await firstSend;
    });

    expect(result.current.phase).toBe('success');

    // Once settled, a fresh submission is allowed again.
    await act(async () => {
      await result.current.send(build);
    });
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('returns to idle when the signature is declined', async () => {
    const { result } = renderHook(() => useTransaction());

    let returned: unknown = 'unset';
    await act(async () => {
      returned = await result.current.send(async () => ({
        signAndSend: vi.fn().mockRejectedValue(new Error('User declined the transaction')),
      }));
    });

    expect(returned).toBeNull();
    // A decline is a choice, not a failure — no error phase, no red banner.
    expect(result.current.phase).toBe('idle');
    expect(result.current.error?.kind).toBe('none');
  });

  it('goes to error on a genuine contract failure', async () => {
    const { result } = renderHook(() => useTransaction({ contract: 'program' }));

    await act(async () => {
      await result.current.send(async () => ({
        signAndSend: vi.fn().mockRejectedValue(new Error('Error(Contract, #14)')),
      }));
    });

    expect(result.current.phase).toBe('error');
    expect(result.current.error?.kind).toBe('blocked');
    expect(result.current.error?.code).toBe(14);
  });

  it('refuses to build without a connected wallet', async () => {
    useWallet.mockReturnValue(connectedWallet({ address: null, status: 'disconnected' }));
    const build = vi.fn();

    const { result } = renderHook(() => useTransaction());

    let returned: unknown = 'unset';
    await act(async () => {
      returned = await result.current.send(build);
    });

    expect(returned).toBeNull();
    expect(build).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('error');
    expect(result.current.error?.kind).toBe('blocked');
  });

  it('refuses to build when the wallet is on the wrong network', async () => {
    useWallet.mockReturnValue(
      connectedWallet({ status: 'wrong-network', networkError: 'Wallet is on PUBLIC, expected TESTNET.' }),
    );
    const build = vi.fn();

    const { result } = renderHook(() => useTransaction());

    await act(async () => {
      await result.current.send(build);
    });

    expect(build).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('error');
    expect(result.current.error?.message).toContain('PUBLIC');
  });

  it('reset clears a failed attempt back to idle', async () => {
    const { result } = renderHook(() => useTransaction());

    await act(async () => {
      await result.current.send(async () => ({
        signAndSend: vi.fn().mockRejectedValue(new Error('Error(Contract, #14)')),
      }));
    });
    expect(result.current.phase).toBe('error');

    act(() => {
      result.current.reset();
    });

    expect(result.current.phase).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.result).toBeNull();
  });
});
