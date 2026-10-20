import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Buffer } from 'buffer';
import { VerifierDashboard } from './VerifierDashboard';

const PROGRAMME_A = `C${'A'.repeat(55)}`;
const PROGRAMME_B = `C${'B'.repeat(55)}`;
const REVIEWER = `G${'A'.repeat(55)}`;
const APPLICANT = `G${'B'.repeat(55)}`;

const hoisted = vi.hoisted(() => {
  const clients = new Map<string, unknown>();
  const state = {
    param: '',
    reviewer: true,
    review: vi.fn(),
  };
  return { clients, state };
});

function makeClient(id: string, overrides: { reviewer?: boolean; phase?: string; requested?: bigint } = {}) {
  return {
    is_reviewer: vi.fn(async () => ({ result: overrides.reviewer ?? hoisted.state.reviewer })),
    get_phase: vi.fn(async () => ({
      result: { unwrap: () => ({ tag: overrides.phase ?? 'Review' }) },
    })),
    get_application: vi.fn(async () => ({
      result: {
        unwrap: () => ({
          applicant: APPLICANT,
          finalized: false,
          metadata_hash: Buffer.alloc(32),
          requested: overrides.requested ?? 1_000_000_000n,
          submitted_at: 1n,
          votes: [],
          withdrawn: false,
        }),
      },
    })),
    review: hoisted.state.review,
    options: { contractId: id },
  };
}

vi.mock('../context/useWallet', () => ({
  useWallet: () => ({
    address: `G${'A'.repeat(55)}`,
    status: 'connected',
    connect: vi.fn(),
    signTransaction: vi.fn(async () => ({ signedTxXdr: 'xdr', signerAddress: `G${'A'.repeat(55)}` })),
  }),
}));

vi.mock('../context/useAnnouncer', () => ({ useAnnouncer: () => vi.fn() }));
vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }));

vi.mock('../hooks/useProgrammeParam', () => ({
  useProgrammeParam: () => ({
    raw: hoisted.state.param,
    programmeId: hoisted.state.param,
    status: 'valid',
    active: true,
    blocksProgramme: false,
    loading: false,
    error: null,
    message: null,
    clear: vi.fn(),
    refetch: vi.fn(),
  }),
}));

vi.mock('../context/useSoroban', () => ({
  useSoroban: () => ({
    attest: {},
    programmeAt: (id: string) => hoisted.clients.get(id),
  }),
}));

function client(id: string) {
  return hoisted.clients.get(id) as ReturnType<typeof makeClient>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/verifiers']}>
      <VerifierDashboard />
    </MemoryRouter>,
  );
}

async function chooseApplicant() {
  fireEvent.change(screen.getByLabelText('Applicant address'), {
    target: { value: APPLICANT },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Load applicant' }));
  await screen.findByLabelText('Approved amount');
}

describe('VerifierDashboard reviewer programme picker', () => {
  beforeEach(() => {
    hoisted.state.param = PROGRAMME_A;
    hoisted.state.reviewer = true;
    hoisted.state.review.mockReset().mockImplementation(() =>
      Promise.resolve({
        result: { unwrap: () => undefined },
        signAndSend: vi.fn().mockResolvedValue({ result: { unwrap: () => undefined } }),
      }),
    );
    hoisted.clients.clear();
    hoisted.clients.set(PROGRAMME_A, makeClient(PROGRAMME_A));
    hoisted.clients.set(PROGRAMME_B, makeClient(PROGRAMME_B));
  });

  it('runs reviewer reads against two different programmes', async () => {
    renderPage();
    await waitFor(() => expect(client(PROGRAMME_A).is_reviewer).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Programme address'), {
      target: { value: PROGRAMME_B },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Use programme' }));

    await waitFor(() => expect(client(PROGRAMME_B).is_reviewer).toHaveBeenCalled());
    await chooseApplicant();
    expect(client(PROGRAMME_B).get_application).toHaveBeenCalledWith({
      applicant: APPLICANT,
    });
    expect(client(PROGRAMME_A).get_application).not.toHaveBeenCalled();
  });

  it('explains when the wallet is not a reviewer for the chosen programme', async () => {
    hoisted.clients.set(PROGRAMME_A, makeClient(PROGRAMME_A, { reviewer: false }));
    renderPage();

    await screen.findByText(/not a registered reviewer for this programme/);
    expect(screen.getByText('Not a reviewer')).toBeTruthy();
  });

  it('sends the vote to the chosen programme', async () => {
    renderPage();
    await screen.findByText('Reviewer wallet');
    await chooseApplicant();

    fireEvent.change(screen.getByLabelText('Approved amount'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit review vote' }));

    await waitFor(() =>
      expect(hoisted.state.review).toHaveBeenCalledWith({
        reviewer: REVIEWER,
        applicant: APPLICANT,
        approved: 100_000_000n,
      }),
    );
  });
});
