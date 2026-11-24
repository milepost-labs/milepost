import type { ReactNode } from 'react';
import { CircleCheck, Info, Lock, TriangleAlert } from 'lucide-react';
import './ui.css';

export type NoticeTone = 'info' | 'warn' | 'risk' | 'ok';

export interface NoticeProps {
  tone?: NoticeTone;
  children: ReactNode;
  /**
   * `status` for something that changed while the page was open (a stale
   * index, a confirmation); `note` for standing advice. Omit for plain text.
   */
  role?: 'status' | 'note' | 'alert';
  className?: string;
}

const ICONS = { info: Info, warn: TriangleAlert, risk: TriangleAlert, ok: CircleCheck };

/**
 * A sentence the reader should not miss, on a tinted ground with an icon.
 * `info` is neutral advice, `warn` is the signal yellow (stale, paused),
 * `risk` is a stated limit or danger, `ok` confirms. Lead with a bold phrase.
 */
export function Notice({ tone = 'info', children, role, className = '' }: NoticeProps) {
  const Icon = ICONS[tone];
  return (
    <div className={`ui-notice ui-notice--${tone} ${className}`.trim()} role={role}>
      <Icon aria-hidden="true" />
      <div className="ui-notice__body">{children}</div>
    </div>
  );
}

/**
 * Why an action is unavailable, shown under its disabled control. Give it an
 * `id` and point the control's `aria-describedby` at it.
 */
export function DisabledReason({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p className="ui-disabled-reason" id={id}>
      <Lock aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
