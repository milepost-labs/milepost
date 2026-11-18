import { useId, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Buffer } from 'buffer';
import { ArrowLeft, ArrowRight, Check, Rocket } from 'lucide-react';
import type { Schema } from '@milepost/attest';
import type { Config } from '@milepost/registry';
import { useSoroban } from '../../context/useSoroban';
import { useWallet } from '../../context/useWallet';
import { useAnnouncer } from '../../context/useAnnouncer';
import { useContractResult } from '../../hooks/useContractRead';
import { useTransaction } from '../../hooks/useTransaction';
import { useKeyedRead } from '../../hooks/useKeyedRead';
import { DEMO_PROGRAMME_ID } from '../../context/sorobanStore';
import { explain, explainCode, extractCode } from '../../lib/errors';
import { formatDate, looksLikeContractId, truncateAddress } from '../../lib/format';
import { fetchTokenName, parseTokenName } from '../../lib/token';
import { publishMetadata } from '../../lib/metadata';
import {
  buildMetadata,
  cleanHex,
  createArgs,
  detailsErrors,
  isHex32,
  peopleErrors,
  timelineErrors,
  type DeployDraft,
} from '../../lib/deployRules';
import { parseProposalParam } from '../../fixtures/adminFixtures';
import { Button, CopyButton, DisabledReason, Modal, Notice } from '../ui';
import { ErrorPanel } from '../state/AsyncStates';
import { TxDone, TxFailed, TxPending } from '../state/TxStatus';
import { DetailsStep, OTHER, PeopleStep, ReviewStep, TimelineStep } from './DeploySteps';
import './DeployProgramme.css';

const STEPS = ['Details', 'People', 'Timeline', 'Review & deploy'] as const;

type Form = Omit<DeployDraft, 'token' | 'schema'>;

const SCHEMA_NOT_FOUND = 1;

function blankForm(prefill: { name?: string; tranches?: number; purpose?: string } | null): Form {
  return {
    name: prefill?.name ?? '',
    minAward: '',
    tranches: prefill?.tranches ?? 3,
    metadataHash: '',
    describe: true,
    description: prefill?.purpose ?? '',
    vertical: '',
    contactName: '',
    contactEmail: '',
    labels: {},
    reviewers: [],
    verifiers: [],
    quorum: 1,
    applyDeadline: null,
    reviewDeadline: null,
    releaseDeadline: null,
    sweepDeadline: null,
  };
}

function firstError(errors: Record<string, string | undefined>): string | null {
  return Object.values(errors).find((e): e is string => Boolean(e)) ?? null;
}

/**
 * Deploy a programme through the registry, as a four-step wizard: Details,
 * People, Timeline, Review & deploy. One `registry.create` call at the end
 * deploys a new `program` contract with the signer as its creator.
 *
 * Every rule the constructor enforces is checked on the step where its value
 * is entered (see `lib/deployRules.ts`), and Continue says which one is still
 * unmet. The asset and the schema are confirmed on the chain as they are
 * chosen; the testnet pilot's asset and schema are offered first, read from
 * the seeded programme rather than written into the app. The deploy runs in a
 * sheet like every other write.
 *
 * Payment mode is not part of a deploy: each award gets its mode at finalize.
 */
export function DeployProgramme({ aside }: { aside?: ReactNode }) {
  const { registry, attest, demoProgramme, rpcUrl } = useSoroban();
  const wallet = useWallet();
  const announce = useAnnouncer();
  const titleId = useId();
  const reasonId = useId();
  const [searchParams] = useSearchParams();

  const proposalParam = searchParams.get('proposal');
  const proposal = useMemo(() => parseProposalParam(proposalParam), [proposalParam]);
  const prefill = proposal.ok ? proposal.proposal : null;
  const badProposal = proposalParam !== null && !proposal.ok;

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(() => blankForm(prefill));
  const [assetChoice, setAssetChoice] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [schemaChoice, setSchemaChoice] = useState('');
  const [schemaInput, setSchemaInput] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [nowSeconds] = useState(() => Math.floor(Date.now() / 1000));

  // The testnet pilot's asset and schema, offered as the first choice.
  const pilotRead = useKeyedRead(DEMO_PROGRAMME_ID, async () => {
    const config = (await demoProgramme.get_config()).result.unwrap();
    const schemaHex = Buffer.from(config.schema).toString('hex');
    const [tokenName, definition] = await Promise.all([
      fetchTokenName(config.token, rpcUrl).then((r) => parseTokenName(r.result)).catch(() => null),
      attest.get_schema({ uid: Buffer.from(config.schema) }).then((r) => r.result.unwrap().definition).catch(() => null),
    ]);
    return {
      token: config.token,
      tokenLabel: tokenName ? `${tokenName.code}${tokenName.isNative ? ' (native)' : ''}` : truncateAddress(config.token),
      schema: schemaHex,
      schemaLabel: definition ?? `${schemaHex.slice(0, 8)}…`,
    };
  });
  const pilot = pilotRead.data;

  const effectiveAsset = assetChoice || pilot?.token || OTHER;
  const token = effectiveAsset === OTHER ? tokenInput : effectiveAsset;
  const effectiveSchema = schemaChoice || pilot?.schema || OTHER;
  const schema = effectiveSchema === OTHER ? schemaInput : effectiveSchema;

  const tokenRead = useKeyedRead(looksLikeContractId(token) ? token : null, (id) =>
    fetchTokenName(id, rpcUrl).then((r) => parseTokenName(r.result)),
  );
  const schemaRead = useKeyedRead<Schema>(isHex32(schema) ? cleanHex(schema) : null, (uid) =>
    attest.get_schema({ uid: Buffer.from(uid, 'hex') }).then((r) => r.result.unwrap()),
  );
  const feeRead = useContractResult<Config>(() => registry.get_config(), [registry], { contract: 'registry' });

  const schemaMissing = schemaRead.status === 'error' && extractCode(schemaRead.error) === SCHEMA_NOT_FOUND;
  const schemaFacts = schemaRead.status === 'ok' ? schemaRead.data : null;
  const assetCode = tokenRead.status === 'ok' ? tokenRead.data.code : null;

  const draft: DeployDraft = { ...form, token, schema };
  const update = (patch: Partial<DeployDraft>) => setForm((prev) => ({ ...prev, ...patch }));

  const detailErrs = detailsErrors(draft, {
    tokenKnown: tokenRead.status === 'ok' ? true : tokenRead.status === 'error' ? false : null,
    schemaFound: schemaRead.status === 'ok' ? true : schemaRead.status === 'error' ? false : null,
  });
  const peopleErrs = peopleErrors(draft, schemaFacts);
  const timelineErrs = timelineErrors(draft, nowSeconds);
  const stepReasons = [firstError(detailErrs), firstError(peopleErrs), firstError(timelineErrs)];
  const valid = [...stepReasons.map((r) => r === null), stepReasons.every((r) => r === null)];
  const reachable = (i: number) => valid.slice(0, i).every(Boolean);

  const tx = useTransaction<string>({
    contract: 'registry',
    onError: (error) => announce(`Programme not deployed. ${error.message}`, 'alert'),
  });

  // Constructor refusals come from the programme being deployed, so its codes
  // describe them; registry codes 2 and 3 (fee, not initialised) keep theirs.
  const deployError = tx.error
    ? tx.error.code !== undefined && tx.error.code !== 2 && tx.error.code !== 3
      ? explainCode('program', tx.error.code)
      : tx.error
    : null;

  // Publishing the description comes first, so its hash can go on the chain.
  const [publish, setPublish] = useState<{ state: 'idle' | 'publishing' | 'failed' | 'done'; error?: string; hash?: string }>({
    state: 'idle',
  });

  const deploy = async (withoutDescription = false) => {
    if (!wallet.address || !valid[3]) return;
    setSheetOpen(true);
    tx.reset();
    let hash: string | undefined;
    if (draft.describe && !withoutDescription) {
      setPublish({ state: 'publishing' });
      announce('Publishing the description.');
      try {
        hash = await publishMetadata(buildMetadata(draft));
        setPublish({ state: 'done', hash });
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'The description store did not answer.';
        setPublish({ state: 'failed', error: reason });
        announce(`Description not published. ${reason}`, 'alert');
        return;
      }
    } else {
      setPublish({ state: 'idle' });
    }
    announce('Deploying programme.');
    const args = createArgs(draft, wallet.address, hash);
    const address = await tx.send(async () => {
      const assembled = await registry.create(args);
      return {
        signAndSend: async (options: Parameters<typeof assembled.signAndSend>[0]) => {
          const sent = await assembled.signAndSend(options);
          return { result: sent.result.unwrap() };
        },
      };
    });
    if (address) announce('Programme deployed.');
  };

  const closeSheet = () => {
    if (tx.busy || publish.state === 'publishing') return;
    setSheetOpen(false);
    if (tx.phase !== 'success') {
      tx.reset();
      setPublish({ state: 'idle' });
    }
  };

  const startOver = () => {
    tx.reset();
    setPublish({ state: 'idle' });
    setSheetOpen(false);
    setForm(blankForm(null));
    setAssetChoice('');
    setTokenInput('');
    setSchemaChoice('');
    setSchemaInput('');
    setStep(0);
  };

  const schemaPanel =
    schemaRead.status === 'ok' ? (
      <div className="deploy-schema">
        <span className="deploy-schema__title">
          <Check size={16} aria-hidden="true" /> Schema found
        </span>
        <dl>
          <div>
            <dt>Definition</dt>
            <dd>{schemaRead.data.definition}</dd>
          </div>
          <div>
            <dt>Revocable</dt>
            <dd>{schemaRead.data.revocable ? 'Yes' : 'No'}</dd>
          </div>
          <div>
            <dt>Restricted</dt>
            <dd>
              {schemaRead.data.restricted
                ? `Yes. Only ${truncateAddress(schemaRead.data.authority)} may sign under it`
                : 'No'}
            </dd>
          </div>
        </dl>
      </div>
    ) : schemaRead.status === 'loading' ? (
      <p className="deploy-schema__note">Checking the schema…</p>
    ) : schemaMissing ? (
      <Notice tone="warn" role="alert">
        No schema with this id exists. <Link to="/schemas/register">Register it first</Link>, or check the id.
      </Notice>
    ) : schemaRead.status === 'error' ? (
      <ErrorPanel explained={explain(schemaRead.error, 'attest')} live={false} />
    ) : null;

  const feeLine = feeRead.data ? `The protocol takes ${feeRead.data.fee_bps / 100}% of each contribution.` : null;
  const schemaLabel = schemaFacts?.definition ?? (schema ? `${cleanHex(schema).slice(0, 8)}…` : '—');
  const reason = !wallet.address && step === 3 ? 'Sign in to deploy. Your address becomes the creator.' : stepReasons[step] ?? null;

  const content = [
    <DetailsStep
      key="details"
      titleId={titleId}
      draft={draft}
      update={update}
      errors={detailErrs}
      pilot={pilot}
      assetChoice={effectiveAsset}
      setAssetChoice={setAssetChoice}
      tokenInput={tokenInput}
      setTokenInput={setTokenInput}
      assetCode={assetCode}
      tokenState={tokenRead.status}
      schemaChoice={effectiveSchema}
      setSchemaChoice={setSchemaChoice}
      schemaInput={schemaInput}
      setSchemaInput={setSchemaInput}
      schemaPanel={schemaPanel}
    />,
    <PeopleStep
      key="people"
      titleId={titleId}
      draft={draft}
      update={update}
      errors={peopleErrs}
      restrictedAuthority={schemaFacts?.restricted ? schemaFacts.authority : null}
    />,
    <TimelineStep key="timeline" titleId={titleId} draft={draft} update={update} errors={timelineErrs} nowSeconds={nowSeconds} />,
    <ReviewStep
      key="review"
      titleId={titleId}
      draft={draft}
      assetCode={assetCode}
      schemaLabel={schemaLabel}
      feeLine={feeLine}
      goTo={setStep}
    />,
  ][step];

  const deployed = tx.phase === 'success' ? tx.result : null;

  return (
    <div className="deploy-wizard">
      <nav className="deploy-rail" aria-label="Deploy steps">
        <ol>
          {STEPS.map((label, i) => {
            const done = i < step && valid[i];
            return (
              <li key={label}>
                <button
                  type="button"
                  className={done ? 'is-done' : undefined}
                  aria-current={i === step ? 'step' : undefined}
                  disabled={!reachable(i)}
                  onClick={() => setStep(i)}
                >
                  <span className="deploy-rail__n numeric" aria-hidden="true">
                    {done ? <Check size={16} /> : i + 1}
                  </span>
                  <span className="deploy-rail__label">{label}</span>
                  {done && <span className="visually-hidden">{' '}(done)</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <section className="deploy-panel" aria-labelledby={titleId}>
        {prefill && step === 0 && (
          <Notice tone="info">
            <span className="deploy-proposal">
              <strong>Pre-filled from a funder’s proposal.</strong> Check the terms with them before deploying.
              <span>
                From {prefill.contact || prefill.funder || 'a funder'}
                {prefill.amount && ` · plans to fund ${prefill.amount}`}
                {prefill.mode && ` · asks for ${prefill.mode} awards (set at finalize)`}
              </span>
              {prefill.purpose && <span>Pays for: {prefill.purpose}</span>}
              {prefill.condition && <span>Condition: {prefill.condition}</span>}
              {prefill.verifier && <span>Verifier: {prefill.verifier}</span>}
            </span>
          </Notice>
        )}
        {badProposal && (
          <Notice tone="warn" role="alert">
            This proposal link is damaged and couldn’t be read. Ask the funder to send it again.
          </Notice>
        )}

        {content}

        <div className="deploy-nav">
          {step > 0 ? (
            <Button variant="ghost" icon={<ArrowLeft size={18} aria-hidden="true" />} onClick={() => setStep(step - 1)}>
              Back
            </Button>
          ) : (
            <span />
          )}
          {step < STEPS.length - 1 ? (
            <Button
              disabled={!valid[step]}
              aria-describedby={reason ? reasonId : undefined}
              onClick={() => setStep(step + 1)}
            >
              Continue <ArrowRight size={18} aria-hidden="true" />
            </Button>
          ) : (
            <Button
              icon={<Rocket size={18} aria-hidden="true" />}
              disabled={!valid[3] || !wallet.address || tx.busy}
              aria-describedby={reason ? reasonId : undefined}
              onClick={() => void deploy()}
            >
              Deploy programme
            </Button>
          )}
        </div>
        {reason && (
          <div className="deploy-nav__reason">
            <DisabledReason id={reasonId}>{reason}</DisabledReason>
          </div>
        )}
      </section>

      {aside && <aside className="deploy-aside">{aside}</aside>}

      <Modal
        open={sheetOpen}
        onClose={closeSheet}
        busy={tx.busy || publish.state === 'publishing'}
        eyebrow="Deploy"
        title={deployed ? 'Programme deployed' : 'Deploy programme'}
      >
        {publish.state === 'publishing' ? (
          <TxPending
            title="Publishing the description"
            note="It’s stored under its hash, and that hash goes on the chain, so anyone can check the words are yours."
          />
        ) : publish.state === 'failed' ? (
          <div className="deploy-sheet__failed">
            <Notice tone="risk" role="alert">
              <span>
                <strong>The description wasn’t published.</strong> {publish.error} Nothing has been deployed yet.
              </span>
            </Notice>
            <div className="deploy-sheet__actions">
              <Button variant="ghost" onClick={closeSheet}>
                Close
              </Button>
              <Button variant="secondary" onClick={() => void deploy(true)}>
                Deploy without a description
              </Button>
              <Button onClick={() => void deploy()}>Try again</Button>
            </div>
          </div>
        ) : deployed ? (
          <TxDone
            title="Programme deployed"
            rows={[
              { label: 'Name', value: draft.name.trim(), text: true },
              ...(publish.hash
                ? [{ label: 'Description', value: <span title={publish.hash}>{publish.hash.slice(0, 10)}…</span> }]
                : []),
              {
                label: 'Address',
                value: (
                  <span className="deploy-sheet__address">
                    <span title={deployed}>{truncateAddress(deployed, 8, 6)}</span>
                    <CopyButton value={deployed} label="Copy programme address" />
                  </span>
                ),
              },
            ]}
            actions={
              <>
                <Button variant="secondary" onClick={startOver}>
                  Deploy another
                </Button>
                <Link className="ui-button ui-button--primary ui-button--md" to={`/programme/${encodeURIComponent(deployed)}`}>
                  Open its page
                </Link>
              </>
            }
          >
            <p>
              It takes contributions and applications until{' '}
              {form.applyDeadline !== null ? formatDate(form.applyDeadline) : 'its first deadline'}. The index lists it
              after its next run, usually within a few hours.
            </p>
          </TxDone>
        ) : deployError && !tx.busy ? (
          <TxFailed
            title="Programme not deployed"
            explained={deployError}
            onRetry={() => void deploy()}
            actions={
              <Button variant="secondary" onClick={closeSheet}>
                Close
              </Button>
            }
          />
        ) : (
          <TxPending title={`Deploying ${draft.name.trim() || 'the programme'}`} phase={tx.phase} />
        )}
      </Modal>
    </div>
  );
}
