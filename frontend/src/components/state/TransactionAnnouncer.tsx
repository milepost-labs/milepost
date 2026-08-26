import { useEffect, useRef, useState } from 'react';
import { _bindAnnouncer } from './announce';

/**
 * Mount the live region in the tree. Render this once near the app root.
 *
 * Components push messages via `announce(message)` from ./announce.
 */
export function TransactionAnnouncer() {
  const [message, setMessage] = useState('');
  const frameRef = useRef(0);

  useEffect(() => {
    _bindAnnouncer((text: string) => {
      // Clear first so the same message re-announces.
      setMessage('');
      cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => setMessage(text));
    });
    return () => {
      _bindAnnouncer(() => {});
      cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="visually-hidden"
    >
      {message}
    </div>
  );
}
