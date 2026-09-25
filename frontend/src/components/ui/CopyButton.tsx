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
  /** Shows "Copy"/"Copied" as visible text next to the icon, for a button
   * that stands alone rather than sitting inline next to other text. */
  showLabel?: boolean;
}

export function CopyButton({ value, label = 'Copy', showLabel = false }: CopyButtonProps) {
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
    // aria-label mutation on the button alone is not reliably announced —
    // a visually-hidden live region is what actually gets read out.
    <span className="copy-button-wrap">
      <button
        type="button"
        className={`copy-button${copied ? ' copy-button--copied' : ''}${showLabel ? ' copy-button--labelled' : ''}`}
        onClick={handleCopy}
        aria-label={copied ? 'Copied!' : label}
        title={copied ? 'Copied!' : label}
      >
        {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        {showLabel && <span aria-hidden="true">{copied ? 'Copied' : 'Copy'}</span>}
      </button>
      <span role="status" className="visually-hidden">
        {copied ? 'Copied to clipboard' : ''}
      </span>
    </span>
  );
}
