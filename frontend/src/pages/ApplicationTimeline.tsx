import { RecipientNav } from '../components/recipient/RecipientNav';
import { ApplicationTimelineList } from '../components/recipient/ApplicationTimelineList';
import './RecipientDashboard.css';

export function ApplicationTimeline() {
  return (
    <section className="recipient-page" aria-labelledby="h-recipient-timeline">
      <div className="recipient-page__header">
        <h1 id="h-recipient-timeline" className="recipient-page__title">
          Your funding
        </h1>
        <p className="recipient-page__desc">
          Apply for what you need, see what's been released, and carry your record to the next programme.
        </p>
      </div>

      <RecipientNav currentSection="timeline" />
      <ApplicationTimelineList />
    </section>
  );
}
