import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TermsTab } from './TermsTab';

const BASE_PROPS = {
  programmeId: 'CBJWECZ3EUVNAE73YIMT2KWWNRHRF7NNWVKOLQRVOHSKYRYE32XBRPW7',
  asset: 'XLM',
};

function renderTab(props: Partial<Parameters<typeof TermsTab>[0]> = {}) {
  return render(
    <MemoryRouter>
      <TermsTab {...BASE_PROPS} {...props} />
    </MemoryRouter>,
  );
}

describe('TermsTab — minimum award', () => {
  it('shows the formatted amount and explanation when minimumAward is non-zero', () => {
    // 50 XLM = 500_000_000 stroops
    renderTab({ minimumAward: 500_000_000n });

    expect(screen.getByText('Minimum award')).toBeTruthy();
    expect(screen.getByText('50.00 XLM')).toBeTruthy();
    expect(screen.getByText(/awards below this amount cannot be finalised/i)).toBeTruthy();
  });

  it('shows "No minimum" and no explanation when minimumAward is zero', () => {
    renderTab({ minimumAward: 0n });

    expect(screen.getByText('Minimum award')).toBeTruthy();
    expect(screen.getByText('No minimum')).toBeTruthy();
    expect(screen.queryByText(/cannot be finalised/i)).toBeNull();
  });

  it('shows "No minimum" when minimumAward is omitted', () => {
    renderTab();

    expect(screen.getByText('No minimum')).toBeTruthy();
  });

  it('uses the asset label in the formatted amount', () => {
    // 10 USDC = 100_000_000 stroops
    renderTab({ asset: 'USDC', minimumAward: 100_000_000n });

    expect(screen.getByText('10.00 USDC')).toBeTruthy();
  });

  it('the row is a dt/dd pair inside a dl for accessible structure', () => {
    renderTab({ minimumAward: 500_000_000n });

    const dt = screen.getByText('Minimum award');
    expect(dt.tagName).toBe('DT');

    // The dd contains the value span
    const dd = dt.closest('.terms-tab__row')?.querySelector('dd');
    expect(dd).toBeTruthy();
    expect(dd?.textContent).toContain('50.00 XLM');
  });
});
