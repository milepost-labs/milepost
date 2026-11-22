import { useState } from 'react';
import { useContractRead, useAnnounceTransaction, useTransaction } from '../../hooks';
import { explain } from '../../lib/errors';
import { creatorSendable } from '../../lib/creatorTx';
import { shortId } from '../../lib/programmeView';
import { Field } from '../ui';
import { TxSheet } from '../state/TxSheet';
import { CreatorActionRow } from './CreatorActionRow';
import type { CreatorContext } from './CreatorActions';

/** Typed confirmation matches the short id as shown, with `...` accepted for `…`, or the full id. */
function matchesId(typed: string, programmeId: string): boolean {
  const value = typed.trim().toLowerCase();
  if (!value) return false;
  const short = shortId(programmeId).toLowerCase();
  return value === short || value === short.replace('…', '...') || value === programmeId.toLowerCase();
}

/**
 * Cancel the programme: return every donor's money before anything is paid out.
 *
 * Permanent, so the sheet asks the creator to type the programme's short id.
 * Unavailable once any tranche has been released (the contract refuses with
 * NotCancellable) or once it is already cancelled; the reason says which.
 */
export function CancelAction({ programmeId, client, phase, verified, onChanged }: CreatorContext) {
  const released = useContractRead(() => client.total_released(), [client]);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');

  const tx = useTransaction<true>({
    contract: 'program',
    onSuccess: () => {
      released.refetch();
      onChanged();
    },
  });

  useAnnounceTransaction({
    phase: tx.phase,
    error: tx.error,
    pending: 'Cancelling the programme…',
    success: 'Programme cancelled. Donors can now claim refunds.',
  });

  const id = shortId(programmeId);

  let reason: string | null = null;
  if (verified !== true) {
    reason = 'Writes are blocked until this programme is confirmed as deployed by the Milepost registry.';
  } else if (phase === 'Cancelled') {
    reason = 'This programme is already cancelled. Donors can claim refunds now.';
  } else if (released.error) {
    reason = `Could not tell whether any money has been released. ${explain(released.error).message}`;
  } else if (released.data === null || phase === null) {
    reason = 'Checking whether any money has been released…';
  } else if (released.data > 0n) {
    reason = 'A tranche has already been released, and those payouts are final, so this programme can no longer be cancelled.';
  }
  const enabled = reason === null;

  const build = async () => creatorSendable(await client.cancel());

  const start = () => {
    setTyped('');
    setOpen(true);
    void tx.prepare(build);
  };

  const close = () => {
    if (tx.busy) return;
    tx.reset();
    setOpen(false);
  };

  return (
    <>
      <CreatorActionRow
        id="cancel"
        label="Cancel programme"
        summary="Returns every donor’s money. Permanent."
        button="Cancel programme"
        variant="danger"
        enabled={enabled}
        reason={reason ?? undefined}
        onClick={start}
      />
      <TxSheet
        open={open}
        onClose={close}
        tx={tx}
        eyebrow="Creator"
        confirmTitle="Cancel this programme?"
        confirmText={
          <>
            <p>
              <strong>This is permanent and cannot be undone.</strong> Refunds open at once, so every donor can reclaim
              their share of what has not been paid out. Applications will not be reviewed or awarded.
            </p>
            <Field
              label={`Type ${id} to confirm`}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              hint="The programme’s short id, as shown here."
              autoComplete="off"
              spellCheck={false}
            />
          </>
        }
        confirmLabel="Sign and cancel programme"
        confirmDisabled={!matchesId(typed, programmeId)}
        pendingTitle="Cancelling the programme"
        doneTitle="Programme cancelled"
        doneText="Refunds are open. Donors can claim their share from their contributions page."
        failTitle="Programme not cancelled"
        onRetry={() => void tx.prepare(build)}
      />
    </>
  );
}
