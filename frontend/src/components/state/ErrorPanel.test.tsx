import { describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Empty, ErrorState } from './AsyncStates';

// The error panel reads the current route for its copied details.
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: MemoryRouter });

describe('error panel', () => {
  it('says nothing was transferred when the contract returned the error', () => {
    render(<ErrorState error={new Error('HostError: Error(Contract, #2)')} contract="program" />);
    expect(screen.getByRole('alert').textContent).toContain('Nothing was transferred · program error 2');
  });

  it('makes no transfer claim for a failure the contract did not return', () => {
    render(<ErrorState error={new Error('Failed to fetch')} />);
    expect(screen.getByRole('alert').textContent).not.toContain('Nothing was transferred');
  });

  it('offers a retry only when one is passed', () => {
    const onRetry = vi.fn();
    const { rerender } = render(<ErrorState error={new Error('Failed to fetch')} />);
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    rerender(<ErrorState error={new Error('Failed to fetch')} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe('empty state', () => {
  it('offers clearing when a filter caused it', () => {
    const onClear = vi.fn();
    render(<Empty title="No open programmes" description="The Open filter hides the rest." onClearFilters={onClear} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});
