import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MoneyPath } from './MoneyPath';
import { ModesCompared } from './ModesCompared';

describe('MoneyPath', () => {
  it('moves between steps with the arrow keys and keeps one tab stop', () => {
    render(<MoneyPath />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(7);
    expect(tabs.filter((t) => t.tabIndex === 0)).toHaveLength(1);

    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tabs[1]);

    fireEvent.keyDown(tabs[1], { key: 'End' });
    expect(tabs[6].getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(tabs[6], { key: 'ArrowRight' });
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
  });

  it('marks exactly the three steps where money moves', () => {
    render(<MoneyPath />);
    const moving = screen.getAllByRole('tab').filter((t) => /money moves/.test(t.textContent ?? ''));
    expect(moving.map((t) => t.textContent?.replace(/\d|, money moves/g, ''))).toEqual([
      'Contribute',
      'Release',
      'Spend',
    ]);
  });
});

describe('ModesCompared', () => {
  it('shows all four modes, with Allocated as the strongest', () => {
    render(<ModesCompared />);
    const names = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(names).toEqual(['Direct', 'Allocated', 'Restricted', 'Open']);

    const allocated = screen.getByRole('heading', { name: 'Allocated' }).closest('li')!;
    expect(within(allocated).getByText('Strongest guarantee')).toBeTruthy();
  });
});
