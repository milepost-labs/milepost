import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from './Modal';

function Opener() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Sign in">
        <button type="button">First action</button>
        <button type="button">Last action</button>
      </Modal>
    </>
  );
}

describe('Modal (issue #252)', () => {
  it('announces itself as a dialog named by its title', () => {
    render(<Opener />);
    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));

    const dialog = screen.getByRole('dialog', { name: 'Sign in' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('moves focus in, traps it, and restores it on close', () => {
    render(<Opener />);
    const opener = screen.getByRole('button', { name: 'Open dialog' });
    opener.focus();
    fireEvent.click(opener);

    const close = screen.getByRole('button', { name: 'Close' });
    // Focus lands inside the dialog on open.
    expect(document.activeElement).toBe(close);

    // Tab off the end wraps to the first control, never to the page behind.
    const last = screen.getByRole('button', { name: 'Last action' });
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    // Shift+Tab off the start wraps to the last control.
    close.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);

    // Closing returns focus to whatever opened the dialog.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('locks background scroll while open and releases it after', () => {
    render(<Opener />);
    expect(document.body.style.overflow).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.body.style.overflow).toBe('');
  });

  it('closes on backdrop click but not while a transaction is busy', () => {
    const onClose = vi.fn();
    const { container, rerender } = render(
      <Modal open onClose={onClose} title="Confirm">
        <p>Body</p>
      </Modal>,
    );
    const backdrop = () => container.querySelector('.ui-modal__backdrop') as HTMLElement;

    fireEvent.click(backdrop());
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <Modal open busy onClose={onClose} title="Confirm">
        <p>Body</p>
      </Modal>,
    );
    fireEvent.click(backdrop());
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
