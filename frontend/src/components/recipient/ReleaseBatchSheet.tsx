import { useEffect, useRef, useState } from 'react';
import type { Award } from '@milepost/program';
import type { RecipientAwardFixture } from '../../fixtures/recipientFixtures';
import { useAnnouncer } from '../../context/useAnnouncer';
import { useSoroban } from '../../context/useSoroban';
import { useWallet } from '../../context/useWallet';
import { useTransaction } from '../../hooks/useTransaction';
import type { Explained } from '../../lib/errors';
import { formatIn } from '../../lib/funding';
import { receiptOf } from '../../lib/fundingTx';
import { shortId } from '../../lib/programmeView';
import {
  checkBatch,
  describeRefusedProof,
  findRefusedProof,
  parseProofList,
  proofIdToBuffer,
} from '../../lib/releaseBatch';
import { restoreFromAssembled } from '../../lib/restore';
import type { ReleaseReply } from '../../lib/verifyLinks';
import { TxSheet } from '../state/TxSheet';
import { Button, CopyButton, Field, Modal, Notice, TextArea, TxExplorerLink } from '../ui';
import './AwardCard.css';

interface BatchReleased {
  /** What the contract returned: the total released across the batch. */
  amount: bigint;
  count: number;
  txHash: string;
  /** The award as the chain has it now, or null when that read failed. */
  fresh: RecipientAwardFixture | null;
}

export interface ReleaseBatchSheetProps {
  open: boolean;
  onClose: () => void;
  award: RecipientAwardFixture;
  asset: string;
  /** Tranches the award has left; the most ids the list may hold. */
  tranchesLeft: number;
  /** A verifier's reply link for this programme: fills in the first id and the attester. */
  reply: ReleaseReply | null;
  onReleased: (result: BatchReleased) => void;
}

/** Error codes where the contract refused one particular proof. */
const PROOF_REFUSED = [21, 22];

/**
 * Releasing several tranches in one transaction. The ids go in one per line or
 * pasted together, all from one verifier, capped at the tranches left; the
 * contract verifies each exactly as a single release does and refuses the whole
 * batch if one is bad. The simulation runs before anything is signed, so a
 * refused proof is named before it can cost a signature.
 */
export function ReleaseBatchSheet({
  open,
  onClose,
  award,
  asset,
  tranchesLeft,
  reply,
  onReleased,
}: ReleaseBatchSheetProps) {
  const announce = useAnnouncer();
  const { address } = useWallet();
  const { programmeAt, attest } = useSoroban();
  const [idsText, setIdsText] = useState(reply?.attestation ?? '');
  const [attesterInput, setAttesterInput] = useState(reply?.attester ?? '');
  const [started, setStarted] = useState(false);
  // Which proof the contract refused, once it has been worked out.
  const [refusal, setRefusal] = useState<string | null>(null);
  // What the in-flight call was sent with, for the diagnosis after a failure.
  const sentRef = useRef<{ uids: string[]; attester: string; recipient: string } | null>(null);

  const recipient = address ?? award.recipient;

  const diagnose = async (error: Explained) => {
    const sent = sentRef.current;
    if (!sent || error.code === undefined || !PROOF_REFUSED.includes(error.code)) return;
    try {
      const client = programmeAt(award.programmeId);
      const schema = (await client.get_config()).result.unwrap().schema;
      const refused = await findRefusedProof(sent.uids, {
        isSpent: async (uid) => (await client.is_spent({ attestation: uid })).result,
        verifies: async (uid) =>
          (await attest.verify({ uid, subject: sent.recipient, schema, attester: sent.attester })).result,
      });
      if (refused) setRefusal(describeRefusedProof(refused, sent.uids));
    } catch {
      // The explained error stands on its own; naming the proof is a bonus.
    }
  };

  const tx = useTransaction<BatchReleased>({
    contract: 'program',
    context: 'release-batch',
    onError: (error) => {
      void diagnose(error);
    },
    onSuccess: (released) => {
      onReleased(released);
      announce(`${released.count} tranches released.`);
    },
  });

  const list = parseProofList(idsText);
  const check = checkBatch(list, tranchesLeft);
  const attester = attesterInput.trim();
  const attesterOk = /^G[A-Z2-7]{55}$/.test(attester);
  const attesterError = attester.length > 0 && !attesterOk ? 'Enter a valid Stellar address (starts with G).' : '';
  const canContinue = check.ready && attesterOk;

  const prepare = () => {
    const uids = check.uids;
    sentRef.current = { uids, attester, recipient };
    setRefusal(null);
    void tx.prepare(async () => {
      const client = programmeAt(award.programmeId);
      const assembled = await client.release_batch({
        recipient,
        uids: uids.map(proofIdToBuffer),
        attester,
      });
      const rawFee = (
        assembled as unknown as { simulationResponse?: { minResourceFee?: string | number | bigint } }
      ).simulationResponse?.minResourceFee;
      return {
        restore: restoreFromAssembled(assembled),
        estimatedFee: rawFee !== undefined ? BigInt(rawFee) : undefined,
        signAndSend: async (options: Parameters<typeof assembled.signAndSend>[0]) => {
          const sent = await assembled.signAndSend(options);
          const amount = sent.result.unwrap();
          // Re-read the award so the signs reflect the chain, not a local count.
          let fresh: RecipientAwardFixture | null = null;
          try {
            const read = (await client.get_award({ recipient })).result.unwrap() as Award;
            fresh = {
              ...award,
              granted: read.granted.toString(),
              released: read.released.toString(),
              tranches: read.tranches,
              tranchesReleased: read.tranches_released,
              payee: read.mode.tag === 'Direct' ? read.payee : null,
              mode: read.mode.tag,
            };
          } catch {
            fresh = null;
          }
          return { result: { amount, count: uids.length, txHash: receiptOf(sent).hash, fresh } };
        },
      };
    });
  };

  const start = () => {
    if (!canContinue) return;
    setStarted(true);
    prepare();
  };

  // The contract names no proof, so say what it did say, plus which one we found.
  const shownError: Explained | null =
    tx.error && tx.error.code !== undefined && PROOF_REFUSED.includes(tx.error.code)
      ? {
          ...tx.error,
          action: refusal ?? 'One bad proof stops all of them, so none were released.',
        }
      : tx.error;

  useEffect(() => {
    if (tx.phase === 'error' && shownError) {
      announce(`Tranches not released. ${shownError.message} ${shownError.action ?? ''}`.trim(), 'alert');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announce, tx.phase, tx.error, refusal]);

  const close = () => {
    if (tx.busy) return;
    tx.reset();
    setStarted(false);
    setRefusal(null);
    onClose();
  };

  if (!started) {
    return (
      <Modal open={open} onClose={close} eyebrow={award.programmeName} title="Release several tranches">
        <div className="award-card__release">
          <Notice tone="warn">
            <strong>All or nothing.</strong> The contract checks every proof as it would for a single release. If one
            is bad or already used, none of them release.
          </Notice>
          <p className="award-card__release-intro">
            {reply
              ? 'The first id and the attester are filled in from your verifier’s reply link. '
              : ''}
            Add one attestation id per line, all signed by the same verifier. You have{' '}
            {tranchesLeft} {tranchesLeft === 1 ? 'tranche' : 'tranches'} left, so at most {tranchesLeft} ids.
          </p>
          <TextArea
            label="Attestation ids (hex)"
            rows={6}
            value={idsText}
            onChange={(event) => setIdsText(event.target.value)}
            placeholder={'One 64-character id per line, e.g.\n3f1a…\n9c2d…'}
            hint={`${list.uids.length} of ${tranchesLeft} tranches`}
            error={check.error ?? ''}
            autoComplete="off"
            spellCheck={false}
          />
          <Field
            label="Attester address"
            placeholder="G…"
            value={attesterInput}
            onChange={(event) => setAttesterInput(event.target.value)}
            error={attesterError}
            autoComplete="off"
            spellCheck={false}
          />
          <Button fullWidth disabled={!canContinue} onClick={start}>
            Continue
          </Button>
        </div>
      </Modal>
    );
  }

  const doneRows = tx.result
    ? [
        { label: 'Tranches released', value: String(tx.result.count) },
        { label: 'Released', value: formatIn(tx.result.amount, asset) },
        ...(tx.result.txHash
          ? [
              {
                label: 'Transaction',
                value: (
                  <span className="award-card__hash">
                    <span title={tx.result.txHash}>{shortId(tx.result.txHash)}</span>
                    <CopyButton value={tx.result.txHash} label="Copy transaction hash" />
                    <TxExplorerLink hash={tx.result.txHash} />
                  </span>
                ),
              },
            ]
          : []),
      ]
    : undefined;

  const count = check.uids.length;
  return (
    <TxSheet
      open={open}
      onClose={close}
      tx={{ ...tx, error: shownError }}
      eyebrow={award.programmeName}
      confirmTitle={`Release ${count} tranches`}
      confirmText={
        <>
          <p>
            Release <span className="numeric">{count}</span> tranches of this award in one transaction, using{' '}
            {count} attestations from one verifier.
          </p>
          <p>If any one of them is refused, none are released.</p>
        </>
      }
      confirmLabel={`Sign and release ${count}`}
      pendingTitle={`Releasing ${count} tranches`}
      doneTitle={tx.result ? `${tx.result.count} tranches released` : 'Tranches released'}
      doneText={
        tx.result
          ? `${formatIn(tx.result.amount, asset)} released across ${tx.result.count} tranches, in one transaction.`
          : undefined
      }
      doneRows={doneRows}
      failTitle={tx.phase === 'idle' && tx.error ? 'Nothing was sent' : 'Tranches not released'}
      onRetry={prepare}
    />
  );
}
