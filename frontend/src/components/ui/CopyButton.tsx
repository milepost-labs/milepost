import { useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';

/**
 * Copies a value to the clipboard and briefly shows confirmation.
 *
 * `navigator.clipboard` requires a secure context and may be denied by
 * permissions. Neither case is fatal — the user simply does not see the
 * confirmation tick, and the copy attempt is silent. The full value is
 * always what gets copied, never a truncated display form.
 */

export interface CopyButtonProps {
  /** The full value to copy — never the truncated display. */
  value: string;
  /** Accessible label, e.g. "Copy address" or "Copy transaction hash". */
  label?: string;
}

export function CopyButton({ value, label = 'Copy' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (insecure context, permission denied, etc.).
      // Fail silently — the user's existing manual copy path still works.
    }
  }, [value]);

  return (
    <button
      type="button"
      className={`copy-button${copied ? ' copy-button--copied' : ''}`}
      onClick={handleCopy}
      aria-label={copied ? 'Copied!' : label}
      title={copied ? 'Copied!' : label}
    >
      {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
    </button>
  );
}
