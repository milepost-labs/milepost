import { Buffer } from 'buffer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Attestation } from '@milepost/attest';
import type { AttestationMatch } from '../../lib/attestationSearch';
import type { RecipientAwardFixture } from '../../fixtures/recipientFixtures';
import { AwardCard } from './AwardCard';

const PROGRAMME_ID = `C${'P'.repeat(55)}`;
const RECIPIENT = `G${'R'.repeat(55)}`;
const VERIFIER = `G${'V'.repeat(55)}`;
const SCHEMA_HEX = 'ab'.repeat(32);
const OTHER_SCHEMA_HEX = 'cd'.repeat(32);
const VALID_UID = '11'.repeat(32);
const SPENT_UID = '22'.repeat(32);
const REVOKED_UID = '33'.repeat(32);
const WRONG_SCHEMA_UID = '44'.repeat(32);

const searchMock = vi.hoisted(() => vi.fn());

vi.mock('../../lib/attestationSearch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/attestationSearch')>()),
  searchAttestations: searchMock,
}));

vi.mock('../../context/useAnnouncer', () => ({ useAnnouncer: () => vi.fn() }));

vi.mock('../../context/useWallet', () => ({
  useWallet: () => ({
    address: RECIPIENT,
    status: 'connected',
    network: 'TESTNET',
    networkError: null,
    expectedNetwork: 'Testnet',
    connect: vi.fn(),
    signTransaction: vi.fn(),
  }),
}));

vi.mock('../../hooks/useProgrammeAsset', () => ({
  useProgrammeAsset: () => 'XLM',
}));

const programmeClient = {
  get_phase: vi.fn(async () => ({ result: { unwrap: () => ({ tag: 'Settled' }) } })),
  get_config: vi.fn(async () => ({
    result: {
      unwrap: () => ({
        schema: Buffer.from(SCHEMA_HEX, 'hex'),
        release_deadline: BigInt(Math.floor(Date.now() / 1000) + 86_400),
      }),
    },
  })),
  is_verifier: vi.fn(async ({ addr }: { addr: string }) => ({ result: addr === VERIFIER })),
  is_spent: vi.fn(async ({ attestation }: { attestation: Buffer }) => ({
    result: Buffer.from(attestation).toString('hex') === SPENT_UID,
  })),
  // The release sheet reads the paused flag before it offers a signature.
  options: { contractId: PROGRAMME_ID },
  is_paused: vi.fn(async () => ({ result: false })),
};

vi.mock('../../context/useSoroban', () => {
  const soroban = {
    programmeAt: () => programmeClient,
    // The sheet checks a proof on the chain before signing; these answer "valid".
    attest: {
      options: { contractId: `C${'A'.repeat(55)}` },
      get: vi.fn(async ({ uid }: { uid: Buffer }) => ({
        result: {
          unwrap: () => ({
            uid,
            schema: Buffer.from(SCHEMA_HEX, 'hex'),
            subject: RECIPIENT,
            attester: VERIFIER,
            revoked_at: undefined,
            expires_at: undefined,
          }),
        },
      })),
      verify: vi.fn(async () => ({ result: true })),
    },
    rpcUrl: 'https://soroban-testnet.stellar.org',
  };
  return { useSoroban: () => soroban, useOptionalSoroban: () => soroban };
});

function makeMatch(uid: string, overrides: Partial<Attestation> = {}): AttestationMatch {
  return {
    uid,
    role: 'subject',
    subject: RECIPIENT,
    ledger: 500,
    attestation: {
      uid: Buffer.from(uid, 'hex'),
      schema: Buffer.from(SCHEMA_HEX, 'hex'),
      attester: VERIFIER,
      subject: RECIPIENT,
      data: Buffer.alloc(0),
      created_at: 1_700_000_000n,
      expires_at: undefined,
      revoked_at: undefined,
      ...overrides,
    } as Attestation,
  };
}

const award: RecipientAwardFixture = {
  programmeId: PROGRAMME_ID,
  programmeName: 'Clinic nurse stipends 2027',
  recipient: RECIPIENT,
  mode: 'Open',
  payee: null,
  granted: '30000000000',
  released: '0',
  tranches: 3,
  tranchesReleased: 0,
  attestationReady: false,
  condition: 'Clinic attendance confirmed',
  updatedLedger: 500,
};

describe('AwardCard ReleaseSheet — attestation finder (#627)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchMock.mockResolvedValue({
      address: RECIPIENT,
      window: { fromLedger: 1, toLedger: 600 },
      truncated: false,
      matches: [
        makeMatch(VALID_UID),
        makeMatch(SPENT_UID),
        makeMatch(REVOKED_UID, { revoked_at: 1_700_000_500n }),
        makeMatch(WRONG_SCHEMA_UID, { schema: Buffer.from(OTHER_SCHEMA_HEX, 'hex') }),
      ],
    });
  });

  it('offers only valid unused attestations and fills both fields when picked', async () => {
    render(
      <MemoryRouter>
        <AwardCard award={award} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Release tranche' }));

    // Only the valid unused attestation is listed.
    const validBtn = await screen.findByRole('button', { name: /111111…111111/ });
    expect(validBtn).toBeTruthy();
    expect(screen.queryByText(/222222…222222/)).toBeNull();
    expect(screen.queryByText(/333333…333333/)).toBeNull();
    expect(screen.queryByText(/444444…444444/)).toBeNull();

    // Picking it populates both inputs and enables Sign and release.
    fireEvent.click(validBtn);
    const idInput = screen.getByLabelText('Attestation id (hex)') as HTMLInputElement;
    const attesterInput = screen.getByLabelText('Attester address') as HTMLInputElement;
    expect(idInput.value).toBe(VALID_UID);
    expect(attesterInput.value).toBe(VERIFIER);
    // Enabled once the sheet's chain reads (phase, window, paused, proof) answer.
    const sign = screen.getByRole('button', { name: 'Sign and release' }) as HTMLButtonElement;
    await waitFor(() => expect(sign.disabled).toBe(false));
  });

  it('still allows typing an attestation id and attester manually', async () => {
    searchMock.mockResolvedValue({
      address: RECIPIENT,
      window: { fromLedger: 1, toLedger: 600 },
      truncated: false,
      matches: [],
    });

    render(
      <MemoryRouter>
        <AwardCard award={award} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Release tranche' }));

    await waitFor(() => {
      expect(screen.getByText(/No recent unused attestations found/i)).toBeTruthy();
    });

    const idInput = screen.getByLabelText('Attestation id (hex)') as HTMLInputElement;
    const attesterInput = screen.getByLabelText('Attester address') as HTMLInputElement;
    fireEvent.change(idInput, { target: { value: 'aa'.repeat(32) } });
    fireEvent.change(attesterInput, { target: { value: VERIFIER } });

    expect(idInput.value).toBe('aa'.repeat(32));
    expect(attesterInput.value).toBe(VERIFIER);
    // Enabled once the sheet's chain reads (phase, window, paused, proof) answer.
    const sign = screen.getByRole('button', { name: 'Sign and release' }) as HTMLButtonElement;
    await waitFor(() => expect(sign.disabled).toBe(false));
  });
});
