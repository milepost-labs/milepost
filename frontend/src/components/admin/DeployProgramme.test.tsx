import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Buffer } from 'buffer';
import { DeployProgramme } from './DeployProgramme';

const mocks = vi.hoisted(() => ({
  address: 'G' + 'A'.repeat(55),
  announce: vi.fn(),
  registryCreate: vi.fn(),
  // Every UID these tests enter names a schema that exists; the not-found case
  // is covered in DeployProgramme.schema.test.tsx.
  getSchema: vi.fn(),
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
    attest: { get_schema: mocks.getSchema },
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

async function fillStepZero() {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Health worker stipends 2027' } });
  fireEvent.change(screen.getByLabelText('Attestation schema UID'), {
    target: { value: validHex },
  });
  // Next stays disabled until attest confirms the schema exists.
  await screen.findByText('Schema found');
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
    mocks.getSchema.mockReset().mockResolvedValue({
      result: {
        unwrap: () => ({
          authority: 'G' + 'B'.repeat(55),
          definition: 'Requires a verified clinic visit',
          predecessor: null,
          restricted: false,
          revocable: true,
          uid: Buffer.from(validHex, 'hex'),
        }),
      },
    });
  });

  it('requires valid details before the user can continue', async () => {
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
    await screen.findByText('Schema found');
    expect(next).toHaveProperty('disabled', false);
  });

  it('blocks invalid reviewers, verifiers and quorum counts on step two', async () => {
    renderPage();
    await fillStepZero();
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

  it('shows the deadline ordering error when the dates are out of order', async () => {
    renderPage();
    await fillStepZero();
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
    await fillStepZero();
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
    await fillStepZero();
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
