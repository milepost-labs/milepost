import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useSoroban } from '../context/useSoroban';
import { useWallet } from '../context/useWallet';
import { useTransaction, phaseLabel } from '../hooks/useTransaction';
import { Button, Card, Field } from '../components/ui';
import './CreateProgramme.css';

/* ---------- helpers ---------- */

function dateToUnixSeconds(dateStr: string): number {
  if (!dateStr) return 0;
  return Math.floor(new Date(`${dateStr}T00:00:00Z`).getTime() / 1000);
}

function hexToBytes(hex: string, byteLen: number): Uint8Array {
  const padded = hex.padEnd(byteLen * 2, '0').slice(0, byteLen * 2);
  const bytes = new Uint8Array(byteLen);
  for (let i = 0; i < byteLen; i++) {
    bytes[i] = parseInt(padded.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function isValidAddress(addr: string): boolean {
  return /^[GS][A-Z0-9]{55}$/.test(addr);
}

function isValidHex(str: string, len: number): boolean {
  return /^[0-9a-f]{1,}$/.test(str) && str.length === len * 2;
}

/* ---------- step definitions ---------- */

const STEPS = ['Basics', 'Timeline', 'Reviewers', 'Verifiers', 'Review'] as const;
const STEP_COUNT = STEPS.length;

type StepKey = (typeof STEPS)[number];

interface StepMeta {
  key: StepKey;
  label: string;
  short: string;
}

const STEP_META: StepMeta[] = [
  { key: 'Basics', label: 'Programme basics', short: 'Basics' },
  { key: 'Timeline', label: 'Application timeline', short: 'Timeline' },
  { key: 'Reviewers', label: 'Reviewers & quorum', short: 'Reviewers' },
  { key: 'Verifiers', label: 'Verifiers & schema', short: 'Verifiers' },
  { key: 'Review', label: 'Review & submit', short: 'Review' },
];

/* ---------- form state ---------- */

interface FormData {
  name: string;
  token: string;
  schema: string;
  metadataHash: string;
  tranches: number;
  applyDeadline: string;
  reviewDeadline: string;
  releaseDeadline: string;
  sweepDeadline: string;
  reviewers: string[];
  verifiers: string[];
  quorum: number;
}

const INITIAL: FormData = {
  name: '',
  token: '',
  schema: '',
  metadataHash: '',
  tranches: 1,
  applyDeadline: '',
  reviewDeadline: '',
  releaseDeadline: '',
  sweepDeadline: '',
  reviewers: [],
  verifiers: [],
  quorum: 1,
};

/* ---------- per-step validation ---------- */

function validateStep(step: number, data: FormData): string | null {
  switch (step) {
    case 0: {
      if (!data.name.trim()) return 'Programme name is required.';
      if (!data.token.trim()) return 'Token contract address is required.';
      if (!isValidAddress(data.token.trim())) return 'Token must be a valid Stellar address (G or S prefix, 56 characters).';
      if (!data.schema.trim()) return 'Schema UID is required.';
      if (!isValidHex(data.schema.trim(), 32)) return 'Schema must be exactly 32 bytes (64 lowercase hex characters).';
      return null;
    }
    case 1: {
      if (!data.applyDeadline) return 'Apply deadline is required.';
      if (!data.reviewDeadline) return 'Review deadline is required.';
      if (!data.releaseDeadline) return 'Release deadline is required.';
      if (!data.sweepDeadline) return 'Sweep deadline is required.';
      const a = dateToUnixSeconds(data.applyDeadline);
      const r = dateToUnixSeconds(data.reviewDeadline);
      const rel = dateToUnixSeconds(data.releaseDeadline);
      const s = dateToUnixSeconds(data.sweepDeadline);
      const now = Math.floor(Date.now() / 1000);
      if (a <= now) return 'Apply deadline must be in the future.';
      if (a >= r) return 'Apply deadline must be before review deadline.';
      if (r >= rel) return 'Review deadline must be before release deadline.';
      if (rel >= s) return 'Release deadline must be before sweep deadline.';
      if (data.tranches < 1) return 'Tranches must be at least 1.';
      return null;
    }
    case 2: {
      if (data.reviewers.length === 0) return 'At least one reviewer is required.';
      for (const addr of data.reviewers) {
        if (!isValidAddress(addr)) return `Invalid reviewer address: ${addr}`;
      }
      if (data.quorum < 1) return 'Quorum must be at least 1.';
      if (data.quorum > Math.min(16, data.reviewers.length)) {
        return `Quorum cannot exceed ${Math.min(16, data.reviewers.length)} (min of 16 and reviewer count).`;
      }
      return null;
    }
    case 3: {
      if (data.verifiers.length === 0) return 'At least one verifier is required.';
      for (const addr of data.verifiers) {
        if (!isValidAddress(addr)) return `Invalid verifier address: ${addr}`;
      }
      return null;
    }
    default:
      return null;
  }
}

/* ---------- address list sub-component ---------- */

interface AddressListProps {
  label: string;
  addresses: string[];
  onChange: (addrs: string[]) => void;
}

function AddressList({ label, addresses, onChange }: AddressListProps) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (!isValidAddress(trimmed)) return;
    if (addresses.includes(trimmed)) return;
    onChange([...addresses, trimmed]);
    setDraft('');
  };

  const remove = (idx: number) => {
    onChange(addresses.filter((_, i) => i !== idx));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    }
  };

  return (
    <div>
      <span className="typo-text-sm" style={{ fontWeight: 'var(--weight-medium)' }}>{label}</span>
      <div className="address-list" style={{ marginTop: 'var(--space-2)' }}>
        {addresses.map((addr, idx) => (
          <div key={addr} className="address-item">
            <span>{addr}</span>
            <button
              type="button"
              className="address-item-remove"
              onClick={() => remove(idx)}
              aria-label={`Remove ${addr}`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter Stellar address (G…)"
          className="ui-input"
          style={{ flex: 1 }}
          aria-label={`Add ${label.toLowerCase()} address`}
        />
        <Button type="button" size="sm" onClick={add} disabled={!draft.trim() || !isValidAddress(draft.trim())}>
          Add
        </Button>
      </div>
    </div>
  );
}

/* ---------- main component ---------- */

export const CreateProgramme = () => {
  const { registry } = useSoroban();
  const wallet = useWallet();
  const tx = useTransaction<{ unwrap(): string }>({ contract: 'registry' });

  const [step, setStep] = useState(0);
  const [data, setData] = useState<FormData>(INITIAL);
  const [stepErrors, setStepErrors] = useState<Record<number, string | null>>({});
  const [resultAddr, setResultAddr] = useState<string | null>(null);

  const update = useCallback(<K extends keyof FormData>(key: K, value: FormData[K]) => {
    setData((prev) => ({ ...prev, [key]: value }));
  }, []);

  const stepError = validateStep(step, data);

  const canAdvance = stepError === null;

  const goNext = () => {
    if (!canAdvance) {
      setStepErrors((prev) => ({ ...prev, [step]: stepError }));
      return;
    }
    setStepErrors((prev) => ({ ...prev, [step]: null }));
    if (step < STEP_COUNT - 1) setStep(step + 1);
  };

  const goBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const submit = async () => {
    if (!wallet.address) return;

    const apply = dateToUnixSeconds(data.applyDeadline);
    const review = dateToUnixSeconds(data.reviewDeadline);
    const release = dateToUnixSeconds(data.releaseDeadline);
    const sweep = dateToUnixSeconds(data.sweepDeadline);

    const result = await tx.send(() =>
      registry.create({
        creator: wallet.address!,
        token: data.token.trim(),
        schema: hexToBytes(data.schema.trim(), 32),
        apply_deadline: BigInt(apply),
        review_deadline: BigInt(review),
        release_deadline: BigInt(release),
        sweep_deadline: BigInt(sweep),
        quorum: data.quorum,
        tranches: data.tranches,
        metadata_hash: hexToBytes(data.metadataHash || '00'.repeat(32), 32),
        reviewers: data.reviewers,
        verifiers: data.verifiers,
        name: data.name.trim(),
      }),
    );

    if (result) {
      const addr = result.unwrap();
      setResultAddr(addr);
      setStep(STEP_COUNT);
    }
  };

  const isDone = step >= STEP_COUNT;

  if (isDone) {
    return (
      <div className="wizard-container">
        <Card className="wizard-card">
          <div className="wizard-success">
            <div className="wizard-success-icon" aria-hidden="true">✓</div>
            <h2>Programme deployed</h2>
            <p>Your programme has been created on-chain.</p>
            <div className="programme-address" aria-label="Programme contract address">
              {resultAddr}
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center', marginTop: 'var(--space-4)' }}>
              <Link to="/funders">
                <Button type="button">Back to Dashboard</Button>
              </Link>
              <Button type="button" variant="secondary" onClick={() => { setData(INITIAL); setResultAddr(null); setStep(0); tx.reset(); }}>
                Create Another
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="wizard-container">
      <div className="wizard-header">
        <Link to="/funders" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>← Back to Dashboard</Link>
        <h1>Create Programme</h1>
        <p className="typo-text text-muted">Deploy a new funding programme via the Milepost registry.</p>
      </div>

      {/* Step indicator */}
      <nav className="wizard-steps" aria-label="Wizard progress">
        {STEP_META.map((s, i) => (
          <div
            key={s.key}
            className={[
              'wizard-step',
              i === step ? 'wizard-step--active' : '',
              i < step ? 'wizard-step--done' : '',
            ].filter(Boolean).join(' ')}
            aria-current={i === step ? 'step' : undefined}
          >
            {s.short}
          </div>
        ))}
      </nav>

      {/* Error banner */}
      {tx.error && (
        <div className="wizard-error" role="alert">
          <div className="wizard-error__message">{tx.error.message}</div>
          {tx.error.action && <div className="wizard-error__action">{tx.error.action}</div>}
          <Button type="button" size="sm" variant="ghost" onClick={tx.reset} style={{ marginTop: 'var(--space-2)' }}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Step body */}
      <Card className="wizard-card">
        {step === 0 && (
          <>
            <div>
              <h2>Programme basics</h2>
              <p>Name the programme and link its token and schema.</p>
            </div>
            <div className="wizard-fields">
              <Field label="Programme name" hint="e.g. Community health worker stipend 2026">
                <input
                  type="text"
                  value={data.name}
                  onChange={(e) => update('name', e.target.value)}
                  placeholder="Enter programme name"
                  className="ui-input"
                />
              </Field>
              <Field label="Token contract address" hint="The Stellar asset contract used for contributions">
                <input
                  type="text"
                  value={data.token}
                  onChange={(e) => update('token', e.target.value)}
                  placeholder="G… or S…"
                  className="ui-input"
                />
              </Field>
              <Field label="Schema UID" hint="32-byte hex (64 characters) — ask your admin for a schema ID">
                <input
                  type="text"
                  value={data.schema}
                  onChange={(e) => update('schema', e.target.value.toLowerCase())}
                  placeholder="0000000000000000000000000000000000000000000000000000000000000000"
                  className="ui-input"
                  maxLength={64}
                  style={{ fontFamily: 'var(--font-numeric)', fontSize: 'var(--text-sm)' }}
                />
              </Field>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div>
              <h2>Application timeline</h2>
              <p>Set strict deadlines for each phase. Each deadline must be later than the previous.</p>
            </div>
            <div className="timeline-visual" aria-label="Timeline of programme deadlines">
              {(['Apply', 'Review', 'Release', 'Sweep'] as const).map((label, i) => {
                const keys = ['applyDeadline', 'reviewDeadline', 'releaseDeadline', 'sweepDeadline'] as const;
                const dateVal = data[keys[i]];
                const hasValue = !!dateVal;
                return (
                  <div key={label} style={{ display: 'contents' }}>
                    <div className="timeline-node">
                      <div className={`timeline-dot ${hasValue ? 'timeline-dot--set' : ''}`}>
                        {hasValue ? '✓' : i + 1}
                      </div>
                      <span className="timeline-label">{label}</span>
                      {hasValue && <span className="timeline-date">{dateVal}</span>}
                    </div>
                    {i < 3 && (
                      <div className={`timeline-connector ${hasValue ? 'timeline-connector--ok' : ''}`} />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="wizard-fields">
              <div className="wizard-row">
                <Field label="Apply deadline" hint="When applications open">
                  <input
                    type="date"
                    value={data.applyDeadline}
                    onChange={(e) => update('applyDeadline', e.target.value)}
                    className="ui-input"
                  />
                </Field>
                <Field label="Review deadline" hint="When reviews begin">
                  <input
                    type="date"
                    value={data.reviewDeadline}
                    onChange={(e) => update('reviewDeadline', e.target.value)}
                    className="ui-input"
                  />
                </Field>
              </div>
              <div className="wizard-row">
                <Field label="Release deadline" hint="When funds can be released">
                  <input
                    type="date"
                    value={data.releaseDeadline}
                    onChange={(e) => update('releaseDeadline', e.target.value)}
                    className="ui-input"
                  />
                </Field>
                <Field label="Sweep deadline" hint="When unclaimed funds are swept">
                  <input
                    type="date"
                    value={data.sweepDeadline}
                    onChange={(e) => update('sweepDeadline', e.target.value)}
                    className="ui-input"
                  />
                </Field>
              </div>
              <Field label="Tranches" hint="Number of funding tranches (must be ≥ 1)">
                <input
                  type="number"
                  value={data.tranches}
                  onChange={(e) => update('tranches', Math.max(1, parseInt(e.target.value) || 1))}
                  min={1}
                  className="ui-input"
                />
              </Field>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <h2>Reviewers & quorum</h2>
              <p>Add at least one reviewer address and set the approval quorum.</p>
            </div>
            <div className="wizard-fields">
              <AddressList
                label="Reviewer addresses"
                addresses={data.reviewers}
                onChange={(addrs) => {
                  update('reviewers', addrs);
                  if (data.quorum > Math.min(16, addrs.length)) {
                    update('quorum', Math.min(16, addrs.length));
                  }
                }}
              />
              <Field
                label="Quorum"
                hint={`Minimum approvals to grant (1–${Math.min(16, data.reviewers.length || 1)})`}
              >
                <input
                  type="number"
                  value={data.quorum}
                  onChange={(e) => update('quorum', Math.max(1, parseInt(e.target.value) || 1))}
                  min={1}
                  max={Math.min(16, data.reviewers.length)}
                  className="ui-input"
                />
              </Field>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div>
              <h2>Verifiers & schema</h2>
              <p>Add at least one verifier address. Verifiers attest that work was completed.</p>
            </div>
            <div className="wizard-fields">
              <AddressList
                label="Verifier addresses"
                addresses={data.verifiers}
                onChange={(addrs) => update('verifiers', addrs)}
              />
              <Field label="Metadata hash" hint="Optional 32-byte hex — leave empty for zeros">
                <input
                  type="text"
                  value={data.metadataHash}
                  onChange={(e) => update('metadataHash', e.target.value.toLowerCase())}
                  placeholder="00… (optional)"
                  className="ui-input"
                  maxLength={64}
                  style={{ fontFamily: 'var(--font-numeric)', fontSize: 'var(--text-sm)' }}
                />
              </Field>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <div>
              <h2>Review & submit</h2>
              <p>Check every detail before signing. The transaction deploys a new programme contract.</p>
            </div>
            <div className="review-grid">
              <span className="review-label">Name</span>
              <span className="review-value">{data.name}</span>

              <span className="review-label">Token</span>
              <span className="review-value" style={{ fontFamily: 'var(--font-numeric)' }}>{data.token}</span>

              <span className="review-label">Schema</span>
              <span className="review-value" style={{ fontFamily: 'var(--font-numeric)' }}>{data.schema}</span>

              <span className="review-label">Tranches</span>
              <span className="review-value">{data.tranches}</span>

              <span className="review-label">Apply</span>
              <span className="review-value">{data.applyDeadline}</span>

              <span className="review-label">Review</span>
              <span className="review-value">{data.reviewDeadline}</span>

              <span className="review-label">Release</span>
              <span className="review-value">{data.releaseDeadline}</span>

              <span className="review-label">Sweep</span>
              <span className="review-value">{data.sweepDeadline}</span>

              <span className="review-label">Quorum</span>
              <span className="review-value">{data.quorum}</span>

              <span className="review-label">Reviewers</span>
              <span className="review-value review-value--list">
                {data.reviewers.map((r) => (
                  <span key={r} style={{ fontFamily: 'var(--font-numeric)' }}>{r}</span>
                ))}
              </span>

              <span className="review-label">Verifiers</span>
              <span className="review-value review-value--list">
                {data.verifiers.map((v) => (
                  <span key={v} style={{ fontFamily: 'var(--font-numeric)' }}>{v}</span>
                ))}
              </span>
            </div>
          </>
        )}

        {/* Step error */}
        {stepErrors[step] && (
          <div className="wizard-error" role="alert">
            <div className="wizard-error__message">{stepErrors[step]}</div>
          </div>
        )}

        {/* Navigation */}
        <div className="wizard-nav">
          <Button type="button" variant="ghost" onClick={goBack} disabled={step === 0 || tx.busy}>
            Back
          </Button>
          {step < STEP_COUNT - 1 ? (
            <Button type="button" onClick={goNext} disabled={!canAdvance || tx.busy}>
              Next
            </Button>
          ) : (
            <Button type="button" onClick={submit} loading={tx.busy} loadingLabel={phaseLabel(tx.phase)}>
              Create Programme
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
};
