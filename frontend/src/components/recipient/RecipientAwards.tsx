import { AwardCard } from './AwardCard';
import { FIXTURE_MY_AWARDS } from '../../fixtures/recipientFixtures';
import './RecipientAwards.css';

interface RecipientAwardsProps {
  awards?: typeof FIXTURE_MY_AWARDS;
}

export function RecipientAwards({
  awards = FIXTURE_MY_AWARDS,
}: RecipientAwardsProps) {
  if (awards.length === 0) {
    return (
      <div className="recipient-awards__empty">
        No awards yet. Once an application is finalized, it appears here.
      </div>
    );
  }

  return (
    <div className="recipient-awards">
      {awards.map((award) => (
        <AwardCard
          key={award.programmeId}
          award={award}
        />
      ))}
      <span className="recipient-awards__note">
        Sample awards for the design phase.
      </span>
    </div>
  );
}
