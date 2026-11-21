import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AwardsTab } from './AwardsTab';
import { SorobanContext, type SorobanState } from '../../context/sorobanStore';
import type { IndexedAward } from '../../lib/indexer';

const mockAwards: IndexedAward[] = [
  {
    recipient: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    payee: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    mode: 'Direct',
    granted: String(10_000n * 10_000_000n), // 10,000
    released: '0',
    tranches: 2,
    tranchesReleased: 0,
    updatedLedger: 123456,
  },
];

let currentAwards: IndexedAward[] = [...mockAwards];

vi.mock('../../hooks/useIndexedList', () => ({
  useIndexedList: () => ({
    data: currentAwards,
    loading: false,
    error: null,
    fetching: false,
    refetch: vi.fn(),
  }),
}));

describe('Issue #440 - AwardsTab index-chain disagreement', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    currentAwards = [...mockAwards];
  });

  const createSorobanContext = (getAwardFn: unknown): SorobanState =>
    ({
      registry: {},
      attest: {},
      record: {},
      policy: {},
      programmeAt: () => ({
        get_award: getAwardFn,
      }),
      demoProgramme: {},
      rpcUrl: 'https://soroban-testnet.stellar.org',
    } as unknown as SorobanState);

  it('shows chain values with no diff marker when chain and index agree', async () => {
    const getAward = vi.fn().mockResolvedValue({
      result: {
        unwrap: () => ({
          granted: 10_000n * 10_000_000n,
          released: 0n,
          tranches: 2,
          tranches_released: 0,
          recipient: mockAwards[0].recipient,
          payee: mockAwards[0].recipient,
          mode: { tag: 'Direct' },
        }),
      },
    });

    render(
      <SorobanContext.Provider value={createSorobanContext(getAward)}>
        <AwardsTab programmeId="CD6X33SKLUEMANS67ID3LJL572FFGERMMJCIFRW7P7EKZQLH35XT67C6" asset="USDC" />
      </SorobanContext.Provider>,
    );

    await waitFor(() => {
      expect(screen.getByRole('cell', { name: '10000 USDC' }).textContent).toBe('10,000');
    });

    expect(screen.queryByText(/Index behind: shows/i)).toBeNull();
    expect(screen.queryByText('Advisory')).toBeNull();
  });

  it('marks row where index differs with "Index behind: shows X" and shows chain values', async () => {
    const getAward = vi.fn().mockResolvedValue({
      result: {
        unwrap: () => ({
          granted: 10_000n * 10_000_000n,
          released: 5_000n * 10_000_000n, // Chain shows 5,000 released
          tranches: 2,
          tranches_released: 1, // Chain shows 1 tranche released
          recipient: mockAwards[0].recipient,
          payee: mockAwards[0].recipient,
          mode: { tag: 'Direct' },
        }),
      },
    });

    render(
      <SorobanContext.Provider value={createSorobanContext(getAward)}>
        <AwardsTab programmeId="CD6X33SKLUEMANS67ID3LJL572FFGERMMJCIFRW7P7EKZQLH35XT67C6" asset="USDC" />
      </SorobanContext.Provider>,
    );

    await waitFor(() => {
      // The row displays chain values
      expect(screen.getByLabelText('1 of 2 tranches released')).toBeDefined();
      expect(screen.getByRole('cell', { name: '5000 USDC' }).textContent).toBe('5,000');
    });

    // Mismatch marker shows index value (0.00 USDC)
    expect(screen.getByText('Index behind: shows 0.00 USDC')).toBeDefined();
  });

  it('falls back to index values and is labelled advisory on a failed chain read', async () => {
    const getAward = vi.fn().mockRejectedValue(new Error('Contract error or network timeout'));

    render(
      <SorobanContext.Provider value={createSorobanContext(getAward)}>
        <AwardsTab programmeId="CD6X33SKLUEMANS67ID3LJL572FFGERMMJCIFRW7P7EKZQLH35XT67C6" asset="USDC" />
      </SorobanContext.Provider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Advisory')).toBeDefined();
    });

    // Falls back to index values
    expect(screen.getByRole('cell', { name: '10000 USDC' }).textContent).toBe('10,000');
    expect(screen.getByLabelText('0 of 2 tranches released')).toBeDefined();
    expect(screen.getByRole('cell', { name: '0 USDC' }).textContent).toBe('0');
  });

  it('neutralizes malicious formula characters in awards when downloading CSV', async () => {
    currentAwards = [
      {
        ...mockAwards[0],
        recipient: '=SUM(1+1)',
        payee: '@EVIL_PAYEE',
      },
    ];

    const createObjectURLSpy = vi.fn().mockReturnValue('blob:http://localhost/mock-url');
    const revokeObjectURLSpy = vi.fn();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: createObjectURLSpy,
      revokeObjectURL: revokeObjectURLSpy,
    });

    const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      (node as HTMLAnchorElement).click = vi.fn();
      return node;
    });
    const removeSpy = vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);

    const getAward = vi.fn().mockRejectedValue(new Error('Contract read fail'));

    render(
      <SorobanContext.Provider value={createSorobanContext(getAward)}>
        <AwardsTab programmeId="CD6X33SKLUEMANS67ID3LJL572FFGERMMJCIFRW7P7EKZQLH35XT67C6" asset="USDC" />
      </SorobanContext.Provider>,
    );

    const downloadBtn = await screen.findByRole('button', { name: 'Download CSV' });
    downloadBtn.click();

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    const [blob] = createObjectURLSpy.mock.calls[0] as [Blob];
    const text = await blob.text();
    expect(text).toContain("'=SUM(1+1)");
    expect(text).toContain("'@EVIL_PAYEE");
    expect(text).not.toContain(',=SUM(1+1),');

    appendSpy.mockRestore();
    removeSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});
