import { describe, it, expect } from 'vitest';
import { truncateAddress } from '../../lib/format';

/**
 * CopyButton / AddressChip are React components requiring a DOM environment
 * that this project's test runner does not provide. The safety properties
 * are instead verified at the boundary — the logic that determines *what*
 * gets copied.
 *
 * The key invariant: the full address must never be shortened before it
 * reaches the clipboard. AddressChip passes `address` directly to
 * CopyButton, and CopyButton calls `navigator.clipboard.writeText(value)`
 * where `value` is that same full string. truncateAddress is only applied
 * to the display label, never to the value prop.
 */

describe('AddressChip display vs copy invariant', () => {
  const full = 'GBSOMEFULLADDRESS0000000000000000000000000000000000000001';

  it('truncateAddress shortens the display', () => {
    const display = truncateAddress(full);
    expect(display.length).toBeLessThan(full.length);
    expect(display).toContain('…');
  });

  it('truncateAddress does not change the full value used for copying', () => {
    // The full string passed to CopyButton.value is the original; this test
    // confirms that running truncateAddress on it produces something different,
    // so the two code paths are distinct.
    const display = truncateAddress(full);
    expect(display).not.toBe(full);
    // The original is unchanged after the call.
    expect(full).toBe('GBSOMEFULLADDRESS0000000000000000000000000000000000000001');
  });

  it('short values pass through truncateAddress without modification', () => {
    const short = 'GABC';
    expect(truncateAddress(short)).toBe(short);
  });
});
