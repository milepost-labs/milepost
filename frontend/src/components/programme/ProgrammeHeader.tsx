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
 * `readStatus` says whether the phase shown came from an on-chain read this
 * session or is a stand-in, so the reader always knows which they are looking
 * at. The stepper marks the current phase filled and any passed phase with a
 * tick; a cancelled programme shows no current step and gets a banner instead.
 */
export function ProgrammeHeader({
  id,
  name,
  creator,
  createdLedger,
  phase,
  mode,
  sampleTag,
  readStatus,
  cancelled,
}: {
  id: string;
  name: string;
  creator: string | null;
  createdLedger: number | null;
  phase: string;
  mode: string;
  sampleTag: string | null;
  readStatus: 'live' | 'sample';
  cancelled: boolean;
}) {
  const currentIndex = PHASE_ORDER.indexOf(phase as (typeof PHASE_ORDER)[number]);

  return (
    <header className="programme-header">
      <div className="programme-header__badges">
        <span className={`phase-pill ${phaseClass(phase)}`}>{phase}</span>
        <span className="programme-header__mode">{mode} mode</span>
        {sampleTag && <span className="programme-header__sample">{sampleTag}</span>}
      </div>

      <h1 className="programme-header__name">{name}</h1>

      <div className="programme-header__meta">
        <AddressChip address={id} copyLabel="Copy programme id" />
        <span className="programme-header__meta-item">
          Created by <code className="numeric">{creator ?? '—'}</code>
        </span>
        <span className="programme-header__meta-item">
          Ledger <span className="numeric">{createdLedger?.toLocaleString() ?? '—'}</span>
        </span>
        <span className="programme-header__read">
          <span className="programme-header__read-dot" aria-hidden="true" />
          <span className="visually-hidden">Programme phase: </span>
          {readStatus === 'live'
            ? 'Phase read on-chain just now'
            : 'Phase and amounts: sample until on-chain reads are wired'}
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
          <b>This programme was cancelled.</b> No awards will be made. Contributors can claim
          their contributions back in full.
        </div>
      )}
    </header>
  );
}
