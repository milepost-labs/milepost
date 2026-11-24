import { RecipientAwards } from '../components/recipient/RecipientAwards';
import { RecipientShell } from '../components/recipient/RecipientShell';

/** `/recipients/award-progress`: the same awards as `/recipients`, kept for old links. */
export function AwardProgress() {
  return (
    <RecipientShell section="awards">
      <RecipientAwards />
    </RecipientShell>
  );
}
