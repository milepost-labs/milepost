import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Award, Mode } from '@milepost/program';
import { useSoroban } from '../../context/useSoroban';
import { useAnnouncer } from '../../context/useAnnouncer';
import { useKeyedRead } from '../../hooks/useKeyedRead';
import { useTransaction } from '../../hooks/useTransaction';
import { explainCode } from '../../lib/errors';
import { looksLikeAddress, truncateAddress } from '../../lib/format';
import { formatIn } from '../../lib/funding';
import { sampleSendable, SAMPLE_TX_DELAY_MS } from '../../lib/fundingTx';
import { MODE_INFO, type ModeName } from '../../lib/modes';
import { Button, DisabledReason, Field, Modal, ModePill, Notice, SampleTag } from '../ui';
import { TxDone, TxFailed, TxPending } from '../state/TxStatus';

const MODES = Object.keys(MODE_INFO) as ModeName[];

/** What each mode means for this award, said before choosing it. */
const CONSEQUENCE: Record<ModeName, string> = {
  Allocated: 'Held in escrow. The recipient directs it to a verified payee later. Nothing outside the contract can weaken this.',
  Direct: 'Paid straight to a verified payee you name now. The recipient never holds it and never chooses.',
  Restricted: 'Paid into the recipient’s smart wallet, behind a spend policy. The policy limits one signer, not the wallet.',
  Open: 'Paid to the recipient with nothing checking where it goes afterwards.',
};

export interface FinalizeTarget {
  programmeId: string;
  applicant: string;
  /** What finalize will settle on, as the contract computes it. */
  award: bigint;
  asset: string;
  /** Budget left before this award. */
  left: bigint;
  /** A sample programme: nothing is sent. */
  sample: boolean;
  /** The programme's spend-policy contract (`config.policy`), when known. */
  policy: string | null;
}

interface FinalizeSheetProps {
  target: FinalizeTarget;
  onClose: () => void;
  onFinalized: (award: { granted: bigint; mode: ModeName; payee: string }) => void;
  sampleDelayMs?: number;
}

/**
 * Finalize one application, in a sheet: the mode (ranked, Allocated first),
 * then the payee that mode needs, then sending.
 *
 * The payee follows the contract's rules for each mode:
 * - Direct names a payee the programme has verified (`is_payee`, checked live;
 *   the contract refuses anything else with `PayeeNotVerified`).
 * - Allocated has no destination yet; the recipient picks one later.
 * - Restricted pays the recipient's smart wallet, which can differ from their
 *   account. Its spend policy is enforced at each release, so a missing
 *   policy is a warning here, not a block.
 * - Open must name the recipient themselves (`OpenPayeeNotRecipient`).
 */
export function FinalizeSheet({ target, onClose, onFinalized, sampleDelayMs = SAMPLE_TX_DELAY_MS }: FinalizeSheetProps) {
  const { programmeAt, policy } = useSoroban();
  const announce = useAnnouncer();
  const groupId = useId();
  const [mode, setMode] = useState<ModeName>('Allocated');
  const [directPayee, setDirectPayee] = useState('');
  const [wallet, setWallet] = useState('');
  const programme = programmeAt(target.programmeId);

  const directKey = mode === 'Direct' && looksLikeAddress(directPayee.trim()) && !target.sample ? directPayee.trim() : null;
  const payeeCheck = useKeyedRead(directKey, (payee) => programme.is_payee({ payee }).then((r) => r.result));
  // Only asked of the policy contract this programme actually uses.
  const policyMatches = target.policy !== null && target.policy === policy.options.contractId;
  const walletKey =
    mode === 'Restricted' && looksLikeAddress(wallet.trim()) && !target.sample && policyMatches ? wallet.trim() : null;
  const policyCheck = useKeyedRead(walletKey, (w) => policy.is_installed({ wallet: w }).then((r) => r.result));

  const payee =
    mode === 'Direct' ? directPayee.trim() : mode === 'Restricted' ? wallet.trim() : target.applicant;

  const reason = (() => {
    if (mode === 'Direct') {
      if (!looksLikeAddress(directPayee.trim())) return 'Enter the verified payee’s address.';
      if (target.sample) return null;
      if (payeeCheck.status === 'loading') return 'Checking the payee…';
      if (payeeCheck.status === 'error') return 'Couldn’t check the payee. Try again.';
      if (payeeCheck.data === false) return 'That address is not a verified payee for this programme.';
    }
    if (mode === 'Restricted' && !looksLikeAddress(wallet.trim())) return 'Enter the recipient’s smart wallet address.';
    return null;
  })();

  const tx = useTransaction<Award>({
    contract: 'program',
    onError: (error) => announce(`Award not finalized. ${error.message}`, 'alert'),
  });

  const finalize = async () => {
    if (reason) return;
    const chosen = mode;
    const result = await tx.send(async () => {
      if (target.sample) {
        return sampleSendable(
          () =>
            ({
              recipient: target.applicant,
              granted: target.award,
              payee,
              mode: { tag: chosen, values: undefined },
            }) as unknown as Award,
          sampleDelayMs,
        );
      }
      const assembled = await programme.finalize({
        applicant: target.applicant,
        payee,
        mode: { tag: chosen, values: undefined } as Mode,
      });
      return {
        signAndSend: async (options: Parameters<typeof assembled.signAndSend>[0]) => {
          const sent = await assembled.signAndSend(options);
          return { result: sent.result.unwrap() };
        },
      };
    });
    if (result) {
      announce(`Award finalized at ${formatIn(result.granted, target.asset)}.`);
      onFinalized({ granted: result.granted, mode: chosen, payee });
    }
  };

  const close = () => {
    if (tx.busy) return;
    onClose();
  };

  const done = tx.phase === 'success' ? tx.result : null;
  const failure = tx.error && !tx.busy ? (tx.error.code === 14 ? explainCode('program', 14) : tx.error) : null;

  return (
    <Modal
      open
      onClose={close}
      busy={tx.busy}
      eyebrow="Finalize"
      title={done ? 'Award finalized' : `Award for ${truncateAddress(target.applicant)}`}
    >
      {done ? (
        <TxDone
          title="Award finalized"
          rows={[
            { label: 'Award', value: formatIn(done.granted, target.asset) },
            { label: 'Paid by', value: mode, text: true },
            ...(mode === 'Direct' || mode === 'Restricted'
              ? [{ label: mode === 'Direct' ? 'Payee' : 'Wallet', value: truncateAddress(payee) }]
              : []),
          ]}
          actions={<Button onClick={close}>Done</Button>}
        >
          <p>
            The award is fixed. Each tranche now waits for a verifier.
            {target.sample && (
              <>
                {' '}
                <SampleTag>Sample</SampleTag>
              </>
            )}
          </p>
        </TxDone>
      ) : failure ? (
        <TxFailed
          title="Award not finalized"
          explained={failure}
          onRetry={() => void finalize()}
          actions={
            <Button variant="secondary" onClick={close}>
              Close
            </Button>
          }
        />
      ) : tx.busy ? (
        <TxPending title={`Finalizing ${formatIn(target.award, target.asset)}`} phase={tx.phase} />
      ) : (
        <div className="fin-sheet">
          <dl className="fin-sheet__figures">
            <div>
              <dt>Award</dt>
              <dd className="numeric">{formatIn(target.award, target.asset)}</dd>
            </div>
            <div>
              <dt>Left after it</dt>
              <dd className="numeric">{formatIn(target.left - target.award, target.asset)}</dd>
            </div>
          </dl>

          <fieldset className="fin-modes" aria-describedby={groupId}>
            <legend className="ui-field__label">How the award is paid</legend>
            <p id={groupId} className="fin-modes__help">
              Ranked by how much the contract itself guarantees.
            </p>
            {MODES.map((m) => (
              <label key={m} className="fin-mode">
                <input type="radio" name="fin-mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
                <span className="fin-mode__text">
                  <ModePill mode={m} />
                  <span>{CONSEQUENCE[m]}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {mode === 'Direct' && (
            <>
              <Field
                label="Verified payee"
                placeholder="G… or C…"
                value={directPayee}
                onChange={(event) => setDirectPayee(event.target.value)}
                hint={
                  target.sample ? (
                    'Any address, in a sample.'
                  ) : payeeCheck.data === true ? (
                    'Verified by this programme.'
                  ) : (
                    <>
                      Only a payee the creator verified. <Link to={`/admin/payees?programme=${target.programmeId}`}>See payees</Link>
                    </>
                  )
                }
                error={payeeCheck.data === false ? 'Not a verified payee for this programme.' : undefined}
                autoComplete="off"
                spellCheck={false}
              />
            </>
          )}
          {mode === 'Allocated' && (
            <p className="fin-sheet__note">No payee now. The recipient picks a verified payee when they spend it.</p>
          )}
          {mode === 'Restricted' && (
            <>
              <Field
                label="Recipient’s smart wallet"
                placeholder="C… or G…"
                value={wallet}
                onChange={(event) => setWallet(event.target.value)}
                hint="Tranches are paid into this wallet. It can differ from the account that applied."
                autoComplete="off"
                spellCheck={false}
              />
              {policyCheck.data === false && (
                <Notice tone="warn">
                  No spend policy is installed on this wallet. Every release will be refused until it is, and once
                  it is, it still limits only one signer.
                </Notice>
              )}
              {policyCheck.data === true && <Notice tone="ok">A spend policy is installed on this wallet.</Notice>}
            </>
          )}
          {mode === 'Open' && (
            <p className="fin-sheet__note">
              Paid to the recipient, <span className="numeric">{truncateAddress(target.applicant)}</span>. An open award
              can’t name anyone else.
            </p>
          )}

          <Button fullWidth disabled={Boolean(reason)} onClick={() => void finalize()}>
            Finalize award
          </Button>
          {reason && <DisabledReason>{reason}</DisabledReason>}
        </div>
      )}
    </Modal>
  );
}
