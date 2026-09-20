import type { ReactNode } from 'react';
import { explain, isFailure, type ContractName } from '../../lib/errors';
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
 * `title` should say what would appear here, and `action` the one thing that
 * makes it appear. "No data" tells someone nothing they did not already know.
 */
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="state-empty">
      <p className="state-empty__title">{title}</p>
      {description && <p className="state-empty__description">{description}</p>}
      {action}
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

  return (
    <div className={`state-error state-error--${explained.kind}`} role="alert">
      <p className="state-error__message">{explained.message}</p>
      {explained.action && <p className="state-error__action">{explained.action}</p>}
      {onRetry && (
        <button type="button" className="state-error__retry" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
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
}: {
  phase: string;
  error: { message: string; action?: string; kind: string } | null;
  successTitle: string;
  successDescription?: ReactNode;
  onDismiss?: () => void;
}) {
  if (error) {
    return (
      <div className={`state-error state-error--${error.kind}`} role="alert">
        <p className="state-error__message">{error.message}</p>
        {error.action && <p className="state-error__action">{error.action}</p>}
      </div>
    );
  }
  if (phase === 'success') {
    return <Success title={successTitle} description={successDescription} onDismiss={onDismiss} />;
  }
  return null;
}
