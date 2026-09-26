import type { ReactNode } from 'react';
import { explain, isFailure, type ContractName, type Explained } from '../../lib/errors';
import './AsyncStates.css';

/**
 * Loading, empty and error, kept distinct.
 *
 * Conflating "nothing here yet" with "the request failed" is the actual bug
 * these replace. A new programme legitimately has no applications, and telling
 * someone that looks like a failure teaches them to distrust the screen.
 */

export function Loading({ label = 'Loading', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="state-loading" role="status" aria-live="polite">
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" aria-hidden="true" />
      ))}
    </div>
  );
}

/**
 * `title` should say what would appear here, and `description` why it is
 * empty rather than merely that it is. "No data" tells someone nothing they
 * did not already know. When a filter caused the emptiness, pass
 * `onClearFilters` and the way out is offered.
 */
export function Empty({
  title,
  description,
  icon,
  action,
  onClearFilters,
}: {
  title: string;
  description?: string;
  /** Decorative; hidden from assistive technology. */
  icon?: ReactNode;
  action?: ReactNode;
  onClearFilters?: () => void;
}) {
  return (
    <div className="state-empty">
      {icon && (
        <span className="state-empty__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <p className="state-empty__title">{title}</p>
      {description && <p className="state-empty__description">{description}</p>}
      {(action || onClearFilters) && (
        <div className="state-empty__actions">
          {onClearFilters && (
            <button type="button" className="state-empty__clear" onClick={onClearFilters}>
              Clear filters
            </button>
          )}
          {action}
        </div>
      )}
    </div>
  );
}

/**
 * The one way a failure is shown: the human message from `explain()`, what to
 * do about it, a quiet technical line, and a retry where retrying is sensible.
 *
 * "Nothing was transferred" is only claimed when the contract itself returned
 * the error. A contract error reverts the whole invocation, so that is always
 * true; a network failure mid-submit is not something we can vouch for, so no
 * technical line is shown for it.
 */
export function ErrorPanel({
  explained,
  onRetry,
}: {
  explained: Explained;
  onRetry?: () => void;
}) {
  const technical =
    explained.code !== undefined && explained.contract
      ? `Nothing was transferred · ${explained.contract} error ${explained.code}`
      : null;

  return (
    <div className={`state-error state-error--${explained.kind}`} role="alert">
      <p className="state-error__message">{explained.message}</p>
      {explained.action && <p className="state-error__action">{explained.action}</p>}
      {technical && <p className="state-error__technical numeric">{technical}</p>}
      {onRetry && (
        <button type="button" className="state-error__retry" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/**
 * Renders a caught error through the contract error translations.
 *
 * Some contract "errors" are ordinary answers — no award yet, nothing to refund
 * — so anything the translation marks as `none` is shown as an empty state
 * instead of a failure.
 */
export function ErrorState({
  error,
  contract = 'program',
  onRetry,
}: {
  error: unknown;
  contract?: ContractName;
  onRetry?: () => void;
}) {
  const explained = explain(error, contract);

  if (!isFailure(explained)) {
    return <Empty title={explained.message} description={explained.action} />;
  }

  return <ErrorPanel explained={explained} onRetry={onRetry} />;
}

export interface AsyncViewProps<T> {
  loading: boolean;
  error: unknown;
  data: T | null | undefined;
  contract?: ContractName;
  onRetry?: () => void;
  empty?: { title: string; description?: string; action?: ReactNode };
  children: (data: T) => ReactNode;
}

/**
 * One place that decides which state a panel is in, so every screen resolves
 * them in the same order rather than each inventing its own precedence.
 */
export function AsyncView<T>({
  loading,
  error,
  data,
  contract,
  onRetry,
  empty,
  children,
}: AsyncViewProps<T>) {
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} contract={contract} onRetry={onRetry} />;
  if (data === null || data === undefined) {
    return empty ? <Empty {...empty} /> : <Empty title="Nothing here yet" />;
  }
  return <>{children(data)}</>;
}

/**
 * Confirmation that something worked.
 *
 * Loading, empty and error were covered; success was not, so every write screen
 * would have invented its own. A transaction that succeeds silently is
 * indistinguishable from one that did nothing, and on a screen that moves money
 * that is the difference between confidence and a support request.
 *
 * `role="status"` announces it without stealing focus.
 */
export function Success({
  title,
  description,
  action,
  onDismiss,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div className="state-success" role="status" aria-live="polite">
      <div className="state-success__text">
        <p className="state-success__title">{title}</p>
        {description && <p className="state-success__description">{description}</p>}
      </div>
      {action}
      {onDismiss && (
        <button type="button" className="state-success__dismiss" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}

/**
 * The full outcome of a write, driven by `useTransaction`.
 *
 * Renders nothing while idle, the failure when it fails, and the confirmation
 * when it succeeds — so a screen wires one component rather than three
 * conditionals it has to keep consistent with the others.
 */
export function TransactionOutcome({
  phase,
  error,
  successTitle,
  successDescription,
  onDismiss,
  onRetry,
}: {
  phase: string;
  error: Explained | null;
  successTitle: string;
  successDescription?: ReactNode;
  onDismiss?: () => void;
  /** Offer only where sending the same transaction again makes sense. */
  onRetry?: () => void;
}) {
  if (error) return <ErrorPanel explained={error} onRetry={onRetry} />;
  if (phase === 'success') {
    return <Success title={successTitle} description={successDescription} onDismiss={onDismiss} />;
  }
  return null;
}
