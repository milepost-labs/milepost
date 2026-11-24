import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { RegisterSchema } from './RegisterSchema';

vi.mock('../context/useWallet', () => ({
  useWallet: () => ({ address: null, status: 'disconnected', connect: vi.fn() }),
}));
vi.mock('../context/useAnnouncer', () => ({ useAnnouncer: () => vi.fn() }));
vi.mock('../context/useSoroban', () => ({
  useSoroban: () => ({ attest: {} }),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <RegisterSchema />
    </MemoryRouter>,
  );
}

describe('RegisterSchema signed out', () => {
  it('asks to sign in to register, and still offers lookup', () => {
    renderPage();
    expect(screen.getByText('Define what verifiers sign')).toBeTruthy();
    expect(screen.getByText(/the connected address becomes the schema owner/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: /Register schema/ })).toBeNull();
    expect(screen.getByLabelText('Schema UID')).toBeTruthy();
  });
});
