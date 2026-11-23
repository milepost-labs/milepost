import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { phaseLabel, useTransaction, type Sendable } from './useTransaction';
import type { WalletState } from '../context/walletStore';

/**
 * The behaviours worth locking down here are the ones that cost real money to
 * get wrong: submitting the same transaction twice, and treating a deliberate
 * "no" from the signer as a failure.
 */

const { useWallet, requestRestoreConsent } = vi.hoisted(() => ({
  useWallet: vi.fn(),
  requestRestoreConsent: vi.fn(),
}));
vi.mock('../context/useWallet', () => ({ useWallet }));
vi.mock('../lib/restoreConsent', () => ({ requestRestoreConsent }));

function connectedWallet(overrides: Partial<WalletState> = {}): WalletState {
  return {
    status: 'connected',
    address: 'GABC',
    network: 'TESTNET',
    networkError: null,
    expectedNetwork: 'Testnet',
    connect: vi.fn(),
    disconnect: vi.fn(),
    recheckNetwork: vi.fn().mockResolvedValue(undefined),
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

afterEach(() => {
  vi.useRealTimers();
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

describe('useTransaction with archived entries', () => {
  beforeEach(() => {
    requestRestoreConsent.mockReset();
  });

  const restoreStep = () => ({ feeStroops: 5_000n, run: vi.fn().mockResolvedValue(undefined) });

  it('asks once, restores, then builds and sends the original', async () => {
    requestRestoreConsent.mockResolvedValue(true);
    const restore = restoreStep();
    const first = { restore, signAndSend: vi.fn() };
    const second = { restore: null, signAndSend: vi.fn().mockResolvedValue({ result: 'paid' }) };
    const build = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const wallet = connectedWallet();
    useWallet.mockReturnValue(wallet);
    const { result } = renderHook(() => useTransaction());

    let sent: unknown;
    await act(async () => {
      sent = await result.current.send(build);
    });

    expect(requestRestoreConsent).toHaveBeenCalledTimes(1);
    expect(requestRestoreConsent).toHaveBeenCalledWith(5_000n);
    expect(restore.run).toHaveBeenCalledWith(wallet.signTransaction);
    expect(build).toHaveBeenCalledTimes(2);
    expect(first.signAndSend).not.toHaveBeenCalled();
    expect(second.signAndSend).toHaveBeenCalledTimes(1);
    expect(sent).toBe('paid');
    expect(result.current.phase).toBe('success');
  });

  it('sends nothing when the restore is declined, and says so', async () => {
    requestRestoreConsent.mockResolvedValue(false);
    const restore = restoreStep();
    const first = { restore, signAndSend: vi.fn() };
    const build = vi.fn().mockResolvedValue(first);
    const { result } = renderHook(() => useTransaction());

    let sent: unknown;
    await act(async () => {
      sent = await result.current.send(build);
    });

    expect(sent).toBeNull();
    expect(restore.run).not.toHaveBeenCalled();
    expect(first.signAndSend).not.toHaveBeenCalled();
    expect(build).toHaveBeenCalledTimes(1);
    expect(result.current.error?.message).toBe('You chose not to restore the archived data, so nothing was sent.');
    expect(result.current.phase).toBe('idle');
  });

  it('does not ask twice when the entries are still archived after the restore', async () => {
    requestRestoreConsent.mockResolvedValue(true);
    const build = vi
      .fn()
      .mockResolvedValueOnce({ restore: restoreStep(), signAndSend: vi.fn() })
      .mockResolvedValueOnce({ restore: restoreStep(), signAndSend: vi.fn() });
    const { result } = renderHook(() => useTransaction());

    await act(async () => {
      await result.current.send(build);
    });

    expect(requestRestoreConsent).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe('error');
    expect(result.current.error?.message).toBe('This record has been archived on the ledger.');
  });

  it('fails as before, pointing at Keepalive, when nothing can ask', async () => {
    requestRestoreConsent.mockResolvedValue(null);
    const restore = restoreStep();
    const { result } = renderHook(() => useTransaction());

    await act(async () => {
      await result.current.send(async () => ({ restore, signAndSend: vi.fn() }));
    });

    expect(restore.run).not.toHaveBeenCalled();
    expect(result.current.error?.action).toBe('Restore it from the Keepalive screen, then try again.');
  });

  it('explains a restore that fails', async () => {
    requestRestoreConsent.mockResolvedValue(true);
    const restore = { feeStroops: 1n, run: vi.fn().mockRejectedValue(new Error('Failed to fetch')) };
    const { result } = renderHook(() => useTransaction());

    await act(async () => {
      await result.current.send(async () => ({ restore, signAndSend: vi.fn() }));
    });

    expect(result.current.phase).toBe('error');
    expect(result.current.error?.kind).not.toBe('none');
  });
});

describe('useTransaction branches: network, simulation, submit, prepare/confirm, slow & reset', () => {
  it('falls back to a clear wrong-network message when networkError is null', async () => {
    const onError = vi.fn();
    useWallet.mockReturnValue(
      connectedWallet({ status: 'wrong-network', network: null, networkError: null, expectedNetwork: 'Testnet' }),
    );
    const { result } = renderHook(() => useTransaction({ onError }));

    await act(async () => {
      await result.current.send(vi.fn());
    });

    expect(result.current.phase).toBe('error');
    expect(result.current.error?.kind).toBe('blocked');
    expect(result.current.error?.message).toContain('an unknown network');
    expect(result.current.error?.message).toContain('Testnet');
    expect(onError).toHaveBeenCalledWith(result.current.error);
  });

  it('goes to error when simulation (build) fails', async () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useTransaction({ onError }));

    let returned: unknown = 'unset';
    await act(async () => {
      returned = await result.current.send(async () => {
        throw new Error('Error(Contract, #2)');
      });
    });

    expect(returned).toBeNull();
    expect(result.current.phase).toBe('error');
    expect(result.current.error?.kind).toBe('blocked');
    expect(result.current.error?.code).toBe(2);
    expect(onError).toHaveBeenCalledWith(result.current.error);
  });

  it('goes to error on a submit timeout or network failure', async () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useTransaction({ onError }));

    let returned: unknown = 'unset';
    await act(async () => {
      returned = await result.current.send(async () => ({
        signAndSend: vi.fn().mockRejectedValue(new Error('Transaction submission timed out')),
      }));
    });

    expect(returned).toBeNull();
    expect(result.current.phase).toBe('error');
    expect(result.current.error?.kind).toBe('fault');
    expect(onError).toHaveBeenCalledWith(result.current.error);
  });

  it('marks slow after 10 seconds in flight and clears slow and fee on reset', async () => {
    vi.useFakeTimers();
    const pending = deferred<{ result: string }>();
    const { result } = renderHook(() => useTransaction<string>());

    let sendPromise!: Promise<string | null>;
    await act(async () => {
      sendPromise = result.current.send(async () => ({
        estimatedFee: 12_345n,
        signAndSend: () => pending.promise,
      }));
    });

    expect(result.current.slow).toBe(false);
    expect(result.current.estimatedFee).toBe(12_345n);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(result.current.slow).toBe(true);

    await act(async () => {
      pending.resolve({ result: 'done' });
      await sendPromise;
    });
    expect(result.current.phase).toBe('success');

    act(() => {
      result.current.reset();
    });
    expect(result.current.phase).toBe('idle');
    expect(result.current.slow).toBe(false);
    expect(result.current.estimatedFee).toBeNull();
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('supports prepare() and confirm() with fee extraction and success event', async () => {
    const onSuccess = vi.fn();
    const listener = vi.fn();
    window.addEventListener('milepost:transaction-success', listener);

    const { result } = renderHook(() => useTransaction<string>({ onSuccess }));

    let ready = false;
    await act(async () => {
      ready = await result.current.prepare(async () =>
        ({
          simulationResponse: { minResourceFee: '4200' },
          signAndSend: vi.fn().mockResolvedValue({ result: 'confirmed-1' }),
        }) as unknown as Sendable<string>,
      );
    });

    expect(ready).toBe(true);
    expect(result.current.phase).toBe('confirming');
    expect(result.current.busy).toBe(false);
    expect(result.current.estimatedFee).toBe(4200n);

    let confirmed: string | null = null;
    await act(async () => {
      confirmed = await result.current.confirm();
    });

    window.removeEventListener('milepost:transaction-success', listener);

    expect(confirmed).toBe('confirmed-1');
    expect(result.current.phase).toBe('success');
    expect(result.current.result).toBe('confirmed-1');
    expect(onSuccess).toHaveBeenCalledWith('confirmed-1');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('handles prepare() failures and confirm() when unprepared, wrong-network, declined, or failed', async () => {
    const onError = vi.fn();
    const { result, rerender } = renderHook(() => useTransaction({ onError }));

    // confirm() before prepare() is a no-op.
    let earlyConfirm: unknown = 'unset';
    await act(async () => {
      earlyConfirm = await result.current.confirm();
    });
    expect(earlyConfirm).toBeNull();

    // prepare() on wrong network returns false.
    useWallet.mockReturnValue(connectedWallet({ status: 'wrong-network', network: 'PUBLIC', networkError: null }));
    rerender();
    const build = vi.fn();
    let ready = true;
    await act(async () => {
      ready = await result.current.prepare(build);
    });
    expect(ready).toBe(false);
    expect(build).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('error');
    expect(result.current.error?.kind).toBe('blocked');

    // prepare() simulation failure returns false and calls onError.
    useWallet.mockReturnValue(connectedWallet());
    rerender();
    await act(async () => {
      ready = await result.current.prepare(async () => {
        throw new Error('Error(Contract, #3)');
      });
    });
    expect(ready).toBe(false);
    expect(result.current.phase).toBe('error');
    expect(onError).toHaveBeenCalled();

    // prepare() succeeds, then wallet switches to wrong network before confirm().
    await act(async () => {
      ready = await result.current.prepare(async () => ({
        signAndSend: vi.fn().mockRejectedValue(new Error('User declined the transaction')),
      }));
    });
    expect(ready).toBe(true);

    useWallet.mockReturnValue(connectedWallet({ status: 'wrong-network', networkError: 'Wrong network' }));
    rerender();
    let res: unknown = 'unset';
    await act(async () => {
      res = await result.current.confirm();
    });
    expect(res).toBeNull();
    expect(result.current.phase).toBe('error');
    expect(result.current.error?.message).toBe('Wrong network');

    // Declining signature during confirm() returns to idle with error.kind === 'none'.
    useWallet.mockReturnValue(connectedWallet());
    rerender();
    await act(async () => {
      res = await result.current.confirm();
    });
    expect(res).toBeNull();
    expect(result.current.phase).toBe('idle');
    expect(result.current.error?.kind).toBe('none');

    // Submit failure during confirm() goes to error.
    await act(async () => {
      await result.current.prepare(async () => ({
        signAndSend: vi.fn().mockRejectedValue(new Error('Failed to fetch')),
      }));
      res = await result.current.confirm();
    });
    expect(res).toBeNull();
    expect(result.current.phase).toBe('error');

    // reset() clears preparedRef so confirm() returns null afterwards.
    await act(async () => {
      await result.current.prepare(async () => ({
        signAndSend: vi.fn().mockResolvedValue({ result: 'x' }),
      }));
    });
    act(() => {
      result.current.reset();
    });
    await act(async () => {
      res = await result.current.confirm();
    });
    expect(res).toBeNull();
  });

  it('returns human labels for every transaction phase', () => {
    expect(phaseLabel('building')).toBe('Preparing…');
    expect(phaseLabel('restoring')).toBe('Restoring archived data…');
    expect(phaseLabel('confirming')).toBe('Ready to sign');
    expect(phaseLabel('signing')).toBe('Waiting for your signature…');
    expect(phaseLabel('submitting')).toBe('Submitting…');
    expect(phaseLabel('success')).toBe('Done');
    expect(phaseLabel('idle')).toBe('');
    expect(phaseLabel('error')).toBe('');
  });
});
