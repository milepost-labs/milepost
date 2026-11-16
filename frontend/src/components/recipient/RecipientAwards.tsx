import { AwardCard } from './AwardCard';
import { Link } from 'react-router-dom';
import { Empty, ErrorState, Loading } from '../state/AsyncStates';
import { useRecipientAwards } from '../../hooks';
import type { RecipientAwardFixture } from '../../fixtures/recipientFixtures';
import './RecipientAwards.css';

interface RecipientAwardsProps {
  /** Awards to show instead of reading them, for callers that already have them. */
  awards?: RecipientAwardFixture[];
}

/**
 * The signed-in recipient's awards across every programme, read on-chain by
 * `useRecipientAwards`. Sample programmes keep their stand-in awards, each
 * tagged on its own card.
 */
export function RecipientAwards({ awards }: RecipientAwardsProps = {}) {
  // No point reading when the caller already has the entries.
  const read = useRecipientAwards({ enabled: awards === undefined });
  const entries = awards ?? read.awards;

  if (entries.length === 0) {
    if (awards === undefined && read.loading) {
      return <Loading label="Reading your awards" rows={2} />;
    }
    if (awards === undefined && read.error) {
      return <ErrorState error={read.error} contract="program" onRetry={read.refetch} />;
    }
    return (
      <Empty
        title="No awards yet"
        description="When a programme you applied to finalizes your award, its tranches show up here."
        action={
          <Link to="/recipients?apply=1" className="ui-button ui-button--primary ui-button--md">
            Apply to a programme
          </Link>
        }
      />
    );
  }

  return (
    <div className="recipient-awards">
      {entries.map((award) => (
        <AwardCard key={award.programmeId} award={award} />
      ))}
    </div>
  );
}
