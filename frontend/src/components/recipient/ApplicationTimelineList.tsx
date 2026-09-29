import { Link } from 'react-router-dom';
import type { RecipientApplicationFixture } from '../../fixtures/recipientFixtures';
import { FIXTURE_APPLICATIONS } from '../../fixtures/recipientFixtures';
import { formatAmount } from '../../lib/amount';
import './ApplicationTimelineList.css';

interface ApplicationTimelineListProps {
  applications?: RecipientApplicationFixture[];
}

export function ApplicationTimelineList({
  applications = FIXTURE_APPLICATIONS,
}: ApplicationTimelineListProps) {
  if (applications.length === 0) {
    return (
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-card-lg)', padding: 'var(--space-5)', color: 'var(--text-muted)' }}>
        No applications submitted yet.
      </div>
    );
  }

  return (
    <div className="timeline-grid">
      {applications.map((ap) => {
        const votesCount = ap.votes.length;
        // Quorum is capped at 16 per protocol specification
        const effectiveQuorum = Math.min(16, Math.max(1, ap.quorum));

        // Calculate median vote
        let medianFormatted = '';
        if (votesCount > 0) {
          const sorted = ap.votes.map(BigInt).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
          const medianBigInt =
            votesCount % 2 === 1
              ? sorted[(votesCount - 1) / 2]
              : (sorted[votesCount / 2 - 1] + sorted[votesCount / 2]) / 2n;
          medianFormatted = formatAmount(medianBigInt, { asset: 'USDC' });
        }

        const isReviewCurrent = ap.phase === 'Review';
        const isAwardSetDone = votesCount >= effectiveQuorum;

        const steps = [
          {
            title: 'Applied',
            status: 'done' as const,
            tag: 'Done',
            desc: `Asked for ${formatAmount(BigInt(ap.requested), { asset: 'USDC' })} · ledger ${ap.submittedLedger.toLocaleString()}`,
          },
          {
            title: 'Review',
            status: isReviewCurrent ? ('current' as const) : ('pending' as const),
            tag: isReviewCurrent ? 'Now' : 'Next',
            desc:
              ap.phase === 'Open'
                ? 'Starts when applications close.'
                : `${votesCount} of ${effectiveQuorum} reviewer votes in`,
          },
          {
            title: 'Award set',
            status: isAwardSetDone ? ('done' as const) : ('pending' as const),
            tag: isAwardSetDone ? 'Done' : 'Next',
            desc: isAwardSetDone
              ? `Median of votes: ${medianFormatted}`
              : `Needs ${effectiveQuorum} votes. The award will be the median, not the lowest or the average.`,
          },
          {
            title: 'Tranches',
            status: 'pending' as const,
            tag: 'Next',
            desc: 'Released one at a time as a verifier confirms each condition.',
          },
        ];

        const phaseClass =
          ap.phase === 'Open'
            ? 'timeline-card__phase-badge--open'
            : ap.phase === 'Review'
            ? 'timeline-card__phase-badge--review'
            : 'timeline-card__phase-badge--settled';

        return (
          <article
            key={ap.programmeId}
            className="timeline-card"
            aria-labelledby={`timeline-app-${ap.programmeId}`}
          >
            <div className="timeline-card__header">
              <Link
                id={`timeline-app-${ap.programmeId}`}
                to={`/programme/${encodeURIComponent(ap.programmeId)}`}
                className="timeline-card__title"
              >
                {ap.programmeName}
              </Link>
              <span className={`timeline-card__phase-badge ${phaseClass}`}>
                {ap.phase}
              </span>
            </div>

            <ol className="timeline-card__steps" aria-label="Application progress">
              {steps.map((s, idx) => {
                const markerClass =
                  s.status === 'done'
                    ? 'timeline-step__marker--done'
                    : s.status === 'current'
                    ? 'timeline-step__marker--current'
                    : 'timeline-step__marker--pending';

                const isEmphasized = s.status === 'current';

                return (
                  <li key={idx} className="timeline-step">
                    <span className={`timeline-step__marker ${markerClass}`} aria-hidden="true" />
                    <div className="timeline-step__content">
                      <div
                        className={`timeline-step__title-row ${
                          isEmphasized ? 'timeline-step__title-row--emphasized' : ''
                        }`}
                      >
                        <span>{s.title}</span>
                        <span className="timeline-step__status-tag">· {s.tag}</span>
                      </div>
                      <span className="timeline-step__desc">{s.desc}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </article>
        );
      })}
    </div>
  );
}
