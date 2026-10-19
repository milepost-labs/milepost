import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeployProgramme } from './DeployProgramme';

const mocks = vi.hoisted(() => ({
  address: 'G' + 'A'.repeat(55),
  announce: vi.fn(),
  registryCreate: vi.fn(),
}));

vi.mock('../../context/useWallet', () => ({
  useWallet: () => ({
    address: mocks.address,
    status: 'connected',
    network: 'testnet',
    expectedNetwork: 'testnet',
    signTransaction: vi.fn(),
  }),
}));

vi.mock('../../context/useAnnouncer', () => ({
  useAnnouncer: () => mocks.announce,
}));

vi.mock('../../context/useSoroban', () => ({
  useSoroban: () => ({
    registry: { create: mocks.registryCreate },
  }),
}));

const validHex = 'a'.repeat(64);
const validAddress = 'G' + 'A'.repeat(55);
const toDateValue = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 16);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <DeployProgramme />
    </MemoryRouter>,
  );
}

function fillStepZero() {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Health worker stipends 2027' } });
  fireEvent.change(screen.getByLabelText('Attestation schema UID'), {
    target: { value: validHex },
  });
}

function fillStepOne() {
  fireEvent.change(screen.getByLabelText('Reviewer quorum'), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText('Tranches per award'), { target: { value: '3' } });
  fireEvent.change(screen.getByLabelText('Reviewers (one address per line)'), {
    target: { value: validAddress },
  });
  fireEvent.change(screen.getByLabelText('Verifiers (one address per line)'), {
    target: { value: validAddress },
  });
}

function fillValidDeadlines() {
  const now = Math.floor(Date.now() / 1000);
  fireEvent.change(screen.getByLabelText('Applications close'), {
    target: { value: toDateValue(now + 60 * 60 * 24 * 2) },
  });
  fireEvent.change(screen.getByLabelText('Review closes'), {
    target: { value: toDateValue(now + 60 * 60 * 24 * 3) },
  });
  fireEvent.change(screen.getByLabelText('Release closes'), {
    target: { value: toDateValue(now + 60 * 60 * 24 * 4) },
  });
  fireEvent.change(screen.getByLabelText('Sweep opens'), {
    target: { value: toDateValue(now + 60 * 60 * 24 * 5) },
  });
}

describe('DeployProgramme', () => {
  beforeEach(() => {
    mocks.registryCreate.mockReset();
    mocks.announce.mockClear();
  });

  it('requires valid details before the user can continue', () => {
    renderPage();

    const next = screen.getByRole('button', { name: 'Next' });
    expect(next).toHaveProperty('disabled', true);

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Health worker stipends 2027' },
    });
    fireEvent.change(screen.getByLabelText('Attestation schema UID'), {
      target: { value: 'not-hex' },
    });

    expect(
      screen.getByText('Enter the schema UID as a 32-byte hex string (64 characters). It must already exist in attest.'),
    ).toBeTruthy();
    expect(next).toHaveProperty('disabled', true);

    fireEvent.change(screen.getByLabelText('Attestation schema UID'), {
      target: { value: validHex },
    });
    expect(next).toHaveProperty('disabled', false);
  });

  it('blocks invalid reviewers, verifiers and quorum counts on step two', () => {
    renderPage();
    fillStepZero();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    fireEvent.change(screen.getByLabelText('Reviewer quorum'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Reviewers (one address per line)'), {
      target: { value: validAddress },
    });
    fireEvent.change(screen.getByLabelText('Verifiers (one address per line)'), {
      target: { value: 'not-a-verifier' },
    });

    expect(screen.getByText('Every verifier must be a valid Stellar address, one per line.')).toBeTruthy();
    expect(screen.getByText('Quorum cannot exceed the reviewer count (1).')).toBeTruthy();
  });

  it('shows the deadline ordering error when the dates are out of order', () => {
    renderPage();
    fillStepZero();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fillStepOne();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    const now = Math.floor(Date.now() / 1000);
    fireEvent.change(screen.getByLabelText('Applications close'), {
      target: { value: toDateValue(now + 60 * 60 * 24 * 3) },
    });
    fireEvent.change(screen.getByLabelText('Review closes'), {
      target: { value: toDateValue(now + 60 * 60 * 24 * 2) },
    });
    fireEvent.change(screen.getByLabelText('Release closes'), {
      target: { value: toDateValue(now + 60 * 60 * 24 * 4) },
    });
    fireEvent.change(screen.getByLabelText('Sweep opens'), {
      target: { value: toDateValue(now + 60 * 60 * 24 * 5) },
    });

    expect(
      screen.getByText('The deadlines must run in order: applications, then review, then release, then sweep.'),
    ).toBeTruthy();
  });

  it('deploys a valid programme and displays the new address', async () => {
    mocks.registryCreate.mockResolvedValue({
      signAndSend: vi.fn().mockResolvedValue({
        result: { unwrap: () => 'GNEWPROGRAMADDRESSAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
      }),
    });

    renderPage();
    fillStepZero();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fillStepOne();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fillValidDeadlines();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    fireEvent.change(screen.getByLabelText('Asset contract'), {
      target: { value: validAddress },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Deploy programme' }));

    await waitFor(() => expect(screen.getByText('✓ Programme deployed')).toBeTruthy());
    expect(screen.getByText('GNEWPROGRAMADDRESSAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBeTruthy();
  });

  it('shows an error panel when the registry rejects the deploy transaction', async () => {
    mocks.registryCreate.mockImplementation(async () => {
      throw Object.assign(new Error('Error(Contract, #3)'), { code: 3 });
    });

    renderPage();
    fillStepZero();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fillStepOne();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fillValidDeadlines();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.change(screen.getByLabelText('Asset contract'), {
      target: { value: validAddress },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Deploy programme' }));

    await waitFor(() =>
      expect(screen.getByText('Something went wrong that we do not have a specific explanation for.')).toBeTruthy(),
    );
  });
});
