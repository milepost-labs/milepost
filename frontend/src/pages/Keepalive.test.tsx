import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Keepalive } from './Keepalive';

const PROGRAMME_ID = `C${'A'.repeat(55)}`;
const SUBJECT = `G${'A'.repeat(55)}`;
const ATTESTATION_UID = 'ab'.repeat(32);

const hoisted = vi.hoisted(() => {
  const keepalive = vi.fn();
  const recordKeepalive = vi.fn();
  const attestKeepalive = vi.fn();
  const programmeClient = {
    get_phase: vi.fn(async () => ({ result: { unwrap: () => ({ tag: 'Settled' }) } })),
    keepalive,
  };
  return { keepalive, recordKeepalive, attestKeepalive, programmeClient };
});

vi.mock('../context/useWallet', () => ({
  useWallet: () => ({
    address: `G${'A'.repeat(55)}`,
    status: 'connected',
    connect: vi.fn(),
    signTransaction: vi.fn(async () => ({ signedTxXdr: 'xdr', signerAddress: `G${'A'.repeat(55)}` })),
  }),
}));

vi.mock('../context/useAnnouncer', () => ({ useAnnouncer: () => vi.fn() }));

vi.mock('../hooks/useProgrammeParam', () => ({
  useProgrammeParam: () => ({
    raw: PROGRAMME_ID,
    programmeId: PROGRAMME_ID,
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
    programmeAt: () => hoisted.programmeClient,
    attest: { keepalive: hoisted.attestKeepalive },
    record: { keepalive: hoisted.recordKeepalive },
  }),
}));

function assembled<T>(value: T) {
  return Promise.resolve({
    result: { unwrap: () => value },
    signAndSend: vi.fn().mockResolvedValue({ result: { unwrap: () => value } }),
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/keepalive?programme=${PROGRAMME_ID}`]}>
      <Keepalive />
    </MemoryRouter>,
  );
}

describe('Keepalive on-chain extensions', () => {
  beforeEach(() => {
    hoisted.keepalive.mockReset().mockImplementation(() => assembled(undefined));
    hoisted.recordKeepalive.mockReset().mockImplementation(() => assembled(undefined));
    hoisted.attestKeepalive.mockReset().mockImplementation(() => assembled(undefined));
  });

  it('sends the programme keepalive for a single programme row', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Extend' })[0].hasAttribute('disabled')).toBe(false),
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Extend' })[0]);

    await waitFor(() =>
      expect(hoisted.keepalive).toHaveBeenCalledWith({ subject: SUBJECT }),
    );
    await screen.findByText(/Extended — about 90 days left/);
  });

  it('extends every extendable entry under 30 days, including standing', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Attestation id'), {
      target: { value: ATTESTATION_UID },
    });

    fireEvent.click(
      await screen.findByRole('button', { name: /Extend the 4 under 30 days/ }),
    );

    await waitFor(() => expect(hoisted.keepalive).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(hoisted.recordKeepalive).toHaveBeenCalledWith({ subject: SUBJECT }));
    await waitFor(() =>
      expect(hoisted.attestKeepalive).toHaveBeenCalledWith({
        uid: expect.anything(),
      }),
    );
  });

  it('reports each failure and keeps extending the rest', async () => {
    let calls = 0;
    hoisted.keepalive.mockImplementation(() => {
      calls += 1;
      if (calls === 2) return Promise.reject(new Error('rpc exploded'));
      return assembled(undefined);
    });

    renderPage();
    fireEvent.click(
      await screen.findByRole('button', { name: /Extend the 3 under 30 days/ }),
    );

    await waitFor(() => expect(hoisted.keepalive).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(hoisted.recordKeepalive).toHaveBeenCalledTimes(1));
    await screen.findByText(/Something went wrong/);
    expect(screen.getAllByText(/Extended — about 90 days left/).length).toBe(2);
  });

  it('does not offer an extension while the programme is a sample', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Programme'), {
      target: { value: 'CBQ4SCHOOLBURSARY2026XK3ZP7M2QWJ5T8VN4RD6HY' },
    });
    expect(screen.getAllByText(/This is a sample programme/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Extend' }).every((button) => button.hasAttribute('disabled'))).toBe(true);
  });
});
