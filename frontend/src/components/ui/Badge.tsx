import type { ReactNode } from 'react';
import { modeInfo } from '../../lib/modes';
import './ui.css';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`ui-badge ui-badge--${tone}`}>{children}</span>;
}

const PHASE_PILL_CLASS: Record<string, string> = {
  Open: 'ui-badge--phase-open',
  Review: 'ui-badge--phase-review',
  Settled: 'ui-badge--phase-settled',
  Cancelled: 'ui-badge--phase-cancelled',
};

/**
 * Programme phase, one fixed colour pair per phase (see the design
 * reference's "Phase badge colours") so it reads identically wherever it
 * appears. The phase name is always the visible text — colour is never the
 * only signal.
 */
export function PhaseBadge({ phase }: { phase: string }) {
  const phaseClass = PHASE_PILL_CLASS[phase] ?? 'ui-badge--neutral';
  return <span className={`ui-badge ui-badge--phase ${phaseClass}`}>{phase}</span>;
}

/**
 * An award's payment mode — `Direct`, `Allocated`, `Restricted` or `Open`
 * (four, not three: `Open` here means no escrow or payee restriction, a
 * different thing from the `Open` programme phase). Flat rather than
 * status-coloured: mode is metadata, not something to react to. The meter
 * shows how much the contract itself guarantees, so the four never read as
 * equals; its meaning is spelled out for screen readers.
 */
export function ModePill({ mode }: { mode: string }) {
  const info = modeInfo(mode);
  return (
    <span className="ui-mode-pill" title={info?.rank}>
      {info && (
        <span className="ui-mode-pill__meter" aria-hidden="true">
          {[1, 2, 3, 4].map((step) => (
            <i key={step} className={step <= info.strength ? 'is-filled' : undefined} />
          ))}
        </span>
      )}
      {mode}
      <span className="visually-hidden"> mode{info ? `, ${info.rank.toLowerCase()}` : ''}</span>
    </span>
  );
}

/**
 * Marks anything on screen that is stand-in data rather than a real read.
 * Road-paint yellow with hazard hatching: the one thing on a page that should
 * never be mistaken for the truth.
 */
export function SampleTag({ children = 'Sample data' }: { children?: ReactNode }) {
  return <span className="ui-sample-tag">{children}</span>;
}
