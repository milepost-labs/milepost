import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ProgrammeAssetRules } from './ProgrammeDetail';
import * as tokenLib from '../lib/token';

vi.mock('../context/useSoroban', () => ({
  useSoroban: () => ({
    rpcUrl: 'https://soroban-testnet.stellar.org',
  }),
}));

describe('Issue #441 - ProgrammeAssetRules', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows native XLM with no issuer for native token', async () => {
    vi.spyOn(tokenLib, 'fetchTokenName').mockResolvedValue({ result: 'native' });

    render(
      <dl>
        <ProgrammeAssetRules tokenAddress="CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC" />
      </dl>,
    );

    await waitFor(() => {
      expect(screen.getByText('XLM')).toBeDefined();
    });

    // Native asset must not show an issuer
    expect(screen.queryByText(/Issuer:/i)).toBeNull();
    // Asset contract address chip is displayed with explorer link
    expect(screen.getByText(/CDLZFC…CYSC/)).toBeDefined();
  });

  it('shows asset code and issuer with explorer link for issued asset', async () => {
    const issuerAddress = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
    vi.spyOn(tokenLib, 'fetchTokenName').mockResolvedValue({ result: `USDC:${issuerAddress}` });

    render(
      <dl>
        <ProgrammeAssetRules tokenAddress="CAAAAAAAAAAABBBBBBBBBBBBCCCCCCCCCCCCDDDDDDDDDDDDEEEEEEEEE" />
      </dl>,
    );

    await waitFor(() => {
      expect(screen.getByText('USDC')).toBeDefined();
    });

    expect(screen.getByText(/Issuer:/i)).toBeDefined();
    expect(screen.getByText(/GBBD47…FLA5/)).toBeDefined();
    // Check that explorer link is present
    const links = screen.getAllByRole('link');
    const hasExplorerLink = links.some((link) =>
      link.getAttribute('href')?.includes(issuerAddress),
    );
    expect(hasExplorerLink).toBe(true);
  });
});
