import type { ReactNode } from 'react';
import { DisabledReason } from '../ui';

export interface CreatorActionRowProps {
  /** Stable key, used to link the button to its reason. */
  id: string;
  label: string;
  /** One line under the label saying what the action does. */
  summary: string;
  button: string;
  variant?: 'secondary' | 'danger';
  /** When false the button stays focusable and `reason` says why. */
  enabled: boolean;
  /** Why it is unavailable, or what will happen when it is. */
  reason?: ReactNode;
  onClick: () => void;
  /** An inline form the action opens beneath its row. */
  children?: ReactNode;
}

/**
 * One action in the programme page's Creator group.
 *
 * Same markup as the rows above it: an unavailable action keeps its place in
 * the tab order (`aria-disabled`, not `disabled`) and its reason is read with
 * the button, rather than the action silently disappearing.
 */
export function CreatorActionRow({
  id,
  label,
  summary,
  button,
  variant = 'secondary',
  enabled,
  reason,
  onClick,
  children,
}: CreatorActionRowProps) {
  const reasonId = `creator-action-why-${id}`;
  return (
    <li className="programme-action">
      <div className="programme-action__row">
        <span className="programme-action__text">
          <span className="programme-action__label">{label}</span>
          <span className="programme-action__who">{summary}</span>
        </span>
        <button
          type="button"
          className={`ui-button ui-button--${enabled ? variant : 'secondary'} ui-button--sm`}
          aria-disabled={enabled ? undefined : true}
          aria-describedby={reason ? reasonId : undefined}
          onClick={enabled ? onClick : undefined}
        >
          {button}
        </button>
      </div>
      {reason &&
        (enabled ? (
          <p id={reasonId} className="programme-action__reason">
            {reason}
          </p>
        ) : (
          <DisabledReason id={reasonId}>{reason}</DisabledReason>
        ))}
      {children}
    </li>
  );
}
