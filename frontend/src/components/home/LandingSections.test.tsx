import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MoneyPath } from './MoneyPath';
import { ModesCompared } from './ModesCompared';

// Issue #483: the step is announced through the shared announcer, so the tests
// assert on what it was told instead of on a per-screen live region.
const announce = vi.hoisted(() => vi.fn());
vi.mock('../../context/useAnnouncer', () => ({ useAnnouncer: () => announce }));

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

// Issue #483 — each step change is announced once, with the title and what
// money moved, while focus stays on the control that was pressed.
describe('MoneyPath announcements', () => {
  beforeEach(() => {
    announce.mockClear();
  });

  it('says nothing on load, and nothing when the selected step is pressed again', () => {
    render(<MoneyPath />);
    expect(announce).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('tab')[0]);
    expect(announce).not.toHaveBeenCalled();
  });

  it('announces each step change exactly once, with what money moved', () => {
    render(<MoneyPath />);
    const next = screen.getByRole('button', { name: /Next step/ });

    fireEvent.click(next);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Step 2, Apply: no money moves');

    fireEvent.click(next);
    expect(announce).toHaveBeenCalledTimes(2);
    expect(announce).toHaveBeenCalledWith('Step 3, Review: no money moves');

    // Focus never left the control that was pressed.
    expect(document.activeElement).toBe(next);
  });

  it('announces the money on the three steps where it moves', () => {
    render(<MoneyPath />);
    const tabs = screen.getAllByRole('tab');

    fireEvent.click(tabs[0]);
    expect(announce).toHaveBeenCalledWith('Step 1, Contribute: 10,000 USDC contributed to the budget');

    fireEvent.click(tabs[5]);
    expect(announce).toHaveBeenCalledWith('Step 6, Release: 2,500 USDC released to the recipient');

    fireEvent.click(tabs[6]);
    expect(announce).toHaveBeenCalledWith('Step 7, Spend: 2,500 USDC paid to a verified payee');
  });

  it('announces arrow-key steps too, and takes focus with them', () => {
    render(<MoneyPath />);
    const tabs = screen.getAllByRole('tab');
    tabs[0].focus();

    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Step 2, Apply: no money moves');
    expect(document.activeElement).toBe(tabs[1]);

    // Wrapping from the last step back to the first is still one announcement.
    fireEvent.keyDown(tabs[1], { key: 'End' });
    fireEvent.keyDown(tabs[6], { key: 'ArrowRight' });
    expect(announce).toHaveBeenCalledTimes(3);
    expect(announce).toHaveBeenLastCalledWith('Step 1, Contribute: 10,000 USDC contributed to the budget');
  });

  it('brings no live region of its own — the shared announcer speaks', () => {
    const { container } = render(<MoneyPath />);
    expect(container.querySelectorAll('[aria-live]').length).toBe(0);
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
