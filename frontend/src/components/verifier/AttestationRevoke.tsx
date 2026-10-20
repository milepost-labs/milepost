import { useState } from 'react';
import { Buffer } from 'buffer';
import { useWallet } from '../../context/useWallet';
import { useSoroban } from '../../context/useSoroban';
import { useTransaction } from '../../hooks/useTransaction';
import { useAnnouncer } from '../../context/useAnnouncer';
import { sampleSendable, SAMPLE_TX_DELAY_MS } from '../../lib/fundingTx';
import { ErrorPanel, TransactionOutcome } from '../state/AsyncStates';
import type { VerifierAttestation } from '../../fixtures/verifierFixtures';
import './AttestationRevoke.css';

export interface AttestationRevokeProps {
  attestation: VerifierAttestation;
  onRevoked?: (uid: string) => void;
  sampleDelayMs?: number;
}

/**
 * Revoke a signed attestation.
 *
 * `attest.revoke({ attester, uid })` withdraws the claim. The contract refuses
 * if the schema is not revocable (error 4), if the caller is not the original
 * attester (error 5), or if it has already been revoked (error 6). Every
 * failure renders through `explain()`.
 *
 * Revoking prevents the proof being used again but never claws back a tranche
 * already released. The copy makes this clear before the action is confirmed.
 *
 * For real attestations (those with a `rawUid` hex string) the action calls
 * the contract; for sample entries it uses `sampleSendable` so the flow is
 * demonstrable without a wallet.
 */
export function AttestationRevoke({
  attestation,
  onRevoked,
  sampleDelayMs = SAMPLE_TX_DELAY_MS,
}: AttestationRevokeProps) {
  const announce = useAnnouncer();
  const { address } = useWallet();
  const { attest } = useSoroban();

  const isReal = Boolean(attestation.rawUid);
  const [confirming, setConfirming] = useState(false);

  const tx = useTransaction<void>({
    contract: 'attest',
    onSuccess: () => {
      announce('Attestation revoked.');
      onRevoked?.(attestation.uid);
    },
  });

  // Already revoked — no action to show.
  if (attestation.revoked) {
    return (
      <span className="attest-revoke__revoked" role="status">
        Revoked
      </span>
    );
  }

  // Schema does not allow revocation.
  if (attestation.revocable === false) {
    return (
      <span className="attest-revoke__nonrevocable" aria-label="This schema does not allow revocation">
        Cannot revoke
      </span>
    );
  }

  const handleRevoke = async () => {
    const attester = address ?? '';
    await tx.send(async () => {
      if (!isReal) {
        return sampleSendable(() => undefined, sampleDelayMs);
      }
      const uidBuf = Buffer.from(attestation.rawUid!, 'hex');
      const assembled = await attest.revoke({ attester, uid: uidBuf });
      return {
        signAndSend: async (
          options: Parameters<typeof assembled.signAndSend>[0],
        ) => {
          const sent = await assembled.signAndSend(options);
          sent.result.unwrap();
          return { result: undefined as void };
        },
      };
    });
  };

  return (
    <div className="attest-revoke">
      {!confirming && tx.phase !== 'success' && (
        <button
          type="button"
          className="attest-revoke__trigger"
          onClick={() => setConfirming(true)}
          disabled={tx.busy}
        >
          Revoke
        </button>
      )}

      {confirming && !tx.busy && tx.phase !== 'success' && (
        <div className="attest-revoke__confirm" role="region" aria-label="Confirm revocation">
          <p className="attest-revoke__warning">
            <strong>Revoking stops this proof being used again.</strong> Any tranche already
            released stays released — revocation never claws money back. Are you sure?
          </p>
          <div className="attest-revoke__actions">
            <button
              type="button"
              className="attest-revoke__confirm-btn"
              onClick={() => void handleRevoke()}
              disabled={tx.busy}
            >
              Yes, revoke
            </button>
            <button
              type="button"
              className="attest-revoke__cancel-btn"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <TransactionOutcome
        phase={tx.phase}
        error={tx.error}
        successTitle="Attestation revoked"
        successDescription="The proof can no longer be used to release a tranche."
        pendingTitle="Revoking attestation…"
        onRetry={() => void handleRevoke()}
        onDismiss={() => tx.reset()}
      />

      {tx.phase === 'error' && tx.error && !confirming && (
        <ErrorPanel explained={tx.error} onRetry={() => setConfirming(true)} live={false} />
      )}
    </div>
  );
}
