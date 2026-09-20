import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import './ui.css';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /**
   * Blocks dismissal by Escape or backdrop click. Use only while a transaction
   * is in flight, where closing would leave someone unsure whether their money
   * moved.
   */
  busy?: boolean;
}

/**
 * A dialog that behaves like one: focus moves in, is trapped while open, and
 * returns to whatever opened it. Escape closes.
 *
 * Every confirmation in this app guards a signature, so a modal that loses
 * focus or cannot be dismissed by keyboard is not a cosmetic problem.
 */
export function Modal({ open, onClose, title, children, footer, busy = false }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);
  const busyRef = useRef(busy);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    busyRef.current = busy;
    onCloseRef.current = onClose;
  }, [busy, onClose]);

  const focusables = useCallback(() => {
    if (!dialogRef.current) return [];
    const elements = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    return elements.filter((el) => {
      return (
        !el.hasAttribute('disabled') &&
        el.getAttribute('aria-hidden') !== 'true' &&
        el.tabIndex !== -1
      );
    });
  }, []);

  useEffect(() => {
    if (!open) return;

    returnFocusTo.current = document.activeElement as HTMLElement | null;

    const initialFocus = () => {
      const items = focusables();
      const first = items[0] ?? dialogRef.current;
      first?.focus();
    };

    initialFocus();
    const timer = requestAnimationFrame(initialFocus);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement;

      if (!dialogRef.current?.contains(active)) {
        event.preventDefault();
        if (event.shiftKey) {
          lastItem.focus();
        } else {
          firstItem.focus();
        }
        return;
      }

      // Wrap at both ends, or focus escapes to the page behind the dialog.
      if (event.shiftKey && (active === firstItem || active === dialogRef.current)) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && active === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      cancelAnimationFrame(timer);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocusTo.current?.focus();
    };
  }, [open, focusables]);

  if (!open) return null;

  return (
    <div
      className="ui-modal__backdrop"
      onClick={() => !busy && onClose()}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className="ui-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="ui-modal__header">
          <h2 className="ui-modal__title">{title}</h2>
          <button
            type="button"
            className="ui-modal__close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <div className="ui-modal__body">{children}</div>
        {footer && <footer className="ui-modal__footer">{footer}</footer>}
      </div>
    </div>
  );
}
