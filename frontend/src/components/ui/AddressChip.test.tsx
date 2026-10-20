import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AddressChip } from './AddressChip';
import { truncateAddress } from '../../lib/format';

/**
 * Addresses are how people check who they are paying. The chip must show a
 * shortened form that is still distinguishable, hand assistive technology the
 * full value, and link to the correct explorer page — account or contract,
 * testnet or mainnet. A bug here shows someone the wrong address or sends them
 * to the wrong account page.
 */

const ACCOUNT = 'GAH3D4RM45ETE4W7VDRCWZBPRPT63CJXAGXFYVBC2FGANBZTS4OTKXCA';
const CONTRACT = 'CD236SGR4CHW3N5WA5REW7CDLCS4ZLDEX6JVEAIHZK7NSN4W7WD7YDAL';

describe('AddressChip', () => {
  it('shows the shortened form and exposes the full address to assistive tech', () => {
    render(<AddressChip address={ACCOUNT} />);

    const shortened = screen.getByText(truncateAddress(ACCOUNT));
    expect(shortened.getAttribute('aria-hidden')).toBe('true');

    const full = screen.getByText(ACCOUNT);
    expect(full.className).toContain('visually-hidden');

    // The title remains the full value for a mouse hover, too.
    expect(screen.getByTitle(ACCOUNT)).toBeTruthy();
  });

  it('honours custom lead and tail lengths', () => {
    render(<AddressChip address={CONTRACT} lead={4} tail={3} />);

    expect(screen.getByText(truncateAddress(CONTRACT, 4, 3))).toBeTruthy();
    expect(truncateAddress(CONTRACT, 4, 3)).not.toBe(truncateAddress(CONTRACT));
  });

  it('leaves a value shorter than the truncation untouched', () => {
    render(<AddressChip address="GABC" />);

    // Both the visible code and the assistive-tech copy carry the same short
    // value, so exactly two nodes hold it.
    expect(screen.getAllByText('GABC')).toHaveLength(2);
  });

  it('labels the copy button with the full address and a sensible default', () => {
    const { rerender } = render(<AddressChip address={ACCOUNT} />);
    expect(screen.getByRole('button', { name: 'Copy address' })).toBeTruthy();

    rerender(<AddressChip address={ACCOUNT} copyLabel="Copy treasury address" />);
    expect(screen.getByRole('button', { name: 'Copy treasury address' })).toBeTruthy();
  });

  it('renders the registry verdict only when one is supplied', () => {
    const { rerender } = render(<AddressChip address={CONTRACT} />);
    expect(screen.queryByText('Registry-deployed')).toBeNull();
    expect(screen.queryByText('Not registry-deployed')).toBeNull();

    rerender(<AddressChip address={CONTRACT} verified />);
    expect(screen.getByText('Registry-deployed')).toBeTruthy();

    rerender(<AddressChip address={CONTRACT} verified={false} />);
    expect(screen.getByText('Not registry-deployed')).toBeTruthy();
  });

  it('links an account to its testnet page', () => {
    render(<AddressChip address={ACCOUNT} showExplorerLink />);

    const link = screen.getByRole('link', { name: 'View account on Stellar Expert' });
    expect(link.getAttribute('href')).toBe(
      `https://stellar.expert/explorer/testnet/account/${ACCOUNT}`,
    );
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noreferrer');
  });

  it('links a contract to its testnet page', () => {
    render(<AddressChip address={CONTRACT} showExplorerLink />);

    expect(
      screen.getByRole('link', { name: 'View contract on Stellar Expert' }).getAttribute('href'),
    ).toBe(`https://stellar.expert/explorer/testnet/contract/${CONTRACT}`);
  });

  it('links a contract to its mainnet page', () => {
    render(<AddressChip address={CONTRACT} showExplorerLink network="PUBLIC" />);

    const link = screen.getByRole('link', { name: 'View contract on Stellar Expert' });
    expect(link.getAttribute('href')).toBe(
      `https://stellar.expert/explorer/public/contract/${CONTRACT}`,
    );
  });

  it('treats a network string without "testnet" as mainnet', () => {
    render(<AddressChip address={ACCOUNT} showExplorerLink network="mainnet" />);

    expect(
      screen.getByRole('link', { name: 'View account on Stellar Expert' }).getAttribute('href'),
    ).toContain('/explorer/public/account/');
  });

  it('renders no explorer link unless asked', () => {
    render(<AddressChip address={ACCOUNT} />);

    expect(screen.queryByRole('link')).toBeNull();
  });
});
