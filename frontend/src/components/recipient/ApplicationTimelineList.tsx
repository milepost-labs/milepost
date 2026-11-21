import { Link } from 'react-router-dom';
import type { RecipientApplicationFixture } from '../../fixtures/recipientFixtures';
import { applicationStatus, applicationSteps } from '../../lib/applicationView';
import { useRecipientApplications } from '../../hooks';
import { Empty, ErrorState, Loading } from '../state/AsyncStates';
import { formatIn } from '../../lib/funding';
import { useProgrammeAsset } from '../../hooks/useProgrammeAsset';
import { PhaseBadge, SampleTag } from '../ui';
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
      <Empty
        title="No applications submitted yet."
        description="Apply to an open programme and its progress will show here, read from the chain."
        action={
          <Link to="/recipients?apply=1" className="ui-button ui-button--primary ui-button--md">
            Apply to a programme
          </Link>
        }
      />
    );
  }

  return (
    <div className="applications">
      {entries.map((application) => (
        <ApplicationEntry key={application.programmeId} application={application} />
      ))}
    </div>
  );
}

/** One application. Its own component so each reads its own programme's asset. */
function ApplicationEntry({ application }: { application: RecipientApplicationFixture }) {
  // The programme's own asset; null (no unit shown) until it is read.
  const asset = useProgrammeAsset(application.programmeId);
  const steps = applicationSteps(application, asset);

  return (
    <article
      className="application"
      aria-labelledby={`timeline-app-${application.programmeId}`}
    >
      <div className="application__head">
        <div className="application__title-group">
          <div className="application__badges">
            <PhaseBadge phase={application.phase} />
            {application.sample && <SampleTag />}
          </div>
          <h3 className="application__name">
            <Link
              id={`timeline-app-${application.programmeId}`}
              to={`/programme/${encodeURIComponent(application.programmeId)}`}
            >
              {application.programmeName}
            </Link>
          </h3>
        </div>
        <span className="application__asked numeric">
          {formatIn(BigInt(application.requested), asset)}
          <small>asked for</small>
        </span>
      </div>

      <p className="application__status">{applicationStatus(application, asset)}</p>

      <ol className="application__steps" aria-label="Application progress">
        {steps.map((step) => (
          <li
            key={step.title}
            className={`application__step application__step--${step.status}`}
            aria-current={step.status === 'current' ? 'step' : undefined}
          >
            <b>
              <span>{step.title}</span>
              <span className="application__tag">· {step.tag}</span>
            </b>
            <span className="application__desc">{step.desc}</span>
          </li>
        ))}
      </ol>

      <ApplicationWithdraw application={application} />
    </article>
  );
}
