import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AddressChip } from './AddressChip';

// Fixed, obviously valid test addresses (RFC 4648 / Stellar strkey format). Never real private keys.
const TEST_ACCOUNT = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';
const TEST_CONTRACT = 'CA3D5KRYMCMCZVACQ3VOXBDO3A5WJWFKPXGAAJTCGS2OBDXAQXX35777';

describe('AddressChip component', () => {
  let originalClipboard: Clipboard;

  beforeEach(() => {
    originalClipboard = navigator.clipboard;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
      writable: true,
    });
  });

  it('renders the shortened text shown to the eye with exact format (lead=6, tail=4 by default)', () => {
    render(<AddressChip address={TEST_ACCOUNT} />);

    // Default lead is 6 ("GBRPYH") and tail is 4 ("OX2H")
    const expectedDisplay = `${TEST_ACCOUNT.slice(0, 6)}…${TEST_ACCOUNT.slice(-4)}`;
    expect(expectedDisplay).toBe('GBRPYH…OX2H');

    const codeEl = screen.getByText(expectedDisplay);
    expect(codeEl).toBeTruthy();
    expect(codeEl.tagName.toLowerCase()).toBe('code');
    expect(codeEl.className).toBe('address-chip__text');
  });

  it('supports custom lead and tail lengths for truncation', () => {
    render(<AddressChip address={TEST_ACCOUNT} lead={8} tail={6} />);

    const expectedDisplay = `${TEST_ACCOUNT.slice(0, 8)}…${TEST_ACCOUNT.slice(-6)}`;
    expect(expectedDisplay).toBe('GBRPYHIL…C7OX2H');
    expect(screen.getByText(expectedDisplay)).toBeTruthy();
  });

  it('exposes the FULL address to assistive technology via title attribute', () => {
    render(<AddressChip address={TEST_ACCOUNT} />);

    // Outer container has title attribute containing the full untruncated address
    const chip = screen.getByTitle(TEST_ACCOUNT);
    expect(chip).toBeTruthy();
    expect(chip.className).toContain('address-chip');
  });

  it('copies the FULL address to clipboard on click, not the shortened display', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    });

    render(<AddressChip address={TEST_ACCOUNT} copyLabel="Copy account address" />);

    const copyBtn = screen.getByRole('button', { name: 'Copy account address' });
    fireEvent.click(copyBtn);

    // Invariant: navigator.clipboard.writeText must receive the FULL address
    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledTimes(1);
      expect(writeTextMock).toHaveBeenCalledWith(TEST_ACCOUNT);
    });

    // Visible feedback: button accessible name changes to Copied! and status role updates
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copied!' })).toBeTruthy();
      expect(screen.getByRole('status').textContent).toBe('Copied to clipboard');
    });
  });

  it('fails gracefully without throwing when clipboard write is rejected', async () => {
    const writeTextMock = vi.fn().mockRejectedValue(new Error('Permission denied'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    });

    render(<AddressChip address={TEST_ACCOUNT} copyLabel="Copy address" />);

    const copyBtn = screen.getByRole('button', { name: 'Copy address' });
    expect(() => fireEvent.click(copyBtn)).not.toThrow();

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(TEST_ACCOUNT);
    });

    // Button label remains unmutated since write failed
    expect(screen.getByRole('button', { name: 'Copy address' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('renders explorer link for account address with correct href and attributes', () => {
    render(<AddressChip address={TEST_ACCOUNT} showExplorerLink />);

    const link = screen.getByRole('link', { name: 'View account on Stellar Expert' });
    expect(link.getAttribute('href')).toBe(`https://stellar.expert/explorer/testnet/account/${TEST_ACCOUNT}`);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noreferrer');
    expect(link.getAttribute('title')).toBe('View on Stellar Expert');
  });

  it('renders explorer link for contract address with correct contract URL and label', () => {
    render(<AddressChip address={TEST_CONTRACT} showExplorerLink network="PUBLIC" />);

    const link = screen.getByRole('link', { name: 'View contract on Stellar Expert' });
    expect(link.getAttribute('href')).toBe(`https://stellar.expert/explorer/public/contract/${TEST_CONTRACT}`);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noreferrer');
  });

  it('omits the explorer link when showExplorerLink is false or omitted', () => {
    render(<AddressChip address={TEST_ACCOUNT} />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renders verification badge for verified registry programmes', () => {
    render(<AddressChip address={TEST_CONTRACT} verified={true} />);

    expect(screen.getByText('Registry-deployed')).toBeTruthy();
    expect(screen.getByTitle(/The Milepost registry deployed this programme/)).toBeTruthy();
  });

  it('renders verification badge for unverified addresses', () => {
    render(<AddressChip address={TEST_CONTRACT} verified={false} />);

    expect(screen.getByText('Not registry-deployed')).toBeTruthy();
    expect(screen.getByTitle(/This address was not deployed by the Milepost registry/)).toBeTruthy();
  });

  it('handles invalid addresses gracefully without throwing', () => {
    const invalidShort = 'invalid';
    expect(() => render(<AddressChip address={invalidShort} />)).not.toThrow();

    // Short invalid address is not truncated since length <= lead + tail + 1
    expect(screen.getByText(invalidShort)).toBeTruthy();
    expect(screen.getByTitle(invalidShort)).toBeTruthy();

    // Empty string
    expect(() => render(<AddressChip address="" />)).not.toThrow();
  });
});
