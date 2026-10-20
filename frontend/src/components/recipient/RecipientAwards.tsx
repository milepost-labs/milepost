import { AwardCard } from './AwardCard';
import { Badge } from '../ui';
import { ErrorState, Loading } from '../state/AsyncStates';
import { useRecipientAwards } from '../../hooks';
import type { RecipientAwardFixture } from '../../fixtures/recipientFixtures';
import './RecipientAwards.css';

interface RecipientAwardsProps {
  /** Awards to show instead of reading them, for callers that already have them. */
  awards?: RecipientAwardFixture[];
}

/**
 * The signed-in recipient's awards across every programme, read on-chain by
 * `useRecipientAwards`. Sample programmes keep their stand-in awards, tagged.
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
      <div className="recipient-awards__empty">
        No awards yet. Once an application is finalized, it appears here.
      </div>
    );
  }

  return (
    <div className="recipient-awards">
      {entries.map((award) => (
        <AwardCard key={award.programmeId} award={award} />
      ))}
      {entries.some((award) => award.sample) && (
        <span className="recipient-awards__note">
          <Badge tone="neutral">Sample data</Badge> Awards on sample programmes are stand-ins for
          the design phase.
        </span>
      )}
    </div>
  );
}
