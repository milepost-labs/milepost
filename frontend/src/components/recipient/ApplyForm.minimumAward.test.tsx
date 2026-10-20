import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApplyForm } from './ApplyForm';

/**
 * A programme may set a minimum award, and `finalize` refuses anything below
 * it. The apply form must say so before submission — but must not block it,
 * because the award is the median of reviewer votes and those votes may still
 * land above the minimum.
 */

const mocks = vi.hoisted(() => ({
  minimumAward: 0n,
  getConfig: vi.fn(),
  programmeId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
}));

vi.mock('../../context/useAnnouncer', () => ({
  useAnnouncer: () => vi.fn(),
}));

vi.mock('../../context/useWallet', () => ({
  useWallet: () => ({
    address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    status: 'connected',
    network: 'TESTNET',
    networkError: null,
    expectedNetwork: 'Testnet',
    connect: vi.fn(),
    signTransaction: vi.fn(),
  }),
}));

vi.mock('../../context/useSoroban', () => ({
  useSoroban: () => ({
    programmeAt: () => ({ get_config: mocks.getConfig }),
  }),
}));

vi.mock('../../hooks/useOpenProgrammes', () => ({
  useOpenProgrammes: () => ({
    real: [
      {
        id: mocks.programmeId,
        name: 'Live Grant Round',
        creator: null,
        createdLedger: 4_811_204,
        sample: false,
        chain: {
          phase: 'Open',
          contributed: '0',
          fee: '0',
          awarded: '0',
          released: '0',
          refundable: '0',
          quorum: 1,
        },
      },
    ],
    samples: [],
    loading: false,
    fetching: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

function renderForm() {
  return render(
    <MemoryRouter>
      <ApplyForm sampleDelayMs={0} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.minimumAward = 0n;
  mocks.getConfig.mockReset();
  mocks.getConfig.mockImplementation(async () => ({
    result: {
      unwrap: () => ({ minimum_award: mocks.minimumAward }),
    },
  }));
});

describe('ApplyForm — programme minimum award', () => {
  it('shows the minimum before an amount is entered', async () => {
    mocks.minimumAward = 2_000_0000000n; // 2,000 USDC
    renderForm();

    expect(await screen.findByText(/minimum award:/i)).toBeTruthy();
    expect(screen.getByText('2,000.00 USDC')).toBeTruthy();
  });

  it('shows no minimum row or warning when the programme has no minimum', async () => {
    renderForm();

    await screen.findByRole('radio', { name: 'Live Grant Round' });
    fireEvent.change(screen.getByPlaceholderText('0'), {
      target: { value: '100' },
    });

    await waitFor(() => expect(mocks.getConfig).toHaveBeenCalled());
    expect(screen.queryByText(/minimum award:/i)).toBeNull();
    expect(screen.queryByText(/below the programme.s minimum award/i)).toBeNull();
  });

  it('warns when the requested amount is below the minimum, without blocking submission', async () => {
    mocks.minimumAward = 2_000_0000000n; // 2,000 USDC
    renderForm();

    await screen.findByRole('radio', { name: 'Live Grant Round' });
    fireEvent.change(screen.getByPlaceholderText('0'), {
      target: { value: '1500' },
    });

    const warning = await screen.findByText(/below the programme.s minimum award/i);
    expect(warning.textContent).toContain('2,000.00 USDC');
    expect(warning.textContent).toMatch(/median of reviewer votes/i);
    expect(warning.textContent).toMatch(/cannot be finalized/i);
    expect(warning.textContent).toMatch(/can still submit/i);

    // The warning is advice, not a validation rule: with notes present the
    // submit button stays enabled.
    fireEvent.change(screen.getByRole('textbox', { name: /application notes/i }), {
      target: { value: 'Exam fees for term 3.' },
    });
    expect(
      (screen.getByRole('button', { name: /submit application/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it('stops warning once the requested amount is at or above the minimum', async () => {
    mocks.minimumAward = 2_000_0000000n;
    renderForm();

    await screen.findByRole('radio', { name: 'Live Grant Round' });
    const amount = screen.getByPlaceholderText('0');

    fireEvent.change(amount, { target: { value: '1500' } });
    expect(
      await screen.findByText(/below the programme.s minimum award/i),
    ).toBeTruthy();

    fireEvent.change(amount, { target: { value: '2500' } });
    await waitFor(() =>
      expect(screen.queryByText(/below the programme.s minimum award/i)).toBeNull(),
    );

    // Exactly the minimum is allowed.
    fireEvent.change(amount, { target: { value: '2000' } });
    expect(screen.queryByText(/below the programme.s minimum award/i)).toBeNull();
  });
});
