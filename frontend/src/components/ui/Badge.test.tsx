import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PhaseBadge, ModePill, SampleTag } from './Badge';

// Every phase and every mode the two components render. 'Open' is in both on
// purpose: a programme phase, and a payout mode with no escrow or payee limit.
const FIXTURE_PHASES = ['Open', 'Review', 'Settled', 'Cancelled'] as const;
const FIXTURE_MODES = ['Direct', 'Allocated', 'Restricted', 'Open'] as const;

describe('PhaseBadge', () => {
  it.each(FIXTURE_PHASES)('renders %s with its own phase class', (phase) => {
    render(<PhaseBadge phase={phase} />);

    const badge = screen.getByText(phase);
    expect(badge.className).toContain(`ui-badge--phase-${phase.toLowerCase()}`);
  });

  it('gives each of the four phases a distinct class, not shared tones', () => {
    const classes = FIXTURE_PHASES.map((phase) => {
      const { unmount } = render(<PhaseBadge phase={phase} />);
      const cls = screen.getByText(phase).className;
      unmount();
      return cls;
    });

    expect(new Set(classes).size).toBe(4);
  });

  it('falls back to a neutral class for an unrecognised phase, without losing the text', () => {
    render(<PhaseBadge phase="Unknown" />);

    const badge = screen.getByText('Unknown');
    expect(badge.className).toContain('ui-badge--neutral');
  });

  it('carries meaning as visible text, not colour alone', () => {
    render(<PhaseBadge phase="Cancelled" />);
    expect(screen.getByText('Cancelled')).toBeTruthy();
  });
});

describe('ModePill', () => {
  it.each(FIXTURE_MODES)('renders all four modes, including %s', (mode) => {
    render(<ModePill mode={mode} />);
    expect(screen.getByText(mode).className).toBe('ui-mode-pill');
  });

  it('stays flat and uncoloured regardless of which mode', () => {
    const classes = FIXTURE_MODES.map((mode) => {
      const { unmount } = render(<ModePill mode={mode} />);
      const cls = screen.getByText(mode).className;
      unmount();
      return cls;
    });

    expect(new Set(classes).size).toBe(1);
    expect(classes[0]).toBe('ui-mode-pill');
  });

  it('distinguishes an "Open" mode from an "Open" phase for screen readers', () => {
    render(<ModePill mode="Open" />);
    expect(screen.getByText('Open').textContent).toBe('Open mode, simplest, unchecked');
  });

  it('ranks the four modes on its meter, Allocated strongest', () => {
    const filled = (mode: string) => {
      const { container, unmount } = render(<ModePill mode={mode} />);
      const meter = container.querySelector('.ui-mode-pill__meter') as HTMLElement;
      expect(meter.getAttribute('aria-hidden')).toBe('true');
      const count = meter.querySelectorAll('.is-filled').length;
      unmount();
      return count;
    };
    expect(['Allocated', 'Direct', 'Restricted', 'Open'].map(filled)).toEqual([4, 3, 2, 1]);
  });

  it('shows a mode it does not know without a meter', () => {
    const { container } = render(<ModePill mode="Escrowed" />);
    expect(container.querySelector('.ui-mode-pill__meter')).toBeNull();
    expect(screen.getByText('Escrowed').textContent).toBe('Escrowed mode');
  });
});

describe('SampleTag', () => {
  it('says "Sample data" unless given other words', () => {
    const { unmount } = render(<SampleTag />);
    expect(screen.getByText('Sample data').className).toBe('ui-sample-tag');
    unmount();
    render(<SampleTag>Sample chain read</SampleTag>);
    expect(screen.getByText('Sample chain read')).toBeTruthy();
  });
});
