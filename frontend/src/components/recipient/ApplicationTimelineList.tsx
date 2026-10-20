import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { RecipientApplicationFixture } from '../../fixtures/recipientFixtures';
import { applicationStatus, applicationSteps } from '../../lib/applicationView';
import { useRecipientApplications } from '../../hooks';
import { ErrorState, Loading } from '../state/AsyncStates';
import { ApplicationWithdraw } from './ApplicationWithdraw';
import './ApplicationTimelineList.css';

interface ApplicationTimelineListProps {
  /**
   * Overrides the chain read with the entries given. The page omits this, so
   * the applicant's real applications are read per known programme; it exists
   * for tests and for screens that already hold the applications.
   */
  applications?: RecipientApplicationFixture[];
  onWithdrawn?: (programmeId: string) => void;
}

function phaseBadgeClass(phase: RecipientApplicationFixture['phase']): string {
  switch (phase) {
    case 'Open':
      return 'timeline-card__phase-badge--open';
    case 'Review':
      return 'timeline-card__phase-badge--review';
    case 'Cancelled':
      return 'timeline-card__phase-badge--cancelled';
    case 'Settled':
      return 'timeline-card__phase-badge--settled';
  }
}

/**
 * Every application from this recipient, and where each one stands.
 *
 * Read on-chain: `get_application(applicant)` on each known programme says
 * whether it exists, what was asked for, the votes so far and whether it is
 * finalised or withdrawn. The programme's phase and quorum explain what
 * happens next. Programmes with no application are simply absent rather than
 * shown as failures — see `useRecipientApplications`.
 */
export function ApplicationTimelineList({ applications }: ApplicationTimelineListProps = {}) {
  // No point reading when the caller already has the entries.
  const read = useRecipientApplications({ enabled: applications === undefined });
  const entries = applications ?? read.applications;

  if (entries.length === 0) {
    if (applications === undefined && read.loading) {
      return <Loading label="Reading your applications" rows={2} />;
    }
    if (applications === undefined && read.error) {
      return <ErrorState error={read.error} contract="program" onRetry={read.refetch} />;
    }
    return (
      <div className="timeline-empty">
        <p className="timeline-empty__title">No applications submitted yet.</p>
        <p className="timeline-empty__desc">
          Apply to an open programme and its progress will show here, read from the chain.
        </p>
      </div>
    );
  }

  return (
    <div className="timeline-grid">
      {entries.map((application) => {
        const steps = applicationSteps(application);

        return (
          <article
            key={application.programmeId}
            className="timeline-card"
            aria-labelledby={`timeline-app-${application.programmeId}`}
          >
            <div className="timeline-card__header">
              <Link
                id={`timeline-app-${application.programmeId}`}
                to={`/programme/${encodeURIComponent(application.programmeId)}`}
                className="timeline-card__title"
              >
                {application.programmeName}
              </Link>
              <div className="timeline-card__badges">
                {application.sample && (
                  <span className="timeline-card__sample">Sample data</span>
                )}
                <span
                  className={`timeline-card__phase-badge ${phaseBadgeClass(application.phase)}`}
                >
                  {application.phase}
                </span>
              </div>
            </div>

            <p className="timeline-card__status">{applicationStatus(application)}</p>

            <ol className="timeline-card__steps" aria-label="Application progress">
              {steps.map((step) => {
                const markerClass =
                  step.status === 'done'
                    ? 'timeline-step__marker--done'
                    : step.status === 'current'
                    ? 'timeline-step__marker--current'
                    : 'timeline-step__marker--pending';

                const isEmphasized = step.status === 'current';

                return (
                  <li key={step.title} className="timeline-step">
                    <span className={`timeline-step__marker ${markerClass}`} aria-hidden="true" />
                    <div className="timeline-step__content">
                      <div
                        className={`timeline-step__title-row${
                          isEmphasized ? ' timeline-step__title-row--emphasized' : ''
                        }`}
                      >
                        <span>{step.title}</span>
                        <span className="timeline-step__status-tag">· {step.tag}</span>
                      </div>
                      <span className="timeline-step__desc">{step.desc}</span>
                    </div>
                  </li>
                );
              })}
            </ol>

            <ApplicationWithdraw application={application} />
          </article>
        );
      })}
    </div>
  );
}
