import { AddressChip } from '../ui';
import './phasePill.css';
import './ProgrammeHeader.css';

const PHASE_ORDER = ['Open', 'Review', 'Settled'] as const;

const PHASE_NOTES: Record<(typeof PHASE_ORDER)[number], string> = {
  Open: 'Contributions and applications',
  Review: 'Reviewers vote; anyone can finalize',
  Settled: 'Releases at mileposts; refunds after window',
};

function phaseClass(phase: string): string {
  const key = phase.toLowerCase();
  if (key === 'open' || key === 'review' || key === 'settled' || key === 'cancelled') {
    return `phase-pill--${key}`;
  }
  return 'phase-pill--unknown';
}

/**
 * The top of the programme detail screen: what this programme is and where it
 * is in its life, before anything below is read.
 *
 * The phase is only ever the on-chain read: while it loads nothing is marked
 * current, and a failed read says so rather than guessing. The stepper marks
 * the current phase filled and any passed phase with a tick; a cancelled
 * programme shows no current step and gets a banner instead.
 *
 * There is no mode pill: a programme has no single mode, because each award
 * is given its own when it is finalized.
 */
export function ProgrammeHeader({
  id,
  name,
  creator,
  createdLedger,
  phase,
  phaseError = false,
  verified,
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
}) {
  const cancelled = phase === 'Cancelled';
  const currentIndex = phase ? PHASE_ORDER.indexOf(phase as (typeof PHASE_ORDER)[number]) : -1;
  const readLine = phase
    ? 'Phase read on-chain just now'
    : phaseError
      ? 'Could not read the phase on-chain'
      : 'Reading the phase on-chain…';

  return (
    <header className="programme-header">
      <div className="programme-header__badges">
        {phase && <span className={`phase-pill ${phaseClass(phase)}`}>{phase}</span>}
      </div>

      <h1 className="programme-header__name">{name}</h1>

      <div className="programme-header__meta">
        <AddressChip address={id} verified={verified} copyLabel="Copy programme id" />
        <span className="programme-header__meta-item">
          Created by <code className="numeric">{creator ?? '—'}</code>
        </span>
        <span className="programme-header__meta-item">
          Ledger <span className="numeric">{createdLedger?.toLocaleString() ?? '—'}</span>
        </span>
        <span className="programme-header__read">
          <span className="programme-header__read-dot" aria-hidden="true" />
          {readLine}
        </span>
      </div>

      <ol className="phase-stepper" aria-label="Programme phases">
        {PHASE_ORDER.map((step, i) => {
          const current = !cancelled && i === currentIndex;
          const done = !cancelled && currentIndex > i;
          const note = current ? `Now · ${PHASE_NOTES[step]}` : PHASE_NOTES[step];
          return (
            <li
              key={step}
              className={`phase-stepper__step${current ? ' phase-stepper__step--current' : ''}${
                done ? ' phase-stepper__step--done' : ''
              }`}
              aria-current={current ? 'step' : undefined}
            >
              <span className="phase-stepper__label">
                {done ? '✓ ' : ''}
                {step}
              </span>
              <span className="phase-stepper__note">{note}</span>
            </li>
          );
        })}
      </ol>

      {cancelled && (
        <div role="status" className="programme-header__cancelled">
          <b>This programme was cancelled.</b> No more money will be released. Contributors can
          claim back their share of everything not yet paid out.
        </div>
      )}
    </header>
  );
}
