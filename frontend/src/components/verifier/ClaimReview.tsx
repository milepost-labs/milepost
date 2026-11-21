import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Buffer } from 'buffer';
import { ShieldCheck } from 'lucide-react';
import type { Award, ProgrammeConfig } from '@milepost/program';
import type { Schema } from '@milepost/attest';
import { useSoroban } from '../../context/useSoroban';
import { useWallet } from '../../context/useWallet';
import { useAnnouncer } from '../../context/useAnnouncer';
import { useContractRead, useContractResult } from '../../hooks/useContractRead';
import { useTransaction } from '../../hooks/useTransaction';
import { explain } from '../../lib/errors';
import { formatDate, truncateAddress } from '../../lib/format';
import { formatIn } from '../../lib/funding';
import { programmeAsset, shortId } from '../../lib/programmeView';
import { absoluteLink, referenceHash, replyPath, type ClaimRequest, type SignedRecord } from '../../lib/verifyLinks';
import { Button, CopyButton, DisabledReason, Field, Modal, ModePill, Notice } from '../ui';
import { ErrorPanel } from '../state/AsyncStates';
import { TxDone, TxFailed, TxPending } from '../state/TxStatus';
import { restoreFromAssembled } from '../../lib/restore';

export interface Claim extends ClaimRequest {
  /** Where the claim came from: a recipient's request link, or the verifier's own lookup. */
  source: 'request' | 'lookup';
}

interface ClaimReviewProps {
  claim: Claim;
  /** The index's name for the programme, when it has one. */
  programmeName: string | null;
  onSigned: (record: SignedRecord) => void;
  /** The success sheet was closed: the claim is answered. */
  onFinished: () => void;
  /** "Can't confirm" for a request, "Clear" for a lookup. Sends nothing. */
  onDismiss: () => void;
}

/** The size of tranche `n` (from 1): an even split, with the remainder on the last. */
function trancheAmount(award: Award, n: number): bigint {
  const base = award.tranches > 0 ? award.granted / BigInt(award.tranches) : 0n;
  return n === award.tranches ? award.granted - base * BigInt(award.tranches - 1) : base;
}

/**
 * The verifier's review of one claim, with every fact read from the chain:
 * the programme's schema (and its definition, which is the condition), the
 * award and which tranche is next, and whether this address is a verifier.
 * A request link only says which programme and recipient to read.
 *
 * Signing is gated, with the first reason it is unavailable said beside the
 * button, and slowed down by the "I checked this myself" box. Signing calls
 * `attest.attest` under the programme's own schema, about the recipient, with
 * the hash of the optional reference. The sheet that follows hands back the
 * attestation id and a reply link for the recipient.
 */
export function ClaimReview({ claim, programmeName, onSigned, onFinished, onDismiss }: ClaimReviewProps) {
  const { address } = useWallet();
  const { attest, programmeAt, registry } = useSoroban();
  const announce = useAnnouncer();
  const checkId = useId();
  const reasonId = useId();
  const [checked, setChecked] = useState(false);
  const [reference, setReference] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [openedAt] = useState(() => Date.now());
  // The tranche being signed for, fixed when signing starts so the receipt still names it.
  const [signing, setSigning] = useState<{ tranche: number } | null>(null);

  const { programmeId, recipient } = claim;
  const programme = programmeAt(programmeId);
  const asset = programmeAsset({ sample: false });

  // An attestation is valid for any programme that trusts this verifier and
  // schema, so a programme the registry did not deploy could name a real
  // programme's schema and collect a usable proof. Only registry programmes.
  const registryRead = useContractRead(() => registry.is_programme({ addr: programmeId }), [registry, programmeId], {
    contract: 'registry',
  });
  const configRead = useContractResult<ProgrammeConfig>(() => programme.get_config(), [programme], {
    contract: 'program',
  });
  const phaseRead = useContractResult(() => programme.get_phase(), [programme], { contract: 'program' });
  const pausedRead = useContractRead(() => programme.is_paused(), [programme], { contract: 'program' });
  const verifierRead = useContractRead(
    () => programme.is_verifier({ addr: address ?? '' }),
    [programme, address],
    { contract: 'program', enabled: Boolean(address) },
  );
  const awardRead = useContractResult<Award>(
    () => programme.get_award({ recipient }),
    [programme, recipient],
    { contract: 'program' },
  );
  const config = configRead.data;
  const schemaHex = config ? Buffer.from(config.schema).toString('hex') : null;
  const schemaRead = useContractResult<Schema>(
    () => attest.get_schema({ uid: Buffer.from(schemaHex ?? '', 'hex') }),
    [attest, schemaHex],
    { contract: 'attest', enabled: schemaHex !== null },
  );

  const award = awardRead.data;
  const schema = schemaRead.data;
  const nextTranche = award ? award.tranches_released + 1 : null;
  const allReleased = award ? award.tranches_released >= award.tranches : false;
  const phase = phaseRead.data?.tag ?? null;
  const releaseClosed = config ? openedAt / 1000 >= Number(config.release_deadline) : false;
  const awardMissing = awardRead.error ? explain(awardRead.error, 'program') : null;

  const tx = useTransaction<Buffer>({
    contract: 'attest',
    onError: (error) => announce(`Attestation not signed. ${error.message}`, 'alert'),
  });

  /** Why signing is unavailable, the first reason that applies, or null. */
  const gate = (() => {
    if (!address) return 'Sign in with your verifier address first.';
    if (registryRead.error) return explain(registryRead.error, 'registry').message;
    if (registryRead.loading) return 'Checking the registry deployed this programme…';
    if (!registryRead.data) {
      return 'The Milepost registry did not deploy this programme, so its settings can’t be trusted. Don’t sign for it.';
    }
    if (configRead.error) return explain(configRead.error, 'program').message;
    if (configRead.loading || verifierRead.loading || awardRead.loading || phaseRead.loading) {
      return 'Reading the claim from the chain…';
    }
    if (config && config.attest !== attest.options.contractId) {
      return `This programme checks proofs in a different attestation registry (${truncateAddress(config.attest)}), so a signature from this app would not unlock anything.`;
    }
    if (!verifierRead.data) {
      return 'This address is not one of the programme’s verifiers. Only their attestations unlock tranches.';
    }
    if (phase === 'Cancelled') return 'The programme was cancelled, so no tranche can be released.';
    if (releaseClosed && config) {
      return `The release window closed on ${formatDate(config.release_deadline)}, so a new attestation would release nothing.`;
    }
    if (awardMissing) {
      return awardMissing.kind === 'none'
        ? 'This recipient has no award in this programme, so there is nothing to unlock.'
        : awardMissing.message;
    }
    if (allReleased) return 'Every tranche of this award has been released. There is nothing left to unlock.';
    // Checked error-first: a read that starts late does not report loading.
    if (schemaRead.error) return 'The programme’s schema is not registered in the attestation registry.';
    if (!schema) return 'Reading the programme’s schema…';
    if (schema.restricted && schema.authority !== address) {
      return `Only the schema’s authority (${truncateAddress(schema.authority)}) can sign under it.`;
    }
    if (!checked) return 'Tick the box above to confirm you checked it yourself.';
    return null;
  })();

  const sign = async () => {
    if (gate || !address || !config || nextTranche === null) return;
    const tranche = nextTranche;
    setSigning({ tranche });
    setSheetOpen(true);
    announce('Signing attestation.');
    const dataHash = await referenceHash(reference);
    const uid = await tx.send(async () => {
      const assembled = await attest.attest({
        attester: address,
        schema_uid: Buffer.from(config.schema),
        subject: recipient,
        data_hash: dataHash,
        expires_at: undefined,
      });
      return {
        restore: restoreFromAssembled(assembled),
        signAndSend: async (options: Parameters<typeof assembled.signAndSend>[0]) => {
          const sent = await assembled.signAndSend(options);
          return { result: sent.result.unwrap() };
        },
      };
    });
    if (uid) {
      announce(`Attestation signed. ${truncateAddress(recipient)} can now release tranche ${tranche}.`);
      onSigned({
        uid: Buffer.from(uid).toString('hex'),
        programmeId,
        recipient,
        attester: address,
        tranche,
        signedAt: Date.now(),
      });
    }
  };

  const closeSheet = () => {
    if (tx.busy) return;
    setSheetOpen(false);
    const done = tx.phase === 'success';
    tx.reset();
    if (done) {
      setChecked(false);
      setReference('');
      onFinished();
    }
  };

  const uidHex = tx.result ? Buffer.from(tx.result).toString('hex') : null;
  const reply = uidHex && address ? absoluteLink(replyPath({ programmeId, attestation: uidHex, attester: address })) : null;
  const condition = schema?.definition?.trim() || null;

  return (
    <section className="claim-review" aria-labelledby="claim-review-title">
      <p className="claim-review__eyebrow">Review claim</p>
      <h3 id="claim-review-title" className="claim-review__title">
        {condition ?? (schemaRead.loading || configRead.loading ? 'Reading the condition…' : 'Condition not readable')}
      </h3>
      {condition && <p className="claim-review__sub">The condition this programme’s schema asks you to confirm.</p>}

      <dl className="claim-review__facts">
        <div>
          <dt>Recipient</dt>
          <dd className="numeric">
            <span title={recipient}>{truncateAddress(recipient, 6, 6)}</span>
            <CopyButton value={recipient} label="Copy recipient address" />
          </dd>
        </div>
        <div>
          <dt>Programme</dt>
          <dd>
            <Link to={`/programme/${encodeURIComponent(programmeId)}`}>{programmeName ?? shortId(programmeId)}</Link>
          </dd>
        </div>
        <div>
          <dt>Tranche</dt>
          <dd className="numeric">
            {award && nextTranche !== null
              ? allReleased
                ? `All ${award.tranches} released`
                : `${nextTranche} of ${award.tranches}`
              : '—'}
          </dd>
        </div>
        {award && !allReleased && nextTranche !== null && (
          <div>
            <dt>It releases</dt>
            <dd className="numeric">{formatIn(trancheAmount(award, nextTranche), asset)}</dd>
          </div>
        )}
        {award && (
          <div>
            <dt>Paid by</dt>
            <dd>
              <ModePill mode={award.mode.tag} />
            </dd>
          </div>
        )}
        {claim.note && (
          <div>
            <dt>Recipient’s note</dt>
            <dd>
              {claim.note}
              <span className="claim-review__from">From their link, not the chain</span>
            </dd>
          </div>
        )}
        {schemaHex && (
          <div>
            <dt>Schema</dt>
            <dd className="numeric" title={schemaHex}>
              {schemaHex.slice(0, 8)}…{schemaHex.slice(-6)}
            </dd>
          </div>
        )}
      </dl>

      {configRead.error ? (
        <ErrorPanel explained={explain(configRead.error, 'program')} onRetry={configRead.refetch} />
      ) : null}
      {awardMissing && awardMissing.kind !== 'none' && (
        <ErrorPanel explained={awardMissing} onRetry={awardRead.refetch} />
      )}

      {claim.tranche !== null && nextTranche !== null && !allReleased && claim.tranche !== nextTranche && (
        <Notice tone="info">
          The link asked about tranche {claim.tranche}. One attestation unlocks whichever tranche is next, which
          is tranche {nextTranche}.
        </Notice>
      )}
      {pausedRead.data && (
        <Notice tone="warn">
          The creator has paused this programme. You can sign, but the recipient cannot release until it runs
          again.
        </Notice>
      )}

      <Field
        label="Your reference (optional)"
        placeholder="e.g. visit report VR-2291"
        value={reference}
        onChange={(event) => setReference(event.target.value)}
        hint="Only a hash of this goes on the chain, so keep your own copy. Don’t include personal details."
        autoComplete="off"
      />

      <label className="claim-review__check" htmlFor={checkId}>
        <input id={checkId} type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
        <span>
          <b>I checked this myself.</b> Signing can’t be undone. It unlocks this tranche for this person.
        </span>
      </label>

      <Button
        fullWidth
        icon={<ShieldCheck size={18} aria-hidden="true" />}
        disabled={Boolean(gate)}
        aria-describedby={gate ? reasonId : undefined}
        onClick={() => void sign()}
      >
        Sign attestation
      </Button>
      {gate && <DisabledReason id={reasonId}>{gate}</DisabledReason>}

      <Button variant="ghost" fullWidth onClick={onDismiss}>
        {claim.source === 'request' ? 'Can’t confirm' : 'Clear'}
      </Button>
      <p className="claim-review__fine">
        {claim.source === 'request'
          ? '“Can’t confirm” sends no transaction. It takes the request off your list, and the tranche stays locked.'
          : 'Clearing sends nothing. Look up another recipient whenever you need to.'}
      </p>

      <Modal
        open={sheetOpen}
        onClose={closeSheet}
        busy={tx.busy}
        eyebrow="Verify"
        title={tx.phase === 'success' ? 'Attestation signed' : 'Sign attestation'}
      >
        {tx.phase === 'success' && uidHex ? (
          <TxDone
            title="Attestation signed"
            rows={[
              {
                label: 'Attestation id',
                value: (
                  <span className="claim-review__uid numeric">
                    <span title={uidHex}>
                      {uidHex.slice(0, 10)}…{uidHex.slice(-6)}
                    </span>
                    <CopyButton value={uidHex} label="Copy attestation id" />
                  </span>
                ),
              },
              { label: 'For', value: <span className="numeric">{truncateAddress(recipient)}</span> },
              { label: 'Unlocks', value: `Tranche ${signing?.tranche ?? ''}`, text: true },
            ]}
            actions={
              <>
                {reply && <CopyButton value={reply} label="Copy reply link" showLabel />}
                <Button onClick={closeSheet}>Done</Button>
              </>
            }
          >
            <p>
              Send the recipient the reply link. It fills in their release with this attestation and your address.
              One attestation releases one tranche, once.
            </p>
          </TxDone>
        ) : tx.error && !tx.busy ? (
          <TxFailed
            title="Attestation not signed"
            explained={tx.error}
            onRetry={() => void sign()}
            actions={
              <Button variant="secondary" onClick={closeSheet}>
                Close
              </Button>
            }
          />
        ) : (
          <TxPending
            title={`Signing for tranche ${signing?.tranche ?? ''}`}
            phase={tx.phase}
            note="Approve it in Freighter. Nothing is unlocked until the network confirms."
          />
        )}
      </Modal>
    </section>
  );
}
