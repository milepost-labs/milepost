import { useState } from 'react';
import { useContractRead, useContractResult, useProgramme, useTransaction, phaseLabel } from '../../hooks';
import { useWallet } from '../../context/useWallet';
import { Button, Modal } from '../ui';
import { ErrorPanel } from '../state/AsyncStates';
import { DonorContributionReceipt } from './DonorContributionReceipt';
import { PausedBanner } from '../programme/PausedBanner';
import './Funding.css';

/**
 * Live reads and writes against the seeded demo programme: the donor's own
 * contribution, and the creator's pause and cancel.
 *
 * These are wired to the real contract, unlike the stand-in cards above, so
 * they stay available while the multi-programme reads are still to come.
 */
export function SeededProgrammeTools() {
  const { address } = useWallet();
  const { client: programme } = useProgramme();

  const config = useContractResult(() => programme.get_config(), [programme]);
  const phase = useContractResult(() => programme.get_phase(), [programme]);
  const paused = useContractRead(() => programme.is_paused(), [programme]);

  const cancelTx = useTransaction({ contract: 'program' });
  const pauseTx = useTransaction({ contract: 'program' });
  const [cancelOpen, setCancelOpen] = useState(false);

  const isCreator = Boolean(address && config.data && address === config.data.creator);
  const isCancelled = phase.data?.tag === 'Cancelled';

  const cancel = async () => {
    const result = await cancelTx.send(async () => {
      const tx = await programme.cancel();
      return {
        signAndSend: async (options: Parameters<typeof tx.signAndSend>[0]) => {
          const sent = await tx.signAndSend(options);
          return { result: sent.result.unwrap() };
        },
      };
    });
    if (result !== null) {
      setCancelOpen(false);
      phase.refetch();
      config.refetch();
    }
  };

  const togglePause = async () => {
    const result = await pauseTx.send(async () => {
      const tx = paused.data ? await programme.unpause() : await programme.pause();
      return {
        signAndSend: async (options: Parameters<typeof tx.signAndSend>[0]) => {
          const sent = await tx.signAndSend(options);
          return { result: sent.result.unwrap() };
        },
      };
    });
    if (result !== null) paused.refetch();
  };

  return (
    <details className="fund-seeded">
      <summary className="fund-seeded__summary">Seeded demo programme · live on-chain reads</summary>
      <div className="fund-seeded__body">
        <PausedBanner client={programme} />

        {isCreator && (
          <div className="fund-seeded__creator">
            <p className="fund-note">You created this programme.</p>
            {isCancelled ? (
              <p className="fund-note">
                Cancelled. No further contributions or awards can be made; donors can claim refunds.
              </p>
            ) : (
              <div className="fund-actions">
                <Button
                  variant="secondary"
                  onClick={togglePause}
                  loading={pauseTx.busy}
                  loadingLabel={paused.data ? 'Unpausing…' : 'Pausing…'}
                  disabled={paused.loading}
                >
                  {paused.data ? 'Unpause programme' : 'Pause programme'}
                </Button>
                <Button variant="danger" onClick={() => setCancelOpen(true)}>
                  Cancel programme
                </Button>
              </div>
            )}
            {pauseTx.error && <ErrorPanel explained={pauseTx.error} />}
          </div>
        )}

        <DonorContributionReceipt />
      </div>

      <Modal
        open={cancelOpen}
        onClose={() => !cancelTx.busy && setCancelOpen(false)}
        title="Cancel programme"
        busy={cancelTx.busy}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)} disabled={cancelTx.busy}>
              Back
            </Button>
            <Button
              variant="danger"
              onClick={cancel}
              loading={cancelTx.busy}
              loadingLabel={phaseLabel(cancelTx.phase) || 'Cancelling…'}
            >
              Confirm cancel programme
            </Button>
          </>
        }
      >
        <p className="fund-note">
          Cancelling is permanent. Contributed funds become available for donors to reclaim through the refund path,
          and submitted applications will not be reviewed or awarded. A programme can only be cancelled while it holds
          no funds and has made no awards.
        </p>
        {cancelTx.error && <ErrorPanel explained={cancelTx.error} />}
      </Modal>
    </details>
  );
}
