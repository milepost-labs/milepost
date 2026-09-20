import type { ReactNode } from 'react';
import './ui.css';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`ui-badge ui-badge--${tone}`}>{children}</span>;
}

/**
 * Programme phase, coloured by what it means for the reader.
 *
 * `Settled` is not a success and `Review` is not a warning — they are just
 * where the programme is. Only `Cancelled` is genuinely bad news.
 */
export function PhaseBadge({ phase }: { phase: string }) {
  const tone: BadgeTone =
    phase === 'Open' ? 'success' : phase === 'Cancelled' ? 'danger' : 'neutral';
  return <Badge tone={tone}>{phase}</Badge>;
}
