import { useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Ban, Check, ShieldAlert, ShieldCheck } from 'lucide-react';
import { AddressChip, ModePill, PhaseBadge, SampleTag } from '../ui';
import { formatDate, truncateAddress } from '../../lib/format';
import { registryVerificationCopy } from '../../lib/registryVerification';
import './ProgrammeHeader.css';

/** The four deadlines from the programme's config, in unix seconds. */
export interface ProgrammeDeadlines {
  apply: number;
  review: number;
  release: number;
  sweep: number;
}

interface Step {
  label: string;
  /** What its deadline does, before and after that deadline. */
  ahead: string;
  behind: string;
  at: keyof ProgrammeDeadlines;
}

const STEPS: Step[] = [
  { label: 'Open', ahead: 'Applications close', behind: 'Applications closed', at: 'apply' },
  { label: 'Review', ahead: 'Review ends', behind: 'Review ended', at: 'review' },
  { label: 'Settled', ahead: 'Release window ends', behind: 'Release window ended', at: 'release' },
  { label: 'Sweep', ahead: 'Leftovers to treasury from', behind: 'Leftovers to treasury since', at: 'sweep' },
];

/**
 * Which step the programme is on. The phase is the on-chain read; only the
 * move from Settled to Sweep comes from the clock, because the contract has no
 * phase for it: once the release window ends, what is left is refunded and
 * then swept.
 */
function currentStep(phase: string | null, deadlines: ProgrammeDeadlines | null, nowMs: number): number {
  if (phase === 'Open') return 0;
  if (phase === 'Review') return 1;
  if (phase === 'Settled') return deadlines && nowMs >= deadlines.release * 1000 ? 3 : 2;
  return -1;
}

/**
 * How far through the current step the clock is, 0 to 100, or null when it
 * cannot be known: the Open step has no start time on the chain, so it is
 * never drawn part-filled.
 */
function stepProgress(index: number, deadlines: ProgrammeDeadlines | null, nowMs: number): number | null {
  if (!deadlines || index < 1) return null;
  const start = deadlines[STEPS[index - 1].at] * 1000;
  const end = deadlines[STEPS[index].at] * 1000;
  if (end <= start) return null;
  return Math.round(Math.min(1, Math.max(0, (nowMs - start) / (end - start))) * 100);
}

/**
 * The top of the programme detail screen: what this programme is and where it
 * is in its life, before anything below is read.
 *
 * The phase is only ever the on-chain read: while it loads nothing is marked
 * current, and a failed read says so rather than guessing. The phase bar fills
 * the steps already passed and marks the current one "now"; a cancelled
 * programme shows no current step and gets a banner instead.
 *
 * "All programmes" returns to the directory the reader came from, filters
 * included, when the link carried them.
 *
 * The mode pill appears only when a planned mode is known. The contracts
 * choose a mode per award at `finalize`, not per programme, so a deployed
 * programme has none to read; the mode a sample programme shows is its
 * stand-in chain read, and the sample tag beside it says so. Inventing a mode
 * for a real programme would be a claim the chain cannot back.
 */
export function ProgrammeHeader({
  id,
  name,
  creator,
  createdLedger,
  phase,
  phaseError = false,
  verified,
  backTo = '/directory',
  mode = null,
  sample = false,
  deadlines = null,
  nowMs,
  action,
}: {
  id: string;
  name: string;
  creator: string | null;
  createdLedger: number | null;
  /** The on-chain phase, or null while it has not been read. */
  phase: string | null;
  phaseError?: boolean;
  /** From `registry.is_programme`; undefined while unread. */
  verified?: boolean;
  /** Where "All programmes" returns to; carries the directory's filters when known. */
  backTo?: string;
  /** The programme's planned payment mode, when one is known. */
  mode?: string | null;
  /** True for a stand-in programme, so the header says sample data. */
  sample?: boolean;
  /** From the programme's config; the phase bar shows no dates until it is read. */
  deadlines?: ProgrammeDeadlines | null;
  /** The clock the dates are compared with. Defaults to now. */
  nowMs?: number;
  /** Sits opposite the title: the page's one header action. */
  action?: ReactNode;
}) {
  const [mountedAt] = useState(() => Date.now());
  const now = nowMs ?? mountedAt;
  const cancelled = phase === 'Cancelled';
  const current = currentStep(phase, deadlines, now);
  const progress = stepProgress(current, deadlines, now);
  const readLine = phase
    ? 'Phase read on-chain just now'
    : phaseError
      ? 'Could not read the phase on-chain'
      : 'Reading the phase on-chain…';
  const registry = verified === undefined ? null : registryVerificationCopy(verified);

  return (
    <header className="programme-header">
      <Link to={backTo} className="programme-header__back">
        <ArrowLeft aria-hidden="true" />
        All programmes
      </Link>

      <div className="programme-header__top">
        <div className="programme-header__text">
          <div className="programme-header__badges">
            {phase && <PhaseBadge phase={phase} />}
            {mode && <ModePill mode={mode} />}
            {sample && <SampleTag />}
            {registry && (
              <span
                className={`programme-header__trust${verified ? '' : ' programme-header__trust--warn'}`}
                title={registry.description}
              >
                {verified ? <ShieldCheck aria-hidden="true" /> : <ShieldAlert aria-hidden="true" />}
                {registry.label}
              </span>
            )}
          </div>

          <h1 className="programme-header__name">{name}</h1>

          <div className="programme-header__meta">
            <span className="programme-header__meta-item">
              Programme <AddressChip address={id} verified={verified} copyLabel="Copy programme id" />
            </span>
            <span className="programme-header__meta-item">
              Creator{' '}
              <code className="numeric" title={creator ?? undefined}>
                {creator ? truncateAddress(creator) : '—'}
              </code>
            </span>
            <span className="programme-header__meta-item">
              Created at ledger <span className="numeric">{createdLedger?.toLocaleString() ?? '—'}</span>
            </span>
            <span className={`programme-header__read${phase ? ' programme-header__read--ok' : ''}`}>
              {phase && <Check aria-hidden="true" />}
              {readLine}
            </span>
          </div>
        </div>
        {action && <div className="programme-header__action">{action}</div>}
      </div>

      {cancelled && (
        <div role="status" className="programme-header__cancelled">
          <Ban aria-hidden="true" />
          <p>
            <b>This programme was cancelled.</b> No more money will be released. Contributors can
            claim back their share of everything not yet paid out.
          </p>
        </div>
      )}

      <ol className="phase-bar" aria-label="Programme phases">
        {STEPS.map((step, i) => {
          const isCurrent = i === current;
          const done = current > i;
          const at = deadlines ? deadlines[step.at] : null;
          const passed = at !== null && now >= at * 1000;
          const style =
            isCurrent && progress !== null ? ({ '--phase-progress': `${progress}%` } as CSSProperties) : undefined;
          return (
            <li
              key={step.label}
              className={`phase-bar__step${done ? ' phase-bar__step--done' : ''}${
                isCurrent ? ' phase-bar__step--now' : ''
              }`}
              aria-current={isCurrent ? 'step' : undefined}
              style={style}
            >
              <b className="phase-bar__label">
                {step.label}
                {isCurrent && <span className="phase-bar__now"> · now</span>}
                {done && <span className="visually-hidden"> (passed)</span>}
              </b>
              <span className="phase-bar__note">
                {passed ? step.behind : step.ahead}
                {at !== null && ` ${formatDate(at)}`}
              </span>
            </li>
          );
        })}
      </ol>
    </header>
  );
}
