import type { ReactNode } from 'react';
import { Check, Clock, Wallet, X } from 'lucide-react';
import type { TransactionPhase } from '../../hooks/useTransaction';
import { txSteps } from '../../lib/txSteps';
import type { Explained } from '../../lib/errors';
import { Button, Receipt, type ReceiptRow } from '../ui';
import { formatExact } from '../../lib/amount';
import { ErrorPanel } from './AsyncStates';
import './AsyncStates.css';

const STEP_ICONS = [Check, Wallet, Clock];

/**
 * A write in flight: a turning ring, what is being sent, and the three steps.
 * Not a live region by default: the caller announces through the shared
 * announcer, so the step list never reads itself out.
 */
export function TxPending({
  title,
  note = 'Approve it in Freighter. Nothing moves until the network confirms.',
  phase,
  children,
}: {
  title: string;
  note?: ReactNode;
  /** When given, the three steps are listed under the note. */
  phase?: TransactionPhase;
  children?: ReactNode;
}) {
  return (
    <div className="state-tx" aria-busy="true">
      <span aria-hidden="true" className="state-ring state-ring--pending" />
      <h3 className="state-tx__title">{title}</h3>
      <p className="state-tx__note">{note}</p>
      {phase && (
        <ol className="state-tx__steps">
          {txSteps(phase).map((step, i) => {
            const Icon = step.state === 'done' ? Check : STEP_ICONS[i];
            return (
              <li key={step.label} className={`state-tx__step state-tx__step--${step.state}`}>
                <Icon aria-hidden="true" />
                {step.label}
                {step.state === 'done' && <span className="visually-hidden"> (done)</span>}
                {step.state === 'current' && <span className="visually-hidden"> (now)</span>}
              </li>
            );
          })}
        </ol>
      )}
      {children}
    </div>
  );
}

/**
 * A write that touches archived data: what the restore costs, and the choice
 * to restore it first or send nothing. Both signatures are the user's.
 */
export function TxRestore({
  feeStroops,
  onRestore,
  onDecline,
}: {
  feeStroops: bigint;
  onRestore: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="state-tx">
      <h3 className="state-tx__title">Restore it first</h3>
      <p className="state-tx__note">
        Some of this programme’s data has been archived. Restore it first: about{' '}
        <span className="numeric">{formatExact(feeStroops)} XLM</span>. Freighter asks you to sign twice, once for the
        restore and once for this transaction.
      </p>
      <div className="state-tx__actions">
        <Button onClick={onRestore}>Restore, then send</Button>
        <Button variant="secondary" onClick={onDecline}>
          Don’t restore
        </Button>
      </div>
    </div>
  );
}

/** A write that landed: a filled ring, what happened to the money, and its receipt. */
export function TxDone({
  title,
  children,
  rows,
  actions,
}: {
  title: string;
  /** One sentence saying what happened to the money. */
  children?: ReactNode;
  rows?: ReceiptRow[];
  actions?: ReactNode;
}) {
  return (
    <div className="state-tx">
      <span aria-hidden="true" className="state-ring state-ring--done">
        <Check />
      </span>
      <h3 className="state-tx__title">{title}</h3>
      {children && <div className="state-tx__note">{children}</div>}
      {rows && rows.length > 0 && <Receipt rows={rows} className="state-tx__receipt" />}
      {actions && <div className="state-tx__actions">{actions}</div>}
    </div>
  );
}

/**
 * A write that did not go through: a crossed ring and the explained error,
 * which says whether anything moved and offers the retry.
 */
export function TxFailed({
  title,
  explained,
  onRetry,
  actions,
}: {
  title: string;
  explained: Explained;
  onRetry?: () => void;
  actions?: ReactNode;
}) {
  return (
    <div className="state-tx state-tx--failed">
      <span aria-hidden="true" className="state-ring state-ring--fail">
        <X />
      </span>
      <h3 className="state-tx__title">{title}</h3>
      <ErrorPanel explained={explained} onRetry={onRetry} live={false} />
      {actions && <div className="state-tx__actions">{actions}</div>}
    </div>
  );
}
