import type { ReactNode } from 'react';
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
 * An award's payout mode — `Direct`, `Allocated`, `Restricted` or `Open`
 * (four, not three: `Open` here means no escrow or payee restriction, a
 * different thing from the `Open` programme phase). Flat and descriptive
 * rather than status-coloured, matching the design reference: mode is
 * metadata, not something to react to.
 */
export function ModePill({ mode }: { mode: string }) {
  return <span className="ui-mode-pill">{mode} mode</span>;
}
