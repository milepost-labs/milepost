import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Buffer } from 'buffer';
import { useSoroban } from '../../context/useSoroban';
import { useWallet } from '../../context/useWallet';
import { useAnnouncer } from '../../context/useAnnouncer';
import { useTransaction } from '../../hooks/useTransaction';
import { looksLikeAddress } from '../../lib/format';
import { formatDateTime } from '../../lib/format';
import { explain, extractCode } from '../../lib/errors';
import { tryParseAmount } from '../../lib/amount';
import { Button, DateField, Field, RadioGroup, TextArea } from '../ui';
import { ErrorPanel, PendingState, Success } from '../state/AsyncStates';
import {
  DEPLOY_MODES,
  FIXTURE_SCHEMAS,
  isHex32Bytes,
  parseProposalParam,
  quorumError,
  tranchesError,
  type DeployMode,
} from '../../fixtures/adminFixtures';
import './DeployProgramme.css';

const MODE_DESCRIPTIONS: Record<DeployMode, string> = {
  Direct: 'Paid straight to a payee set at award time. Accountable but paternalistic.',
  Allocated: 'Held in escrow; recipient picks a verified payee. Strongest guarantee.',
  Restricted:
    "Recipient's wallet, limited by a policy signer. Only as strong as that setup.",
  Open: 'Paid to the recipient with no restriction on onward spending.',
};

const STEPS = ['Details', 'People', 'Timeline', 'Review & deploy'] as const;

function parseAddressList(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

/**
 * Deploy a programme through the registry — thirteen arguments plus the
 * creator, including four ordered deadlines and a quorum bounded by the
 * reviewer count.
 *
 * Every constructor constraint from `contracts/program/src/lib.rs` is enforced
 * where it is entered, before anything is signed: deadlines run
 * apply < review < release < sweep and all lie in the future; quorum is 1–16
 * and no greater than the reviewer count; at least one verifier (or no tranche
 * could ever release); the schema UID must be well-formed (existence itself is
 * checked on-chain and reported with the programme's SchemaNotFound). Contract
 * rejections that still slip through are shown through `explain()`.
 *
 * Mode is recorded as the programme's planned default (proposals carry one);
 * the contracts choose the mode per award at `finalize`, so all four modes —
 * including Open — are selectable here without changing what is sent on-chain.
 */
export function DeployProgramme() {
  const { registry } = useSoroban();
  const wallet = useWallet();
  const announce = useAnnouncer();
  const [searchParams] = useSearchParams();

  const proposalParam = searchParams.get('proposal');
  const proposal = useMemo(() => parseProposalParam(proposalParam), [proposalParam]);
  const prefill = proposal.ok ? proposal.proposal : null;
  const badProposal = proposalParam !== null && !proposal.ok;

  const [step, setStep] = useState(0);
  const [name, setName] = useState(prefill?.name ?? '');
  const [mode, setMode] = useState<DeployMode>(prefill?.mode ?? 'Allocated');
  const [schemaInput, setSchemaInput] = useState('');
  const [reviewersText, setReviewersText] = useState('');
  const [verifiersText, setVerifiersText] = useState('');
  const [quorumInput, setQuorumInput] = useState('3');
  const [tranchesInput, setTranchesInput] = useState(
    prefill ? String(prefill.tranches) : '3',
  );
  const [applyDeadline, setApplyDeadline] = useState<number | null>(null);
  const [reviewDeadline, setReviewDeadline] = useState<number | null>(null);
  const [releaseDeadline, setReleaseDeadline] = useState<number | null>(null);
  const [sweepDeadline, setSweepDeadline] = useState<number | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [minAwardInput, setMinAwardInput] = useState('');
  const [metadataInput, setMetadataInput] = useState('');
  const [deployedAddress, setDeployedAddress] = useState<string | null>(null);

  const deployTx = useTransaction<string>({ contract: 'registry' });

  // Step 1 validation — where the terms are entered.
  const nameError = name.trim() === '' ? 'Give the programme a name.' : null;
  const schemaError = !isHex32Bytes(schemaInput)
    ? 'Enter the schema UID as a 32-byte hex string (64 characters). It must already exist in attest.'
    : null;

  // Step 2 validation — where the people are entered.
  const reviewers = useMemo(() => parseAddressList(reviewersText), [reviewersText]);
  const verifiers = useMemo(() => parseAddressList(verifiersText), [verifiersText]);
  const reviewersError =
    reviewers.length === 0
      ? 'A programme needs at least one reviewer.'
      : reviewers.some((a) => !looksLikeAddress(a))
        ? 'Every reviewer must be a valid Stellar address, one per line.'
        : null;
  const verifiersError =
    verifiers.length === 0
      ? 'A programme needs at least one verifier, or no tranche could ever be released.'
      : verifiers.some((a) => !looksLikeAddress(a))
        ? 'Every verifier must be a valid Stellar address, one per line.'
        : null;
  const quorumFormatError = quorumError(quorumInput);
  const quorumParsed = Number(quorumInput);
  const quorumCountError =
    !quorumFormatError && Number.isInteger(quorumParsed) && quorumParsed > reviewers.length && reviewers.length > 0
      ? `Quorum cannot exceed the reviewer count (${reviewers.length}).`
      : null;
  const quorumFinalError = quorumFormatError ?? quorumCountError;
  const tranchesFinalError = tranchesError(tranchesInput);

  // Step 3 validation — the deadlines, shown and checked as a sequence.
  const [nowSeconds] = useState(() => Math.floor(Date.now() / 1000));
  const deadlineFor = (label: string, value: number | null): string | null => {
    if (value === null) return `Set ${label}.`;
    if (value <= nowSeconds) return `${label} must be in the future.`;
    return null;
  };
  const applyError = deadlineFor('the applications deadline', applyDeadline);
  const reviewError = deadlineFor('the review deadline', reviewDeadline);
  const releaseError = deadlineFor('the release deadline', releaseDeadline);
  const sweepError = deadlineFor('the sweep deadline', sweepDeadline);
  const orderError =
    !applyError && !reviewError && !releaseError && !sweepError
      ? 'The deadlines must run in order: applications, then review, then release, then sweep.'
      : null;
  const sequenceError =
    applyDeadline !== null &&
    reviewDeadline !== null &&
    releaseDeadline !== null &&
    sweepDeadline !== null &&
    !(applyDeadline < reviewDeadline && reviewDeadline < releaseDeadline && releaseDeadline < sweepDeadline)
      ? orderError
      : null;

  // Step 4 validation — funds.
  const tokenError = !looksLikeAddress(tokenInput) ? 'Enter the Stellar asset contract address being distributed.' : null;
  const minAwardParsed = minAwardInput.trim() === '' ? { ok: true as const, value: 0n } : tryParseAmount(minAwardInput);
  const minAwardError = !minAwardParsed.ok ? minAwardParsed.error : null;
  const metadataError =
    metadataInput.trim() !== '' && !isHex32Bytes(metadataInput)
      ? 'Enter the metadata hash as a 32-byte hex string, or leave it empty.'
      : null;

  const stepValid = [
    !nameError && !schemaError,
    !reviewersError && !verifiersError && !quorumFinalError && !tranchesFinalError,
    !applyError && !reviewError && !releaseError && !sweepError && !sequenceError,
    !tokenError && !minAwardError && !metadataError,
  ];
  const allValid = stepValid.every(Boolean);

  const hint = !wallet.address
    ? 'Sign in with the registry admin account to deploy.'
    : name.trim() === ''
      ? 'Give the programme a name.'
      : 'The registry deploys it and becomes its admin of record. Terms can\u2019t be changed afterwards.';

  const deploy = async () => {
    if (!wallet.address || !allValid || !minAwardParsed.ok) return;
    const quorum = Number(quorumInput);
    const tranches = Number(tranchesInput);
    const clean = (v: string) => v.trim().replace(/^0x/i, '');
    announce('Deploying programme.');

    const result = await deployTx.send(async () => {
      type SignOptions = {
        signTransaction: (xdr: string) => Promise<{ signedTxXdr: string; signerAddress: string }>;
      };
      const tx = await (registry.create as unknown as (args: Record<string, unknown>) => Promise<{
        signAndSend: (options: SignOptions) => Promise<{ result: { unwrap: () => string } }>;
      }>)({
        creator: wallet.address as string,
        token: tokenInput.trim(),
        schema: Buffer.from(clean(schemaInput), 'hex'),
        apply_deadline: BigInt(applyDeadline as number),
        review_deadline: BigInt(reviewDeadline as number),
        release_deadline: BigInt(releaseDeadline as number),
        sweep_deadline: BigInt(sweepDeadline as number),
        quorum,
        tranches,
        metadata_hash: Buffer.from(metadataInput.trim() === '' ? '00'.repeat(32) : clean(metadataInput), 'hex'),
        reviewers,
        verifiers,
        name: name.trim(),
        minimum_award: minAwardParsed.value,
      });
      return {
        signAndSend: async (options: SignOptions) => {
          const sent = await tx.signAndSend(options);
          return { result: sent.result.unwrap() };
        },
      };
    });

    if (result !== null) {
      setDeployedAddress(result);
      announce('Programme deployed.');
    } else {
      announce('Programme not deployed.', 'alert');
    }
  };

  // Constructor rejections come from the programme being deployed (deadlines,
  // quorum, verifiers, schema), so program codes describe them best; pure
  // registry failures (fee, not initialised) keep the registry meaning.
  const deployError = deployTx.error
    ? (() => {
        const code = extractCode(deployTx.error);
        return explain(deployTx.error, code === 2 || code === 3 ? 'registry' : 'program');
      })()
    : null;

  const reset = () => {
    deployTx.reset();
    setDeployedAddress(null);
    setStep(0);
  };

  if (deployTx.phase === 'success' && deployedAddress !== null) {
    return (
      <div className="deploy">
        <Success
          title="✓ Programme deployed"
          live={false}
          description={
            <>
              <p className="deploy__summary numeric">
                {name.trim()} · {mode} · quorum {quorumInput} · {tranchesInput} tranches
              </p>
              <p className="deploy__address numeric" title={deployedAddress}>
                {deployedAddress}
              </p>
              <p className="typo-text text-muted">
                It opens for contributions and applications now. It will appear in the public
                index after the next indexer run, usually within a few hours.
              </p>
            </>
          }
          action={
            <Button variant="secondary" onClick={reset}>
              Deploy another
            </Button>
          }
        />
      </div>
    );
  }

  const deadlines = [
    { n: 1, label: 'Applications close', value: applyDeadline, onChange: setApplyDeadline, error: applyError },
    { n: 2, label: 'Review closes', value: reviewDeadline, onChange: setReviewDeadline, error: reviewError },
    { n: 3, label: 'Release closes', value: releaseDeadline, onChange: setReleaseDeadline, error: releaseError },
    { n: 4, label: 'Sweep opens', value: sweepDeadline, onChange: setSweepDeadline, error: sweepError },
  ];

  return (
    <div className="deploy">
      <h2 className="deploy__title">New programme</h2>

      {prefill && (
        <div className="deploy__proposal" role="note">
          <span className="deploy__proposal-title">Pre-filled from a funder&apos;s proposal</span>
          <span className="deploy__proposal-row">
            <span>From</span>
            <span>{prefill.contact || prefill.funder || '—'}</span>
          </span>
          {prefill.amount && (
            <span className="deploy__proposal-row">
              <span>Plans to fund</span>
              <span>{prefill.amount} XLM</span>
            </span>
          )}
          {prefill.purpose && (
            <span className="deploy__proposal-row">
              <span>What it pays for</span>
              <span>{prefill.purpose}</span>
            </span>
          )}
          {prefill.condition && (
            <span className="deploy__proposal-row">
              <span>Condition</span>
              <span>{prefill.condition}</span>
            </span>
          )}
          {prefill.verifier && (
            <span className="deploy__proposal-row">
              <span>Verifier</span>
              <span>{prefill.verifier}</span>
            </span>
          )}
          <span className="deploy__proposal-foot">
            Check the terms with them before deploying. Deployed terms can&apos;t be changed.
          </span>
        </div>
      )}
      {badProposal && (
        <div className="deploy__bad-proposal" role="alert">
          This proposal link is damaged and couldn&apos;t be read. Ask the funder to send it
          again.
        </div>
      )}

      <ol className="deploy__steps" aria-label="Deploy steps">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? 'deploy__step deploy__step--current' : 'deploy__step'} aria-current={i === step ? 'step' : undefined}>
            <span className="deploy__step-n numeric" aria-hidden="true">{i + 1}</span> {label}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="deploy__pane">
          <Field
            label="Name"
            placeholder="e.g. Health worker stipends 2027"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={name.trim() !== '' ? null : undefined}
            hint={name.trim() === '' ? 'Give the programme a name.' : undefined}
          />
          <RadioGroup
            label="Mode · where released money goes"
            name="deploy-mode"
            value={mode}
            onChange={setMode}
            options={DEPLOY_MODES.map((m) => ({ value: m, label: m, description: MODE_DESCRIPTIONS[m] }))}
            hint="The planned default for awards under this programme. Each award still picks its mode at finalize."
          />
          <Field
            label="Attestation schema UID"
            placeholder="32-byte hex (64 characters)"
            value={schemaInput}
            onChange={(event) => setSchemaInput(event.target.value)}
            error={schemaInput !== '' ? (schemaError ?? undefined) : undefined}
            hint={
              schemaInput === ''
                ? `The schema tranches release against. It must already exist in attest. Known: ${FIXTURE_SCHEMAS.map((s) => s.id).join(', ')}.`
                : undefined
            }
            spellCheck={false}
          />
        </div>
      )}

      {step === 1 && (
        <div className="deploy__pane">
          <div className="deploy__duo">
            <Field
              label="Reviewer quorum"
              inputMode="numeric"
              value={quorumInput}
              onChange={(event) => setQuorumInput(event.target.value)}
              error={quorumFinalError ?? undefined}
              hint={quorumFinalError ? undefined : 'Whole number from 1 to 16 (MAX_QUORUM), no more than the reviewer count.'}
            />
            <Field
              label="Tranches per award"
              inputMode="numeric"
              value={tranchesInput}
              onChange={(event) => setTranchesInput(event.target.value)}
              error={tranchesFinalError ?? undefined}
            />
          </div>
          <TextArea
            label="Reviewers (one address per line)"
            value={reviewersText}
            onChange={(event) => setReviewersText(event.target.value)}
            error={reviewersText !== '' ? (reviewersError ?? undefined) : undefined}
            hint={
              reviewersText === ''
                ? 'At least one reviewer. Quorum is bounded by this list.'
                : reviewersError ? undefined : `${reviewers.length} reviewer${reviewers.length === 1 ? '' : 's'}`
            }
            rows={3}
            spellCheck={false}
          />
          <TextArea
            label="Verifiers (one address per line)"
            value={verifiersText}
            onChange={(event) => setVerifiersText(event.target.value)}
            error={verifiersText !== '' ? (verifiersError ?? undefined) : undefined}
            hint={
              verifiersText === ''
                ? 'At least one verifier, or no tranche could ever be released.'
                : verifiersError ? undefined : `${verifiers.length} verifier${verifiers.length === 1 ? '' : 's'}`
            }
            rows={3}
            spellCheck={false}
          />
        </div>
      )}

      {step === 2 && (
        <div className="deploy__pane">
          <ol className="deploy__sequence" aria-label="Programme deadlines in order">
            {deadlines.map((d) => (
              <li key={d.label} className="deploy__sequence-item">
                <span className="deploy__sequence-n numeric" aria-hidden="true">{d.n}</span>
                <div className="deploy__sequence-field">
                  <DateField
                    label={d.label}
                    value={d.value}
                    onChange={d.onChange}
                    error={d.error ?? undefined}
                    hint={d.value !== null && !d.error ? formatDateTime(d.value) : undefined}
                  />
                </div>
              </li>
            ))}
          </ol>
          {sequenceError && (
            <p className="ui-field__message ui-field__message--error" role="alert">
              {sequenceError}
            </p>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="deploy__pane">
          <Field
            label="Asset contract"
            placeholder="C…"
            value={tokenInput}
            onChange={(event) => setTokenInput(event.target.value)}
            error={tokenInput !== '' ? (tokenError ?? undefined) : undefined}
            hint={tokenInput === '' ? 'The Stellar asset contract being distributed.' : undefined}
            spellCheck={false}
          />
          <Field
            label="Minimum award (optional, XLM)"
            placeholder="0"
            value={minAwardInput}
            onChange={(event) => setMinAwardInput(event.target.value)}
            error={minAwardError ?? undefined}
            inputMode="decimal"
            suffix="XLM"
          />
          <Field
            label="Metadata hash (optional)"
            placeholder="32-byte hex, empty for none"
            value={metadataInput}
            onChange={(event) => setMetadataInput(event.target.value)}
            error={metadataInput !== '' ? (metadataError ?? undefined) : undefined}
            spellCheck={false}
          />
          <div className="deploy__review" role="note" aria-label="Deploy summary">
            <span className="deploy__review-title">Review</span>
            <span className="deploy__proposal-row"><span>Programme</span><span>{name.trim() || '—'}</span></span>
            <span className="deploy__proposal-row"><span>Mode (planned)</span><span>{mode}</span></span>
            <span className="deploy__proposal-row"><span>Quorum</span><span className="numeric">{quorumInput} of {reviewers.length} reviewers</span></span>
            <span className="deploy__proposal-row"><span>Tranches</span><span className="numeric">{tranchesInput}</span></span>
            <span className="deploy__proposal-row"><span>Verifiers</span><span className="numeric">{verifiers.length}</span></span>
            <span className="deploy__proposal-row">
              <span>Deadlines</span>
              <span className="numeric">
                {[applyDeadline, reviewDeadline, releaseDeadline, sweepDeadline].every((d) => d !== null)
                  ? [applyDeadline, reviewDeadline, releaseDeadline, sweepDeadline].map((d) => formatDateTime(d as number)).join(' → ')
                  : '—'}
              </span>
            </span>
          </div>
        </div>
      )}

      <p className="deploy__hint">{hint}</p>

      {deployTx.busy && <PendingState title="Deploying through the registry…" />}
      {deployError && <ErrorPanel explained={deployError} />}

      <div className="deploy__nav">
        {step > 0 && (
          <Button variant="secondary" onClick={() => setStep((s) => s - 1)} disabled={deployTx.busy}>
            Back
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!stepValid[step] || deployTx.busy}>
            Next
          </Button>
        ) : (
          <Button
            onClick={deploy}
            disabled={!allValid || !wallet.address || deployTx.busy}
            loading={deployTx.busy}
            loadingLabel="Deploying…"
          >
            Deploy programme
          </Button>
        )}
      </div>
    </div>
  );
}
