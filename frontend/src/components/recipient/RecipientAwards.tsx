import { AwardCard } from './AwardCard';
import { FIXTURE_MY_AWARDS, FIXTURE_PAYEES } from '../../fixtures/recipientFixtures';
import './RecipientAwards.css';

interface RecipientAwardsProps {
  awards?: typeof FIXTURE_MY_AWARDS;
  payees?: typeof FIXTURE_PAYEES;
}

export function RecipientAwards({
  awards = FIXTURE_MY_AWARDS,
  payees = FIXTURE_PAYEES,
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
          payees={payees}
        />
      ))}
      <span className="recipient-awards__note">
        Sample awards and payees for the design phase.
      </span>
    </div>
  );
}
