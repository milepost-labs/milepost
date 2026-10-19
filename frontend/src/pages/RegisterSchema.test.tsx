import { Buffer } from 'buffer';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegisterSchema } from './RegisterSchema';

const mocks = vi.hoisted(() => ({
  address: 'G' + 'A'.repeat(55),
  announce: vi.fn(),
  registerSchema: vi.fn(),
}));

vi.mock('../context/useWallet', () => ({
  useWallet: () => ({ address: mocks.address }),
}));

vi.mock('../context/useAnnouncer', () => ({
  useAnnouncer: () => mocks.announce,
}));

vi.mock('../context/useSoroban', () => ({
  useSoroban: () => ({
    attest: { register_schema: mocks.registerSchema, get_schema: vi.fn() },
  }),
}));

const validHex = 'a'.repeat(64);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/schemas/register']}>
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

describe('RegisterSchema', () => {
  beforeEach(() => {
    mocks.registerSchema.mockReset();
    mocks.announce.mockClear();
  });

  it('rejects invalid schema names and predecessor UIDs', () => {
    renderPage();

    fireEvent.change(screen.getByLabelText('Schema name'), {
      target: { value: 'Bad Name' },
    });
    expect(screen.getByText('Use lowercase words and a version, like shifts-confirmed/v1.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Supersedes (optional)'), {
      target: { value: 'not-a-uid' },
    });
    expect(
      screen.getByText('Enter a 32-byte hex UID (64 hex characters), or leave this empty.'),
    ).toBeTruthy();
  });

  it('registers a valid schema and shows the new UID', async () => {
    mocks.registerSchema.mockResolvedValue({
      signAndSend: vi.fn().mockResolvedValue({
        result: { unwrap: () => Buffer.from(validHex, 'hex') },
      }),
    });

    renderPage();
    fireEvent.change(screen.getByLabelText('Schema name'), {
      target: { value: 'shifts-confirmed/v1' },
    });
    fireEvent.change(screen.getByLabelText('Fields'), {
      target: { value: 'programme: address, tranche: u32' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Register schema' }));

    await waitFor(() => expect(screen.getByText('Schema registered')).toBeTruthy());
    expect(screen.getByText(validHex)).toBeTruthy();
  });

  it('shows the cycle error message for schema replacement loops', async () => {
    mocks.registerSchema.mockImplementation(async () => {
      throw Object.assign(new Error('Error(Contract, #9)'), { code: 9 });
    });

    renderPage();
    fireEvent.change(screen.getByLabelText('Schema name'), {
      target: { value: 'shifts-confirmed/v1' },
    });
    fireEvent.change(screen.getByLabelText('Fields'), {
      target: { value: 'programme: address, tranche: u32' },
    });
    fireEvent.change(screen.getByLabelText('Supersedes (optional)'), {
      target: { value: validHex },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Register schema' }));

    await waitFor(() =>
      expect(screen.getByText(/A schema cannot (replace|supersede) itself/i)).toBeTruthy(),
    );
    expect(screen.getByText(/Nothing was transferred · attest error 9/i)).toBeTruthy();
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
