import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Keepalive } from './Keepalive';

const FIRST = `C${'A'.repeat(55)}`;
const SECOND = `C${'B'.repeat(55)}`;

vi.mock('../context/useWallet', () => ({
  useWallet: () => ({ address: null, status: 'disconnected', connect: vi.fn(), signTransaction: vi.fn() }),
}));
vi.mock('../context/useAnnouncer', () => ({ useAnnouncer: () => vi.fn() }));
vi.mock('../context/useSoroban', () => ({
  useSoroban: () => ({
    rpcUrl: 'https://soroban-testnet.stellar.org',
    programmeAt: () => ({ get_phase: () => new Promise(() => {}) }),
    attest: {},
    record: {},
  }),
}));
vi.mock('../lib/indexer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/indexer')>()),
  fetchProgrammes: async () => [
    { id: FIRST, name: 'Clinic stipends', creator: null, createdLedger: 1 },
    { id: SECOND, name: 'Seed grants', creator: null, createdLedger: 2 },
  ],
  fetchAwards: async () => [],
}));
vi.mock('../lib/entryTtl', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/entryTtl')>()),
  readInstanceLifetimes: async (_server: unknown, ids: string[]) =>
    ids.map((programmeId) => ({ programmeId, liveForDays: programmeId === SECOND ? 9 : 70, error: null })),
  readProgrammeLifetimes: async () => ({ latestLedger: 1, rows: [], unchecked: [] }),
}));

describe('Keepalive table of every programme', () => {
  it('lists every indexed programme and opens the extend flow for the chosen one', async () => {
    render(
      <MemoryRouter initialEntries={['/keepalive']}>
        <Keepalive />
      </MemoryRouter>,
    );

    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Seed grants');
    expect(within(rows[0]).getByText('Under 30 days')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Extend Seed grants' }));

    await waitFor(() => expect(screen.getByLabelText('Programme')).toHaveProperty('value', SECOND));
    await waitFor(() => expect(document.activeElement?.id).toBe('extend-heading'));
  });
});
