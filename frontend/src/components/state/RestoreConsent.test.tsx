import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { RestoreConsentHost } from './RestoreConsent';
import { requestRestoreConsent } from '../../lib/restoreConsent';

describe('the restore question', () => {
  it('has nobody to ask when no host is mounted', async () => {
    await expect(requestRestoreConsent(5_000n)).resolves.toBeNull();
  });

  it('shows the restore and its fee, and restores on yes', async () => {
    render(<RestoreConsentHost />);

    let answer!: Promise<boolean | null>;
    act(() => {
      answer = requestRestoreConsent(5_000_000n);
    });

    expect(screen.getByText(/Some of this programme’s data has been archived. Restore it first: about/)).toBeTruthy();
    expect(screen.getByText('0.5 XLM')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Restore, then send' }));

    await expect(answer).resolves.toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sends nothing when declined', async () => {
    render(<RestoreConsentHost />);

    let answer!: Promise<boolean | null>;
    act(() => {
      answer = requestRestoreConsent(5_000n);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Don’t restore' }));

    await expect(answer).resolves.toBe(false);
  });
});
