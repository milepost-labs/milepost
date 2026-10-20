import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Buffer } from 'buffer';
import { AttestationLookup } from './AttestationLookup';
import { SorobanContext, type SorobanState } from '../context/sorobanStore';

const REAL_UID = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const UNKNOWN_UID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

describe('Issue #438 - AttestationLookup', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const createSorobanContext = (getAttestFn: unknown): SorobanState =>
    ({
      registry: {},
      attest: {
        get: getAttestFn,
      },
      record: {},
      policy: {},
      programmeAt: () => ({}),
      demoProgramme: {},
      rpcUrl: 'https://soroban-testnet.stellar.org',
    } as unknown as SorobanState);

  it('reads a real 64-hex UID on-chain and displays the attestation', async () => {
    const getMock = vi.fn().mockResolvedValue({
      result: {
        unwrap: () => ({
          uid: Buffer.from(REAL_UID, 'hex'),
          schema: Buffer.from('11'.repeat(32), 'hex'),
          attester: 'GATTESTEREXAMPLEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          subject: 'GSUBJECTEXAMPLEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          data_hash: Buffer.from('22'.repeat(32), 'hex'),
          created_at: 12345678n,
          expires_at: null,
          revoked_at: null,
        }),
      },
    });

    render(
      <SorobanContext.Provider value={createSorobanContext(getMock)}>
        <AttestationLookup />
      </SorobanContext.Provider>,
    );

    const input = screen.getByLabelText('Attestation id or address');
    fireEvent.change(input, { target: { value: REAL_UID } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));

    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith({ uid: Buffer.from(REAL_UID, 'hex') });
    });

    await waitFor(() => {
      expect(screen.getByText('Valid on-chain')).toBeDefined();
    });

    expect(screen.getByText('GSUBJECTEXAMPLEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBeDefined();
    expect(screen.getByText('GATTESTEREXAMPLEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBeDefined();
    // Real on-chain attestation must NOT have "Sample data"
    expect(screen.queryByText('Sample data')).toBeNull();
  });

  it('says not found and mentions archival when an unknown UID is searched', async () => {
    const getMock = vi.fn().mockRejectedValue(new Error('AttestationNotFound: error 3'));

    render(
      <SorobanContext.Provider value={createSorobanContext(getMock)}>
        <AttestationLookup />
      </SorobanContext.Provider>,
    );

    const input = screen.getByLabelText('Attestation id or address');
    fireEvent.change(input, { target: { value: UNKNOWN_UID } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));

    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith({ uid: Buffer.from(UNKNOWN_UID, 'hex') });
    });

    await waitFor(() => {
      expect(screen.getByText(`Nothing found for “${UNKNOWN_UID}”`)).toBeDefined();
    });

    expect(
      screen.getByText(/archived ones need a keepalive before they can be read/),
    ).toBeDefined();
  });
});
