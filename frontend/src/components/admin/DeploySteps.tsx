import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Minus, Plus, X } from 'lucide-react';
import { truncateAddress, formatDate } from '../../lib/format';
import {
  addAddresses,
  DEADLINES,
  MAX_QUORUM,
  type DeadlineKey,
  type DeployDraft,
} from '../../lib/deployRules';
import { MODE_INFO } from '../../lib/modes';
import type { detailsErrors, peopleErrors, timelineErrors } from '../../lib/deployRules';
import { Button, DateField, Field, ModePill, Notice, Select } from '../ui';

// ── Shared pieces ───────────────────────────────────────────────────────────

/** A whole number with − and + either side, for small counts. */
export function Stepper({
  label,
  noun,
  value,
  min,
  max,
  onChange,
  help,
  error,
}: {
  label: string;
  /** For the buttons' names: "Fewer tranches", "More tranches". */
  noun: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  help?: ReactNode;
  error?: string;
}) {
  const labelId = useId();
  const messageId = useId();
  return (
    <div className="ui-field">
      <span className="ui-field__label" id={labelId}>
        {label}
      </span>
      <div className="deploy-stepper" role="group" aria-labelledby={labelId} aria-describedby={messageId}>
        <button type="button" aria-label={`Fewer ${noun}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
          <Minus size={18} aria-hidden="true" />
        </button>
        <output className="numeric" aria-live="polite">
          {value}
        </output>
        <button type="button" aria-label={`More ${noun}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>
      <p id={messageId} className={`ui-field__message${error ? ' ui-field__message--error' : ''}`} role={error ? 'alert' : undefined}>
        {error ?? help}
      </p>
    </div>
  );
}

/** A list of addresses with remove buttons, and a field to add more (pasting several works). */
export function AddressList({
  label,
  noun,
  items,
  onChange,
  help,
  error,
}: {
  label: string;
  /** "reviewer", "verifier": for the add field and remove buttons. */
  noun: string;
  items: string[];
  onChange: (items: string[]) => void;
  help?: ReactNode;
  error?: string;
}) {
  const inputId = useId();
  const messageId = useId();
  const [input, setInput] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  const add = () => {
    const result = addAddresses(items, input);
    setAddError(result.error);
    if (!result.error) {
      onChange(result.list);
      setInput('');
    }
  };

  const message = addError ?? error;

  return (
    <fieldset className="deploy-addresses">
      <legend className="ui-field__label">{label}</legend>
      {items.length > 0 && (
        <ul className="deploy-addresses__list" aria-label={label}>
          {items.map((a) => (
            <li key={a}>
              <span className="numeric" title={a}>
                {truncateAddress(a, 8, 6)}
              </span>
              <button
                type="button"
                className="deploy-addresses__remove"
                aria-label={`Remove ${noun} ${truncateAddress(a)}`}
                onClick={() => onChange(items.filter((x) => x !== a))}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="deploy-addresses__add">
        <label className="visually-hidden" htmlFor={inputId}>
          Add {noun} address
        </label>
        <div className={`ui-field__control${message ? ' ui-field__control--error' : ''}`}>
          <input
            id={inputId}
            placeholder="G… address"
            value={input}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={message ? true : undefined}
            aria-describedby={messageId}
            onChange={(event) => {
              setInput(event.target.value);
              setAddError(null);
            }}
            onPaste={(event) => {
              // A one-line input drops line breaks, which would glue a pasted
              // column of addresses together. Keep them apart instead.
              const text = event.clipboardData.getData('text');
              if (!/[\r\n]/.test(text)) return;
              event.preventDefault();
              const parts = text.split(/\s+/).filter(Boolean).join(', ');
              setInput((prev) => (prev.trim() ? `${prev.trim()}, ${parts}` : parts));
              setAddError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                add();
              }
            }}
          />
        </div>
        <Button variant="secondary" onClick={add}>
          Add
        </Button>
      </div>
      <p
        id={messageId}
        className={`ui-field__message${message ? ' ui-field__message--error' : ''}`}
        role={message ? 'alert' : undefined}
      >
        {message ?? help}
      </p>
    </fieldset>
  );
}

function StepHead({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <header className="deploy-step__head">
      <h2 id={id}>{title}</h2>
      <p>{children}</p>
    </header>
  );
}

// ── The four steps ──────────────────────────────────────────────────────────

export const OTHER = '__other';

export interface DetailsStepProps {
  titleId: string;
  draft: DeployDraft;
  update: (patch: Partial<DeployDraft>) => void;
  errors: ReturnType<typeof detailsErrors>;
  /** The asset and schema the testnet pilot uses, when they could be read. */
  pilot: { token: string; tokenLabel: string; schema: string; schemaLabel: string } | null;
  assetChoice: string;
  setAssetChoice: (value: string) => void;
  tokenInput: string;
  setTokenInput: (value: string) => void;
  /** The asset's code, read from its contract, once known. */
  assetCode: string | null;
  tokenState: 'idle' | 'loading' | 'ok' | 'error';
  schemaChoice: string;
  setSchemaChoice: (value: string) => void;
  schemaInput: string;
  setSchemaInput: (value: string) => void;
  /** What the schema registry says about the chosen id. */
  schemaPanel: ReactNode;
}

export function DetailsStep(props: DetailsStepProps) {
  const { draft, update, errors, pilot, assetCode } = props;
  const unit = assetCode ?? 'units';
  return (
    <>
      <StepHead id={props.titleId} title="Details">
        What the programme funds and how it pays.
      </StepHead>

      <Field
        label="Programme name"
        placeholder="e.g. Kano clinic nurse stipends 2027"
        value={draft.name}
        onChange={(event) => update({ name: event.target.value })}
        error={draft.name !== '' ? errors.name : undefined}
        hint="Public: it goes out with the programme’s creation and the index lists it."
      />

      <div className="deploy-two">
        <div className="deploy-stack">
          <Select
            label="Asset"
            value={props.assetChoice}
            onChange={(event) => props.setAssetChoice(event.target.value)}
            options={[
              ...(pilot ? [{ value: pilot.token, label: pilot.tokenLabel }] : []),
              { value: OTHER, label: 'Another asset contract…' },
            ]}
            hint={
              pilot && props.assetChoice === pilot.token
                ? 'Every payment uses it. It’s what the testnet pilot uses.'
                : 'Every payment in this programme uses it.'
            }
          />
          {props.assetChoice === OTHER && (
            <Field
              label="Asset contract"
              placeholder="C…"
              value={props.tokenInput}
              onChange={(event) => props.setTokenInput(event.target.value.trim())}
              error={props.tokenInput !== '' && props.tokenState !== 'loading' ? errors.token : undefined}
              hint={
                props.tokenState === 'loading'
                  ? 'Reading the asset…'
                  : assetCode
                    ? `Reads as ${assetCode}.`
                    : 'The Stellar asset contract to pay out in.'
              }
              autoComplete="off"
              spellCheck={false}
            />
          )}
        </div>
        <Field
          label="Minimum award"
          placeholder="0"
          inputMode="decimal"
          value={draft.minAward}
          onChange={(event) => update({ minAward: event.target.value })}
          error={errors.minAward}
          suffix={unit}
          hint="Awards below this are refused at finalize. Leave empty for none."
        />
      </div>

      <div className="deploy-two">
        <Stepper
          label="Tranches per award"
          noun="tranches"
          value={draft.tranches}
          min={1}
          max={24}
          onChange={(tranches) => update({ tranches })}
          help="One verifier signature unlocks each."
        />
        <div className="deploy-stack">
          <Select
            label="What verifiers sign"
            value={props.schemaChoice}
            onChange={(event) => props.setSchemaChoice(event.target.value)}
            options={[
              ...(pilot ? [{ value: pilot.schema, label: pilot.schemaLabel }] : []),
              { value: OTHER, label: 'Another schema id…' },
            ]}
            hint={
              <>
                The claim a verifier signs
                {pilot && props.schemaChoice === pilot.schema ? ', as in the testnet pilot' : ''}.{' '}
                <Link to="/schemas/register">Register a new one</Link>
              </>
            }
          />
          {props.schemaChoice === OTHER && (
            <Field
              label="Schema id"
              placeholder="64 hex characters"
              value={props.schemaInput}
              onChange={(event) => props.setSchemaInput(event.target.value.trim())}
              error={props.schemaInput !== '' && errors.schema && !errors.schema.endsWith('…') ? errors.schema : undefined}
              autoComplete="off"
              spellCheck={false}
            />
          )}
        </div>
      </div>
      {props.schemaPanel}

      <Notice tone="info">
        <span>
          <strong>Payment mode isn’t set here.</strong> Each award gets its mode when it is finalized. Ranked by how
          much the contract itself guarantees:
        </span>
        <span className="deploy-modes">
          {(Object.keys(MODE_INFO) as (keyof typeof MODE_INFO)[]).map((mode) => (
            <ModePill key={mode} mode={mode} />
          ))}
        </span>
      </Notice>

      <details className="deploy-more">
        <summary>Metadata hash (optional)</summary>
        <Field
          label="Metadata hash"
          placeholder="64 hex characters, empty for none"
          value={draft.metadataHash}
          onChange={(event) => update({ metadataHash: event.target.value.trim() })}
          error={draft.metadataHash !== '' ? errors.metadataHash : undefined}
          hint="The hash of an off-chain description, if you publish one. Stored as-is."
          autoComplete="off"
          spellCheck={false}
        />
      </details>
    </>
  );
}

export function PeopleStep({
  titleId,
  draft,
  update,
  errors,
  restrictedAuthority,
}: {
  titleId: string;
  draft: DeployDraft;
  update: (patch: Partial<DeployDraft>) => void;
  errors: ReturnType<typeof peopleErrors>;
  /** Set when the schema is restricted: the one address allowed to sign under it. */
  restrictedAuthority: string | null;
}) {
  const quorumMax = Math.max(1, Math.min(MAX_QUORUM, draft.reviewers.length));
  const missingAuthority = restrictedAuthority && !draft.verifiers.includes(restrictedAuthority) ? restrictedAuthority : null;
  return (
    <>
      <StepHead id={titleId} title="People">
        Reviewers set amounts. Verifiers unlock payments. One address can do both, but they’re separate jobs.
      </StepHead>

      <AddressList
        label="Reviewers"
        noun="reviewer"
        items={draft.reviewers}
        onChange={(reviewers) =>
          update({ reviewers, quorum: Math.max(1, Math.min(draft.quorum, reviewers.length || 1)) })
        }
        error={draft.reviewers.length > 0 ? errors.reviewers : undefined}
        help="Fixed once deployed: the contract has no way to add or remove a reviewer."
      />

      <Stepper
        label="Quorum"
        noun="votes needed"
        value={draft.quorum}
        min={1}
        max={quorumMax}
        onChange={(quorum) => update({ quorum })}
        error={errors.quorum}
        help={`Votes needed before an award can be finalized. 1 to ${MAX_QUORUM}, and no more than your ${
          draft.reviewers.length || 'listed'
        } reviewer${draft.reviewers.length === 1 ? '' : 's'}. The award is the median of the votes.`}
      />

      <AddressList
        label="Verifiers"
        noun="verifier"
        items={draft.verifiers}
        onChange={(verifiers) => update({ verifiers })}
        // The restricted-schema case has its own notice below, with the fix.
        error={draft.verifiers.length > 0 && !missingAuthority ? errors.verifiers : undefined}
        help="You can add or remove verifiers after deploying."
      />
      {missingAuthority && (
        <Notice tone="warn">
          <span>
            The schema is restricted: only <b className="numeric">{truncateAddress(missingAuthority)}</b> can sign
            under it, so it has to be a verifier.
          </span>
          <Button size="sm" variant="secondary" onClick={() => update({ verifiers: [...draft.verifiers, missingAuthority] })}>
            Add it as a verifier
          </Button>
        </Notice>
      )}
    </>
  );
}

const PHASES: { key: string; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'review', label: 'Review' },
  { key: 'release', label: 'Release' },
  { key: 'refunds', label: 'Refunds' },
];

export function TimelineStep({
  titleId,
  draft,
  update,
  errors,
  nowSeconds,
}: {
  titleId: string;
  draft: DeployDraft;
  update: (patch: Partial<DeployDraft>) => void;
  errors: ReturnType<typeof timelineErrors>;
  nowSeconds: number;
}) {
  // Each phase drawn as long as it lasts, once all four dates are in order.
  const points = [nowSeconds, ...DEADLINES.map((d) => draft[d.key])];
  const spans = points.every((p): p is number => p !== null) && !errors.order
    ? points.slice(1).map((p, i) => Math.max(p - (points[i] as number), 1))
    : [1, 1, 1, 1];

  return (
    <>
      <StepHead id={titleId} title="Timeline">
        Phases change by the clock, not by a button. Pausing stops actions but not the clock.
      </StepHead>

      <div className="deploy-phases" aria-hidden="true" style={{ gridTemplateColumns: spans.map((s) => `minmax(4.5rem, ${s}fr)`).join(' ') }}>
        {PHASES.map((p) => (
          <span key={p.key} className={`deploy-phases__bar deploy-phases__bar--${p.key}`}>
            {p.label}
          </span>
        ))}
      </div>

      <div className="deploy-two">
        {DEADLINES.map((d) => {
          const value = draft[d.key as DeadlineKey];
          return (
            <DateField
              key={d.key}
              label={d.label}
              value={value}
              min={nowSeconds}
              onChange={(next) => update({ [d.key]: next } as Partial<DeployDraft>)}
              error={value !== null ? errors[d.key as DeadlineKey] : undefined}
              hint={d.help}
            />
          );
        })}
      </div>
      {errors.order && (
        <p className="ui-field__message ui-field__message--error" role="alert">
          {errors.order}
        </p>
      )}
    </>
  );
}

export function ReviewStep({
  titleId,
  draft,
  assetCode,
  schemaLabel,
  feeLine,
  goTo,
}: {
  titleId: string;
  draft: DeployDraft;
  assetCode: string | null;
  schemaLabel: string;
  feeLine: string | null;
  goTo: (step: number) => void;
}) {
  const dates = DEADLINES.map((d) => draft[d.key]);
  const rows: { k: string; v: ReactNode; step: number }[] = [
    { k: 'Name', v: draft.name.trim(), step: 0 },
    {
      k: 'Asset',
      v: `${assetCode ?? truncateAddress(draft.token)}${draft.minAward.trim() ? ` · minimum award ${draft.minAward.trim()}` : ''}`,
      step: 0,
    },
    { k: 'Tranches', v: `${draft.tranches} per award · ${schemaLabel}`, step: 0 },
    {
      k: 'People',
      v: `${draft.reviewers.length} reviewer${draft.reviewers.length === 1 ? '' : 's'} · quorum ${draft.quorum} · ${
        draft.verifiers.length
      } verifier${draft.verifiers.length === 1 ? '' : 's'}`,
      step: 1,
    },
    {
      k: 'Timeline',
      v: <span className="numeric">{dates.map((d) => (d === null ? '—' : formatDate(d))).join(' → ')}</span>,
      step: 2,
    },
  ];
  return (
    <>
      <StepHead id={titleId} title="Review & deploy">
        These terms are fixed once deployed.
      </StepHead>
      <dl className="deploy-summary">
        {rows.map((r) => (
          <div key={r.k}>
            <dt>{r.k}</dt>
            <dd>{r.v}</dd>
            <button
              type="button"
              className="deploy-summary__edit"
              aria-label={`Change ${r.k.toLowerCase()}`}
              onClick={() => goTo(r.step)}
            >
              Change
            </button>
          </div>
        ))}
      </dl>
      <Notice tone="info">
        Deploying costs network fees in XLM, paid by you. {feeLine} You’ll be the creator: you can verify payees,
        manage verifiers, pause, cancel or extend the release window. Reviewers, quorum, tranches and the schema stay
        as set.
      </Notice>
    </>
  );
}
