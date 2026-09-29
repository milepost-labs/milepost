import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { RecipientSignedOut, StandingStats } from './Standing';
import { isTtlLow, standingStats } from '../lib/standing';
import { FIXTURE_STANDING } from '../fixtures/standing';

describe('standing aggregates', () => {
  it('presents counts and totals only, never a list', () => {
    const stats = standingStats(FIXTURE_STANDING);

    expect(stats.map((stat) => stat.label)).toEqual([
      'Programmes that funded you',
      'Total received',
      'Tranches delivered',
    ]);
    expect(stats[1].value).toBe('4,630.00 XLM');
    expect(stats[2].value).toBe('5 of 9');
  });

  it('renders every aggregate figure', () => {
    render(<StandingStats standing={FIXTURE_STANDING} />);

    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('4,630.00 XLM')).toBeTruthy();
    expect(screen.getByText('5 of 9')).toBeTruthy();
  });
});

describe('TTL warning', () => {
  it('warns under 30 days and not at or above', () => {
    expect(isTtlLow(23, false)).toBe(true);
    expect(isTtlLow(30, false)).toBe(false);
    expect(isTtlLow(31, false)).toBe(false);
  });

  it('stops warning once the entry has been extended', () => {
    expect(isTtlLow(FIXTURE_STANDING.liveForDays, true)).toBe(false);
  });

  it('ships a fixture that exercises the warning state', () => {
    expect(FIXTURE_STANDING.liveForDays).toBeLessThan(30);
  });
});

describe('signed-out recipient explainer', () => {
  it('explains what signing in shows and offers a way in', () => {
    const onSignIn = vi.fn();
    render(
      <MemoryRouter>
        <RecipientSignedOut onSignIn={onSignIn} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Sign in to see your awards' })).toBeTruthy();
    expect(screen.getByText('Your standing')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });
});
