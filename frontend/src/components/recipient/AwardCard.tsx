import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Buffer } from 'buffer';
import { TriangleAlert } from 'lucide-react';
import type { Award } from '@milepost/program';
import type { RecipientAwardFixture } from '../../fixtures/recipientFixtures';
import { describeAmount } from '../../lib/amount';
import { looksLikeContractId, truncateAddress } from '../../lib/format';
import { formatIn } from '../../lib/funding';
import { formatFigure, isSampleProgrammeId, programmeAsset, shortId } from '../../lib/programmeView';
import { samplesEnabled } from '../../lib/samples';
import { useAnnouncer } from '../../context/useAnnouncer';
import { useWallet } from '../../context/useWallet';
import { useSoroban } from '../../context/useSoroban';
import { useTransaction } from '../../hooks/useTransaction';
import { sampleSendable, SAMPLE_TX_DELAY_MS } from '../../lib/fundingTx';
import { absoluteLink, REQUEST_NOTE_MAX, requestPath, type ReleaseReply } from '../../lib/verifyLinks';
import { Button, CopyButton, Field, Modal, ModePill, Notice, SampleTag, TextArea, TxExplorerLink } from '../ui';
import { TxDone, TxFailed, TxPending } from '../state/TxStatus';
import { AllocatedSpending } from './AllocatedSpending';
import { restoreFromAssembled } from '../../lib/restore';
import './AwardCard.css';

interface AwardCardProps {
  award: RecipientAwardFixture;
  /** A verifier's reply link for this programme: fills in the release. */
  reply?: ReleaseReply | null;
  /** Overridable for tests: keep stand-in delay short. */
  sampleDelayMs?: number;
}

type TrancheState = 'released' | 'proven' | 'waiting' | 'locked';

/**
 * Convert a 64-char hex string to a 32-byte Buffer.
 * Returns null when the input is not valid 64-char lowercase/uppercase hex.
 */
function hexToBuffer(hex: string): Buffer | null {
  const clean = hex.trim().replace(/^0x/, '');
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) return null;
  return Buffer.from(clean, 'hex');
}

/** Where the money lands for each mode, in plain language, said before signing. */
function modeDestination(mode: RecipientAwardFixture['mode'], payee: string | null): string {
  switch (mode) {
    case 'Direct':
      return payee
        ? `Paid straight to payee ${truncateAddress(payee)}. You never hold the funds.`
        : 'Paid straight to the verified payee. You never hold the funds.';
    case 'Allocated':
      return 'Held in escrow for you to direct to a verified payee when you are ready.';
    case 'Restricted':
      return 'Paid into your wallet. Spending is limited to verified payees by your policy signer.';
    case 'Open':
      return 'Paid directly into your wallet with no spending restriction.';
  }
}

/** The line under the award's name: where its money goes, and who chose that. */
function modeLine(mode: RecipientAwardFixture['mode'], payee: string | null) {
  switch (mode) {
    case 'Direct':
      return (
        <>
          Paid directly to payee{' '}
          {payee ? <b className="numeric">{truncateAddress(payee)}</b> : 'chosen by the programme'}. You
          never hold the money.
        </>
      );
    case 'Allocated':
      return 'Held in escrow for you. You choose a verified payee, and when.';
    case 'Restricted':
      return 'Paid into your smart wallet, behind a spending policy.';
    case 'Open':
      return 'Paid directly to your wallet. Nothing checks where it goes after release.';
  }
}

const STATE_TITLE: Record<TrancheState, string> = {
  released: 'Released',
  proven: 'Proof received, ready to release',
  waiting: 'Waiting on a verifier',
  locked: 'Locked',
};

interface Released {
  amount: bigint;
  txHash: string;
}

/**
 * Releasing a tranche, in a sheet: where the money goes first, the proof for
 * a deployed programme, then sending, then the receipt or the failure. A
 * sample programme has no contract, so it skips the proof and stands in.
 */
function ReleaseSheet({
  open,
  onClose,
  award,
  asset,
  isReal,
  tranche,
  onReleased,
  sampleDelayMs,
  reply,
}: {
  open: boolean;
  onClose: () => void;
  award: RecipientAwardFixture;
  asset: string;
  isReal: boolean;
  /** Which tranche, counting from 1. */
  tranche: number;
  onReleased: (result: Released, fresh: RecipientAwardFixture | null) => void;
  sampleDelayMs: number;
  reply: ReleaseReply | null;
}) {
  const announce = useAnnouncer();
  const { address } = useWallet();
  const { programmeAt } = useSoroban();
  const tx = useTransaction<Released>({ contract: 'program' });
  const [attestationHex, setAttestationHex] = useState(reply?.attestation ?? '');
  const [attesterInput, setAttesterInput] = useState(reply?.attester ?? '');

  const granted = BigInt(award.granted);
  const trancheBase = award.tranches > 0 ? granted / BigInt(award.tranches) : 0n;

  const attestationBuf = hexToBuffer(attestationHex);
  const attestationError =
    attestationHex.trim().length > 0 && attestationBuf === null ? 'Enter the 64-character hex attestation id.' : '';
  const attester = attesterInput.trim();
  const attesterOk = /^G[A-Z2-7]{55}$/.test(attester);
  const attesterError = attester.length > 0 && !attesterOk ? 'Enter a valid Stellar address (starts with G).' : '';
  const canRelease = !tx.busy && (!isReal || (attestationBuf !== null && attesterOk));

  const release = async () => {
    if (!canRelease) return;
    const recipient = address ?? award.recipient;
    const client = isReal ? programmeAt(award.programmeId) : null;
    let fresh: RecipientAwardFixture | null = null;

    const result = await tx.send(async () => {
      if (!isReal) return sampleSendable(() => ({ amount: trancheBase, txHash: '' }), sampleDelayMs);

      const assembled = await client!.release({ recipient, attestation: attestationBuf!, attester });
      return {
        restore: restoreFromAssembled(assembled),
        signAndSend: async (options: Parameters<typeof assembled.signAndSend>[0]) => {
          const sent = await assembled.signAndSend(options);
          const amount = sent.result.unwrap();
          const txHash = (sent as { sendTransactionResponse?: { hash?: string } }).sendTransactionResponse?.hash ?? '';
          // Re-read the award so the signs reflect the chain, not a local counter.
          try {
            const read = (await client!.get_award({ recipient })).result.unwrap() as Award;
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
          return { result: { amount, txHash } };
        },
      };
    });

    if (result !== null) {
      announce(`Tranche ${tranche} released.`);
      onReleased(result, fresh);
    } else if (tx.error) {
      announce(`Tranche not released. ${tx.error.message}`, 'alert');
    }
  };

  const close = () => {
    if (tx.busy) return;
    tx.reset();
    setAttestationHex('');
    setAttesterInput('');
    onClose();
  };

  const declined = tx.error !== null && tx.phase === 'idle';

  return (
    <Modal open={open} onClose={close} title={`Release tranche ${tranche}`} eyebrow={award.programmeName} busy={tx.busy}>
      {tx.phase === 'success' && tx.result ? (
        <TxDone
          title={`Tranche ${tranche} released`}
          rows={[
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
          ]}
          actions={<Button onClick={close}>Done</Button>}
        >
          <p>{modeDestination(award.mode, award.payee)}</p>
          {!isReal && samplesEnabled() && (
            <p className="award-card__sample-note">
              <SampleTag>Sample receipt</SampleTag>
            </p>
          )}
        </TxDone>
      ) : tx.phase === 'error' && tx.error ? (
        <TxFailed title="Tranche not released" explained={tx.error} onRetry={() => void release()} />
      ) : tx.busy ? (
        <TxPending title={`Releasing tranche ${tranche}`} phase={tx.phase} />
      ) : (
        <div className="award-card__release">
          <Notice tone="info">
            <strong>Where this goes:</strong> {modeDestination(award.mode, award.payee)}
          </Notice>
          {isReal ? (
            <>
              <p className="award-card__release-intro">
                {reply
                  ? 'Filled in from your verifier’s reply link. The contract checks the attestation when you release.'
                  : 'Your verifier gives you the attestation id once they have signed. One attestation releases one tranche, once.'}
              </p>
              <Field
                label="Attestation id (hex)"
                placeholder="64 characters, e.g. 3f1a…"
                value={attestationHex}
                onChange={(e) => setAttestationHex(e.target.value)}
                error={attestationError}
                autoComplete="off"
                spellCheck={false}
              />
              <Field
                label="Attester address"
                placeholder="G…"
                value={attesterInput}
                onChange={(e) => setAttesterInput(e.target.value)}
                error={attesterError}
                autoComplete="off"
                spellCheck={false}
              />
            </>
          ) : (
            <p className="award-card__release-intro">
              A sample programme has no contract, so this release stands in for the real one.
            </p>
          )}
          {declined && tx.error && (
            <Notice tone="info">
              {tx.error.message} {tx.error.action}
            </Notice>
          )}
          <Button fullWidth disabled={!canRelease} onClick={() => void release()}>
            Sign and release
          </Button>
        </div>
      )}
    </Modal>
  );
}

/**
 * A request link for the verifier: no transaction, just a link that opens
 * their review of this recipient's claim. The note travels in the link only.
 */
function RequestSheet({
  open,
  onClose,
  award,
  tranche,
}: {
  open: boolean;
  onClose: () => void;
  award: RecipientAwardFixture;
  tranche: number;
}) {
  const [note, setNote] = useState('');
  const link = absoluteLink(
    requestPath({ programmeId: award.programmeId, recipient: award.recipient, tranche, note }),
  );
  return (
    <Modal open={open} onClose={onClose} title="Ask your verifier" eyebrow={award.programmeName}>
      <div className="award-card__release">
        <p className="award-card__release-intro">
          Send this link to your verifier. It opens their review of tranche {tranche} with your address filled
          in. They check the award on the chain before they sign, then send you a link back that fills in your
          release.
        </p>
        <TextArea
          label="A note for your verifier (optional)"
          rows={3}
          maxLength={REQUEST_NOTE_MAX}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          hint="It travels in the link, not on the chain. Don’t include personal details."
        />
        <Field label="Request link" value={link} readOnly className="award-card__link" spellCheck={false} />
        <div className="award-card__sheet-actions">
          <CopyButton value={link} label="Copy request link" showLabel />
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * One award: where its money goes, and its tranches as numbered milepost
 * signs. A released tranche's sign is filled; one with its proof in is
 * outlined and offers the release; the next one without a proof says it is
 * waiting on a verifier; the rest are locked behind it.
 *
 * Release is real for deployed programmes: `program.release({ recipient,
 * attestation, attester })` through `useTransaction`, then `get_award` is
 * re-read so the signs reflect the chain. Sample programmes stand in.
 */
export function AwardCard({ award: initialAward, reply = null, sampleDelayMs = SAMPLE_TX_DELAY_MS }: AwardCardProps) {
  // On-chain award state: starts from the prop and is updated after each
  // confirmed release so the signs reflect the chain, not a local counter.
  const [liveAward, setLiveAward] = useState<RecipientAwardFixture>(initialAward);
  // A new award from the caller replaces the local copy.
  const [seenAward, setSeenAward] = useState(initialAward);
  if (initialAward !== seenAward) {
    setSeenAward(initialAward);
    setLiveAward(initialAward);
  }
  // Which tranche the release sheet is for, fixed when it opens so the receipt
  // still names it after the award moves on. Null while closed.
  const [releasing, setReleasing] = useState<number | null>(null);
  const [asking, setAsking] = useState<number | null>(null);
  // A reply link is spent once a release goes through.
  const [replyUsed, setReplyUsed] = useState(false);
  const activeReply = reply && reply.programmeId === initialAward.programmeId && !replyUsed ? reply : null;

  // Sample ids have the contract shape too, so shape alone cannot tell them apart.
  const isReal = looksLikeContractId(initialAward.programmeId) && !isSampleProgrammeId(initialAward.programmeId);
  const asset = programmeAsset({ sample: !isReal });

  const granted = BigInt(liveAward.granted);
  const released = BigInt(liveAward.released);
  const { tranches, tranchesReleased } = liveAward;
  const trancheBase = tranches > 0 ? granted / BigInt(tranches) : 0n;
  const allReleased = tranchesReleased >= tranches;

  const signs = useMemo(
    () =>
      Array.from({ length: tranches }, (_, i) => {
        const amount = i === tranches - 1 ? granted - trancheBase * BigInt(tranches - 1) : trancheBase;
        let state: TrancheState = 'locked';
        if (i < tranchesReleased) state = 'released';
        else if (i === tranchesReleased) state = liveAward.attestationReady || activeReply ? 'proven' : 'waiting';
        return { number: i + 1, amount, state };
      }),
    [tranches, granted, trancheBase, tranchesReleased, liveAward.attestationReady, activeReply],
  );

  const onReleased = (result: Released, fresh: RecipientAwardFixture | null) => {
    setReplyUsed(true);
    setLiveAward(
      (prev) =>
        fresh ?? {
          ...prev,
          released: (BigInt(prev.released) + result.amount).toString(),
          tranchesReleased: prev.tranchesReleased + 1,
          // The proof that was just used is spent; the next needs its own.
          attestationReady: false,
        },
    );
  };

  /** What the next sign says, and whether it offers the release. */
  const nextNote = (state: TrancheState) => {
    if (state === 'proven' && activeReply) return 'Your verifier signed and sent a reply link. You can release it now.';
    if (state === 'proven') return `${liveAward.condition}. Confirmed by your verifier. You can release it now.`;
    if (isReal) return `${liveAward.condition}. Once your verifier signs, release it with their attestation id.`;
    return `Waiting on your verifier: ${liveAward.condition.charAt(0).toLowerCase()}${liveAward.condition.slice(1)}.`;
  };

  return (
    <article className="award-card" aria-labelledby={`award-${initialAward.programmeId}`}>
      <div className="award-card__head">
        <div className="award-card__title-group">
          <div className="award-card__badges">
            <ModePill mode={liveAward.mode} />
            {!isReal && samplesEnabled() && <SampleTag />}
          </div>
          <h3 className="award-card__name">
            <Link id={`award-${initialAward.programmeId}`} to={`/programme/${encodeURIComponent(initialAward.programmeId)}`}>
              {liveAward.programmeName}
            </Link>
          </h3>
          <p className="award-card__mode-line">{modeLine(liveAward.mode, liveAward.payee)}</p>
          {isReal && (
            <Link
              to={`/award/${encodeURIComponent(initialAward.programmeId)}/${encodeURIComponent(initialAward.recipient)}`}
              className="award-card__detail-link"
            >
              View this award&apos;s detail →
            </Link>
          )}
        </div>
        <div className="award-card__amount">
          <b className="numeric" aria-label={describeAmount(granted, asset)}>
            {formatFigure(granted)} <small>{asset}</small>
          </b>
          <span>
            <span className="numeric">{formatFigure(released)}</span> released · {tranchesReleased} of {tranches}{' '}
            {tranches === 1 ? 'tranche' : 'tranches'}
          </span>
        </div>
      </div>

      <ol className="award-card__posts" style={{ ['--posts' as string]: Math.min(tranches, 4) }} aria-label="Tranches">
        {signs.map((sign) => {
          const next = sign.number === tranchesReleased + 1;
          return (
            <li key={sign.number} className={`award-post award-post--${sign.state}`}>
              <span className="award-post__sign numeric" aria-hidden="true">
                {String(sign.number).padStart(2, '0')}
              </span>
              <h4 className="award-post__title">
                <span className="visually-hidden">Tranche {sign.number}: </span>
                {STATE_TITLE[sign.state]}
              </h4>
              <span className="award-post__amount numeric" aria-label={describeAmount(sign.amount, asset)}>
                {formatIn(sign.amount, asset)}
              </span>
              {next && !allReleased && <p className="award-post__note">{nextNote(sign.state)}</p>}
              {sign.state === 'locked' && <p className="award-post__note">After tranche {sign.number - 1}.</p>}
              {next && !allReleased && (sign.state === 'proven' || isReal) && (
                <span className="award-post__actions">
                  <Button
                    size="sm"
                    variant={sign.state === 'proven' ? 'primary' : 'ghost'}
                    onClick={() => setReleasing(sign.number)}
                  >
                    Release tranche
                  </Button>
                  {isReal && sign.state === 'waiting' && (
                    <Button size="sm" variant="secondary" onClick={() => setAsking(sign.number)}>
                      Ask your verifier
                    </Button>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {liveAward.mode === 'Allocated' && <AllocatedSpending award={liveAward} />}

      {liveAward.mode === 'Restricted' && (
        <div className="award-card__policy">
          <div className="award-card__policy-text">
            <b>
              <TriangleAlert aria-hidden="true" />
              Released money goes to your own wallet
            </b>
            <p>
              The spending policy constrains one signer, not the wallet: it limits that signer to {asset},
              verified payees and a cap. If the policy isn&rsquo;t set up, there is no restriction at all.
            </p>
          </div>
          <Link to="/policy" className="ui-button ui-button--primary ui-button--sm">
            Check your spend policy
          </Link>
        </div>
      )}

      {releasing !== null && (
        <ReleaseSheet
          open
          onClose={() => setReleasing(null)}
          award={liveAward}
          asset={asset}
          isReal={isReal}
          tranche={releasing}
          onReleased={onReleased}
          sampleDelayMs={sampleDelayMs}
          reply={activeReply}
        />
      )}

      {asking !== null && (
        <RequestSheet open onClose={() => setAsking(null)} award={liveAward} tranche={asking} />
      )}
    </article>
  );
}
