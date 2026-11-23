import { useState } from 'react';
import { useContractRead, useAnnounceTransaction, useTransaction } from '../../hooks';
import { explain } from '../../lib/errors';
import { forgetPaused } from '../../lib/paused';
import { creatorSendable } from '../../lib/creatorTx';
import { TxSheet } from '../state/TxSheet';
import { CreatorActionRow } from './CreatorActionRow';
import type { CreatorContext } from './CreatorActions';

/**
 * Pause or resume the programme: the creator's emergency brake.
 *
 * Pausing is reversible and leaves refunds and sweeps open, so unlike cancel
 * it needs no typed confirmation, only a plain account of what stops and what
 * does not. Resuming is always available to the creator; pausing is not once
 * the programme is cancelled, where refunds are already open and the contract
 * would refuse it.
 */
export function PauseAction({ client, phase, verified, onChanged }: CreatorContext) {
  const paused = useContractRead(() => client.is_paused(), [client]);
  // Fixed when the sheet opens: `paused` refetches on success, and wording read
  // from it afterwards would describe the opposite of what just happened.
  const [pausing, setPausing] = useState(true);
  const [open, setOpen] = useState(false);

  const tx = useTransaction<true>({
    contract: 'program',
    onSuccess: () => {
      forgetPaused(client.options.contractId);
      paused.refetch();
      onChanged();
    },
  });

  useAnnounceTransaction({
    phase: tx.phase,
    error: tx.error,
    pending: pausing ? 'Pausing the programme…' : 'Resuming the programme…',
    success: pausing ? 'Programme paused.' : 'Programme resumed.',
  });

  const isPaused = paused.data === true;

  let reason: string | null = null;
  if (verified !== true) {
    reason = 'Writes are blocked until this programme is confirmed as deployed by the Milepost registry.';
  } else if (paused.error) {
    reason = `Could not tell whether the programme is paused. ${explain(paused.error).message}`;
  } else if (paused.data === null) {
    reason = 'Checking whether the programme is paused…';
  } else if (!isPaused && phase === 'Cancelled') {
    reason = 'This programme is cancelled. Refunds are already open, so there is nothing left to pause.';
  } else if (!isPaused && phase === null) {
    reason = 'Reading the programme’s phase…';
  }
  const enabled = reason === null;

  const build = (pause: boolean) => async () =>
    creatorSendable(pause ? await client.pause() : await client.unpause());

  const start = () => {
    const next = !isPaused;
    setPausing(next);
    setOpen(true);
    void tx.prepare(build(next));
  };

  const close = () => {
    if (tx.busy) return;
    tx.reset();
    setOpen(false);
  };

  return (
    <>
      <CreatorActionRow
        id="pause"
        label={isPaused ? 'Resume programme' : 'Pause programme'}
        summary={
          isPaused
            ? 'Paused now. Resume to let contributions, applications and releases continue.'
            : 'Emergency stop. Refunds stay open.'
        }
        button={isPaused ? 'Resume' : 'Pause'}
        enabled={enabled}
        reason={reason ?? undefined}
        onClick={start}
      />
      <TxSheet
        open={open}
        onClose={close}
        tx={tx}
        eyebrow="Creator"
        confirmTitle={pausing ? 'Pause this programme?' : 'Resume this programme?'}
        confirmText={
          pausing ? (
            <>
              <p>
                <strong>Pausing stops:</strong> contributions, applications, reviews, finalizing awards, spending and
                releasing tranches.
              </p>
              <p>
                <strong>Stays open:</strong> refunds and sweeps, so no donor is ever trapped.
              </p>
              <p>
                <strong>Deadlines keep running.</strong> Pausing does not move them, so time spent paused still counts
                against every window.
              </p>
            </>
          ) : (
            <p>
              Contributions, applications, reviews, awards, spending and releases open again, as the clock and the
              programme’s phase allow. Deadlines did not move while it was paused.
            </p>
          )
        }
        confirmLabel={pausing ? 'Sign and pause' : 'Sign and resume'}
        pendingTitle={pausing ? 'Pausing the programme' : 'Resuming the programme'}
        doneTitle={pausing ? 'Programme paused' : 'Programme resumed'}
        doneText={
          pausing
            ? 'Money-forward actions are halted. Refunds and sweeps still work, and deadlines are still running.'
            : 'The programme is running again.'
        }
        failTitle={pausing ? 'Programme not paused' : 'Programme not resumed'}
        onRetry={() => void tx.prepare(build(pausing))}
      />
    </>
  );
}
