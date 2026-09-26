import { useEffect, useRef, useState } from 'react';

/**
 * Closing behaviour for a `<details>` menu.
 *
 * Native `<details>` is focusable and toggles with Enter and Space for free,
 * but leaves itself open on Escape, on an outside click and after a link is
 * picked, which reads as broken for a menu. This adds those three. Escape
 * returns focus to the trigger so keyboard users are not dropped on the page.
 */
export function useDetailsMenu() {
  const ref = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const details = ref.current;
    if (!details) return;
    const onToggle = () => setOpen(details.open);
    details.addEventListener('toggle', onToggle);
    return () => details.removeEventListener('toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = () => ref.current?.removeAttribute('open');
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      close();
      ref.current?.querySelector('summary')?.focus();
    };
    const onOutsideClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('click', onOutsideClick);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('click', onOutsideClick);
    };
  }, [open]);

  const close = () => ref.current?.removeAttribute('open');
  return { ref, open, close };
}
