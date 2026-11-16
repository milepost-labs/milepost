import { useState } from 'react';
import { Buffer } from 'buffer';
import { useWallet } from '../../context/useWallet';
import { useSoroban } from '../../context/useSoroban';
import { useTransaction } from '../../hooks/useTransaction';
import { useAnnouncer } from '../../context/useAnnouncer';
import { sampleSendable, SAMPLE_TX_DELAY_MS } from '../../lib/fundingTx';
import { Button, Modal, Notice } from '../ui';
import { TxDone, TxFailed, TxPending } from '../state/TxStatus';

export interface AttestationRevokeProps {
  /** 64-character hex of the attestation, or null for a sample entry with nothing on the chain. */
  uidHex: string | null;
  /** How the row names it, for the sheet and the announcement. */
  label: string;
  onRevoked?: () => void;
  sampleDelayMs?: number;
}

/**
 * Revoke a signed attestation, in a sheet: what revoking does and does not
 * do, then sending, then the outcome.
 *
 * `attest.revoke({ attester, uid })` withdraws the claim. The contract refuses
 * if the schema is not revocable (error 4), if the caller is not the original
 * attester (error 5), or if it has already been revoked (error 6), and every
 * refusal is explained. Revoking stops the proof being used again; it never
 * claws back a tranche already released.
 */
export function AttestationRevoke({
  uidHex,
  label,
  onRevoked,
  sampleDelayMs = SAMPLE_TX_DELAY_MS,
}: AttestationRevokeProps) {
  const announce = useAnnouncer();
  const { address } = useWallet();
  const { attest } = useSoroban();
  const [open, setOpen] = useState(false);

  const tx = useTransaction<void>({
    contract: 'attest',
    onSuccess: () => {
      announce('Attestation revoked.');
      onRevoked?.();
    },
    onError: (error) => announce(error.message, 'alert'),
  });

  const revoke = async () => {
    await tx.send(async () => {
      if (!uidHex) return sampleSendable(() => undefined, sampleDelayMs);
      const assembled = await attest.revoke({ attester: address ?? '', uid: Buffer.from(uidHex, 'hex') });
      return {
        signAndSend: async (options: Parameters<typeof assembled.signAndSend>[0]) => {
          const sent = await assembled.signAndSend(options);
          sent.result.unwrap();
          return { result: undefined as void };
        },
      };
    });
  };

  const close = () => {
    if (tx.busy) return;
    setOpen(false);
    tx.reset();
  };

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        Revoke<span className="visually-hidden"> {label}</span>
      </Button>
      <Modal open={open} onClose={close} busy={tx.busy} eyebrow="Verify" title="Revoke attestation">
        {tx.phase === 'success' ? (
          <TxDone title="Attestation revoked" actions={<Button onClick={close}>Done</Button>}>
            <p>The proof can no longer release a tranche.</p>
          </TxDone>
        ) : tx.error && !tx.busy ? (
          <TxFailed
            title="Not revoked"
            explained={tx.error}
            onRetry={() => void revoke()}
            actions={
              <Button variant="secondary" onClick={close}>
                Close
              </Button>
            }
          />
        ) : tx.busy ? (
          <TxPending title="Revoking attestation" phase={tx.phase} />
        ) : (
          <div className="revoke-sheet">
            <p className="numeric revoke-sheet__id">{label}</p>
            <Notice tone="risk">
              <strong>Revoking stops this proof being used again.</strong> A tranche it already released stays
              released. Revoking never claws money back.
            </Notice>
            <div className="revoke-sheet__actions">
              <Button variant="secondary" onClick={close}>
                Keep it
              </Button>
              <Button variant="danger" onClick={() => void revoke()}>
                Yes, revoke
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
