import { Buffer } from 'buffer';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegisterSchema } from './RegisterSchema';

const mocks = vi.hoisted(() => ({
  address: 'G' + 'A'.repeat(55),
  announce: vi.fn(),
  registerSchema: vi.fn(),
  getSchema: vi.fn(),
}));

vi.mock('../context/useWallet', () => ({
  useWallet: () => ({ address: mocks.address }),
}));

vi.mock('../context/useAnnouncer', () => ({
  useAnnouncer: () => mocks.announce,
}));

vi.mock('../context/useSoroban', () => ({
  useSoroban: () => ({
    attest: { register_schema: mocks.registerSchema, get_schema: mocks.getSchema },
  }),
}));

const validHex = 'a'.repeat(64);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/schemas/register']}>
      <RegisterSchema />
    </MemoryRouter>,
  );
}

describe('RegisterSchema', () => {
  beforeEach(() => {
    mocks.registerSchema.mockReset();
    mocks.getSchema.mockReset();
    mocks.announce.mockClear();
  });

  function fillValidForm() {
    fireEvent.change(screen.getByLabelText('Schema name'), {
      target: { value: 'shifts-confirmed/v1' },
    });
    fireEvent.change(screen.getByLabelText('Fields'), {
      target: { value: 'programme: address, tranche: u32' },
    });
  }

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

  it('rejects an invalid lookup UID before reading the contract', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Schema UID'), { target: { value: 'not-a-uid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
    expect(screen.getByText('Enter a 32-byte hex UID (64 hex characters).')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Schema UID'), { target: { value: validHex } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
  });

  it('shows an empty state when a valid lookup UID is not registered', async () => {
    mocks.getSchema.mockRejectedValue(new Error('Error(Contract, #1)'));
    render(
      <MemoryRouter initialEntries={[`/schemas/register?schema=${validHex}`]}>
        <RegisterSchema />
      </MemoryRouter>,
    );
    expect(await screen.findByText('No schema with that UID')).toBeTruthy();
  });

  it('shows the lookup loading state while the schema read is pending', () => {
    mocks.getSchema.mockReturnValue(new Promise(() => {}));
    render(
      <MemoryRouter initialEntries={[`/schemas/register?schema=${validHex}`]}>
        <RegisterSchema />
      </MemoryRouter>,
    );
    expect(screen.getByText('Reading the schema')).toBeTruthy();
  });

  it('shows the details of a registered schema lookup', async () => {
    mocks.getSchema.mockResolvedValue({
      result: {
        unwrap: () => ({
          uid: Buffer.from(validHex, 'hex'),
          definition: 'shifts-confirmed/v1|programme: address',
          authority: 'G' + 'A'.repeat(55),
          revocable: true,
          restricted: false,
          predecessor: null,
        }),
      },
    });
    render(
      <MemoryRouter initialEntries={[`/schemas/register?schema=${validHex}`]}>
        <RegisterSchema />
      </MemoryRouter>,
    );
    expect(await screen.findByText('shifts-confirmed/v1|programme: address')).toBeTruthy();
    expect(screen.getByText('Any verifier')).toBeTruthy();
  });

  it('shows a missing predecessor in replacement history', async () => {
    const predecessor = 'b'.repeat(64);
    mocks.getSchema
      .mockResolvedValueOnce({
        result: {
          unwrap: () => ({
            uid: Buffer.from(validHex, 'hex'),
            definition: 'new/v1|field: address',
            authority: 'G' + 'A'.repeat(55),
            revocable: false,
            restricted: true,
            predecessor: Buffer.from(predecessor, 'hex'),
          }),
        },
      })
      .mockRejectedValueOnce(new Error('Error(Contract, #1)'));
    render(
      <MemoryRouter initialEntries={[`/schemas/register?schema=${validHex}`]}>
        <RegisterSchema />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Not registered on this network')).toBeTruthy();
    expect(screen.getByText('Only the authority')).toBeTruthy();
  });

  it('allows resetting the form after a successful registration', async () => {
    mocks.registerSchema.mockResolvedValue({
      signAndSend: vi.fn().mockResolvedValue({
        result: { unwrap: () => Buffer.from(validHex, 'hex') },
      }),
    });
    renderPage();
    fillValidForm();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Register schema' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Register another' }));
    expect(screen.getByLabelText('Schema name')).toHaveProperty('value', '');
  });

  it('renders a registered predecessor in replacement history', async () => {
    const predecessor = 'b'.repeat(64);
    const schema = (uid: string, definition: string, previous: Buffer | null) => ({
      result: {
        unwrap: () => ({
          uid: Buffer.from(uid, 'hex'),
          definition,
          authority: 'G' + 'A'.repeat(55),
          revocable: false,
          restricted: false,
          predecessor: previous,
        }),
      },
    });
    mocks.getSchema
      .mockResolvedValueOnce(schema(validHex, 'new/v1', Buffer.from(predecessor, 'hex')))
      .mockResolvedValueOnce(schema(predecessor, 'old/v1', null));
    render(
      <MemoryRouter initialEntries={[`/schemas/register?schema=${validHex}`]}>
        <RegisterSchema />
      </MemoryRouter>,
    );
    expect(await screen.findByText('old/v1')).toBeTruthy();
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
  });

  it('explains a duplicate schema error', async () => {
    mocks.registerSchema.mockRejectedValue(new Error('Error(Contract, #2)'));
    renderPage();
    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: 'Register schema' }));

    expect(await screen.findByText(/Something went wrong/i)).toBeTruthy();
    expect(screen.getByText(/Nothing was transferred · attest error 2/)).toBeTruthy();
  });

  it('explains a missing predecessor error from the contract', async () => {
    mocks.registerSchema.mockRejectedValue(new Error('Error(Contract, #1)'));
    renderPage();
    fillValidForm();
    fireEvent.change(screen.getByLabelText('Supersedes (optional)'), {
      target: { value: validHex },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Register schema' }));

    expect(await screen.findByText(/Something went wrong/i)).toBeTruthy();
    expect(screen.getByText(/Nothing was transferred · attest error 1/)).toBeTruthy();
  });

  it('treats a declined signature as a visible neutral outcome', async () => {
    mocks.registerSchema.mockRejectedValue(new Error('User declined signature'));
    renderPage();
    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: 'Register schema' }));

    expect(await screen.findByText(/Something went wrong/i)).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('status', { name: /Schema registered/i })).toBeNull();
  });
});
