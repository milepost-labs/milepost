import { RecipientNav } from '../components/recipient/RecipientNav';
import { RecipientAwards } from '../components/recipient/RecipientAwards';
import './RecipientDashboard.css';

export function AwardProgress() {
  return (
    <section className="recipient-page" aria-labelledby="h-recipient-awards">
      <div className="recipient-page__header">
        <h1 id="h-recipient-awards" className="recipient-page__title">
          Your funding
        </h1>
        <p className="recipient-page__desc">
          Apply for what you need, see what's been released, and carry your record to the next programme.
        </p>
      </div>

      <RecipientNav currentSection="awards" />
      <RecipientAwards />
    </section>
  );
}
