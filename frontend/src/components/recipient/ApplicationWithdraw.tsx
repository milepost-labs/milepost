import { useMemo, useState } from 'react';
import { useSoroban } from '../../context/useSoroban';
import { useWallet } from '../../context/useWallet';
import { useContractRead, useTransaction } from '../../hooks';
import { explain, explainCode } from '../../lib/errors';
import { looksLikeContractId } from '../../lib/format';
import { sampleSendable, SAMPLE_TX_DELAY_MS } from '../../lib/fundingTx';
import { Button, Modal } from '../ui';
import { ErrorPanel, TransactionOutcome } from '../state/AsyncStates';
import type { RecipientApplicationFixture } from '../../fixtures/recipientFixtures';
import './ApplicationWithdraw.css';

type View =
  | { kind: 'role-gate' }
  | { kind: 'read-error' }
  | { kind: 'loading' }
  | { kind: 'withdrawn' }
  | { kind: 'finalised' }
  | { kind: 'action' };

export interface ApplicationWithdrawProps {
  application: RecipientApplicationFixture;
  /** Stand-in transaction delay for sample programmes, overridable for tests. */
  sampleDelayMs?: number;
}

/**
 * Withdraw an application before it is finalised.
 *
 * `program.withdraw` works only while the application is not yet finalised and
 * not already withdrawn. Those two conditions are read on-chain via
 * `get_application` and shown as reasons rather than let the transaction fail,
 * and the role gate (a connected wallet) prevents `require_auth` from failing.
 * A confirmation states plainly that withdrawing is permanent for this
 * programme. On success the application is re-read so it shows as withdrawn.
 *
 * Sample programmes — those whose id is not a real contract address — fall back
 * to the fixture's `finalized`/`withdrawn` and a stand-in send.
 */
export function ApplicationWithdraw({ application, sampleDelayMs = SAMPLE_TX_DELAY_MS }: ApplicationWithdrawProps) {
  const wallet = useWallet();
  const { programmeAt } = useSoroban();

  const isReal = looksLikeContractId(application.programmeId);
  const recipient = wallet.address;

  const client = useMemo(
    () => (isReal ? programmeAt(application.programmeId) : null),
    [isReal, programmeAt, application.programmeId],
  );

  // The application's finalised/withdrawn flags. `get_application` is fallible
  // (Result), so the read unwraps here; the subset we need is just the two
  // booleans.
  const applicationRead = useContractRead<{ finalized: boolean; withdrawn: boolean }>(
    async () => {
      const response = await client!.get_application({ applicant: recipient! });
      return { result: response.result.unwrap() };
    },
    [client, recipient],
    { enabled: isReal && Boolean(recipient), contract: 'program' },
  );

  const finalized = isReal ? applicationRead.data?.finalized ?? false : application.finalized ?? false;
  const withdrawn = isReal ? applicationRead.data?.withdrawn ?? false : application.withdrawn ?? false;

  const [confirmOpen, setConfirmOpen] = useState(false);

  const tx = useTransaction<void>({
    contract: 'program',
    onSuccess: () => {
      if (isReal) applicationRead.refetch();
    },
  });

  // The gates take precedence over the action so the reasons are shown rather
  // than letting the transaction fail with AlreadyFinalized (13) or Withdrawn (37).
  let view: View;
  if (!recipient) {
    view = { kind: 'role-gate' };
  } else if (isReal && applicationRead.error && !applicationRead.data) {
    view = { kind: 'read-error' };
  } else if (isReal && !applicationRead.data && applicationRead.fetching) {
    view = { kind: 'loading' };
  } else if (withdrawn) {
    view = { kind: 'withdrawn' };
  } else if (finalized) {
    view = { kind: 'finalised' };
  } else {
    view = { kind: 'action' };
  }

  const handleConfirm = async () => {
    if (!recipient) return;
    tx.reset();
    await tx.send(async () => {
      if (!isReal) {
        return sampleSendable(() => undefined, sampleDelayMs);
      }
      const assembled = await client!.withdraw({ applicant: recipient });
      return {
        signAndSend: async (options: Parameters<typeof assembled.signAndSend>[0]) => {
          const sent = await assembled.signAndSend(options);
          sent.result.unwrap();
          return { result: undefined };
        },
      };
    });
  };

  return (
    <div className="app-withdraw">
      {view.kind === 'role-gate' && (
        <div className="app-withdraw__gate">
          <p className="app-withdraw__gate-reason">
            Connect a wallet to withdraw your application.
          </p>
          <Button variant="secondary" onClick={() => void wallet.connect()}>
            Sign in
          </Button>
        </div>
      )}

      {view.kind === 'read-error' && (
        <ErrorPanel explained={explain(applicationRead.error, 'program')} onRetry={applicationRead.refetch} />
      )}

      {view.kind === 'loading' && (
        <p className="app-withdraw__gate" role="status" aria-live="polite">
          Reading your application…
        </p>
      )}

      {view.kind === 'withdrawn' && (
        <ErrorPanel explained={explainCode('program', 37)} />
      )}

      {view.kind === 'finalised' && (
        <ErrorPanel explained={explainCode('program', 13)} />
      )}

      {view.kind === 'action' && (
        <>
          <Button
            variant="secondary"
            className="app-withdraw__trigger"
            onClick={() => setConfirmOpen(true)}
          >
            Withdraw application
          </Button>

          <Modal
            open={confirmOpen}
            onClose={() => setConfirmOpen(false)}
            title="Withdraw application?"
            busy={tx.busy}
          >
            <p className="app-withdraw__warning">
              Withdrawing is permanent for this programme. You cannot apply again, and any
              reviews already cast will not produce an award.
            </p>

            <TransactionOutcome
              phase={tx.phase}
              error={tx.error}
              successTitle="Application withdrawn"
              successDescription="You can no longer apply to this programme."
              onRetry={() => void handleConfirm()}
            />

            <div className="app-withdraw__modal-actions">
              <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={tx.busy}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void handleConfirm()} loading={tx.busy}>
                Confirm withdraw
              </Button>
            </div>
          </Modal>
        </>
      )}
    </div>
  );
}
