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
  it('shows the sign-in requirement as a neutral notice, not an alert', () => {
    renderPage();

    const notice = screen.getByText(/the connected address becomes the schema owner/);
    expect(notice.getAttribute('role')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();

    const register = screen.getByRole('button', { name: /Register schema/ }) as HTMLButtonElement;
    expect(register.disabled).toBe(true);
    expect(register.getAttribute('aria-describedby')).toBe(notice.id);
  });
});
