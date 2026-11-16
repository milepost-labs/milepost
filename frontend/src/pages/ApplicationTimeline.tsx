import { ApplicationTimelineList } from '../components/recipient/ApplicationTimelineList';
import { RecipientShell } from '../components/recipient/RecipientShell';

/** `/recipients/application-timeline`: where each application stands. */
export function ApplicationTimeline() {
  return (
    <RecipientShell section="applications">
      <ApplicationTimelineList />
    </RecipientShell>
  );
}
