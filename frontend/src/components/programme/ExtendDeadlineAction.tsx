import { useState } from 'react';
import { useContractResult, useAnnounceTransaction, useTransaction } from '../../hooks';
import { explain, type CodeOverrides } from '../../lib/errors';
import { creatorSendable } from '../../lib/creatorTx';
import { Button, DateField, Deadline } from '../ui';
import { TxSheet } from '../state/TxSheet';
import { CreatorActionRow } from './CreatorActionRow';
import type { CreatorContext } from './CreatorActions';

/**
 * In this call, 25 (`RefundsNotOpen`) means the window to extend has closed,
 * not anything about refunds; 4 means the new date was not later.
 */
const EXTEND_ERRORS: CodeOverrides = {
  4: {
    kind: 'invalid',
    message: 'The new release deadline must be later than the current one.',
    action: 'Pick a later date and time.',
  },
  25: {
    kind: 'blocked',
    message: 'The release window has already closed.',
    action: 'The release deadline can only be extended before it passes.',
  },
};

/** Unix seconds for `datetime-local` come in whole minutes, so the minimum is the next minute. */
const MIN_STEP_SECONDS = 60;

/**
 * Extend the release deadline, when recipients need longer to reach their
 * mileposts. Only forward, and only before the deadline passes; if the new
 * date is past the sweep deadline the contract moves the sweep deadline too,
 * so the form says so, and to when, before anything is signed.
 */
export function ExtendDeadlineAction({ client, phase, verified, onChanged }: CreatorContext) {
  const config = useContractResult(() => client.get_config(), [client]);
  const [editing, setEditing] = useState(false);
  const [next, setNext] = useState<number | null>(null);
  // Fixed when the sheet opens, so the receipt describes what was sent even
  // after the config refetches.
  const [sent, setSent] = useState<{ release: number; sweep: number; sweepMoved: boolean } | null>(null);
  const [open, setOpen] = useState(false);

  const tx = useTransaction<true>({
    contract: 'program',
    overrides: EXTEND_ERRORS,
    onSuccess: () => {
      config.refetch();
      onChanged();
    },
  });

  useAnnounceTransaction({
    phase: tx.phase,
    error: tx.error,
    pending: 'Extending the release deadline…',
    success: 'Release deadline extended.',
  });

  const release = config.data ? Number(config.data.release_deadline) : null;
  const sweep = config.data ? Number(config.data.sweep_deadline) : null;
  const closed = release !== null && Date.now() / 1000 >= release;

  let reason: string | null = null;
  if (verified !== true) {
    reason = 'Writes are blocked until this programme is confirmed as deployed by the Milepost registry.';
  } else if (config.error) {
    reason = `Could not read the programme’s deadlines. ${explain(config.error).message}`;
  } else if (release === null || phase === null) {
    reason = 'Reading the programme’s deadlines…';
  } else if (phase === 'Cancelled') {
    reason = 'This programme is cancelled. Refunds are already open, so there is no release window to extend.';
  } else if (closed) {
    reason = 'The release window has already closed, so the deadline can no longer be extended.';
  }
  const enabled = reason === null;

  const tooEarly = next !== null && release !== null && next <= release;
  const sweepMoves = next !== null && sweep !== null && next > sweep;
  const ready = next !== null && !tooEarly && release !== null && sweep !== null;

  const build = (value: number) => async () =>
    creatorSendable(await client.extend_release_deadline({ new_release_deadline: BigInt(value) }));

  const review = () => {
    if (!ready || next === null || sweep === null) return;
    setSent({ release: next, sweep: sweepMoves ? next : sweep, sweepMoved: sweepMoves });
    setOpen(true);
    void tx.prepare(build(next));
  };

  const close = () => {
    if (tx.busy) return;
    const done = tx.phase === 'success';
    tx.reset();
    setOpen(false);
    if (done) {
      setEditing(false);
      setNext(null);
    }
  };

  return (
    <>
      <CreatorActionRow
        id="extend"
        label="Extend release deadline"
        summary="Give recipients longer to reach their mileposts."
        button={editing ? 'Close' : 'Extend'}
        enabled={enabled}
        reason={reason ?? undefined}
        onClick={() => setEditing((value) => !value)}
      >
        {enabled && editing && release !== null && sweep !== null && (
          <div className="programme-action__form">
            <p className="programme-action__current">
              Release deadline <Deadline unixSeconds={release} />
            </p>
            <p className="programme-action__current">
              Sweep deadline <Deadline unixSeconds={sweep} />
            </p>
            <DateField
              label="New release deadline"
              hint="Must be later than the current release deadline."
              value={next}
              onChange={setNext}
              min={release + MIN_STEP_SECONDS}
              error={tooEarly ? 'Pick a date and time later than the current release deadline.' : null}
              required
            />
            {sweepMoves && next !== null && (
              <p className="programme-action__current" role="status">
                This is after the sweep deadline, so the sweep deadline moves too, to{' '}
                <Deadline unixSeconds={next} />.
              </p>
            )}
            <Button size="sm" onClick={review} disabled={!ready}>
              Review extension
            </Button>
          </div>
        )}
      </CreatorActionRow>
      <TxSheet
        open={open}
        onClose={close}
        tx={tx}
        eyebrow="Creator"
        confirmTitle="Extend the release deadline?"
        confirmText={
          sent && release !== null ? (
            <>
              <p>
                The release deadline moves from <Deadline unixSeconds={release} /> to{' '}
                <Deadline unixSeconds={sent.release} />. Refunds open later by the same amount.
              </p>
              {sent.sweepMoved && (
                <p>
                  The new date is after the sweep deadline, so the sweep deadline moves too, to{' '}
                  <Deadline unixSeconds={sent.sweep} />.
                </p>
              )}
              <p>An extension cannot be shortened afterwards.</p>
            </>
          ) : undefined
        }
        confirmLabel="Sign and extend"
        pendingTitle="Extending the release deadline"
        doneTitle="Release deadline extended"
        doneText={
          sent?.sweepMoved
            ? 'Recipients have longer to reach their mileposts, and the sweep deadline moved with it.'
            : 'Recipients have longer to reach their mileposts.'
        }
        doneRows={
          sent
            ? [
                { label: 'Release deadline', value: <Deadline unixSeconds={sent.release} /> },
                { label: 'Sweep deadline', value: <Deadline unixSeconds={sent.sweep} /> },
              ]
            : undefined
        }
        failTitle="Deadline not extended"
        onRetry={() => {
          if (sent) void tx.prepare(build(sent.release));
        }}
      />
    </>
  );
}
