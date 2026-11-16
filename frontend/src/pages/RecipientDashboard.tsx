import { useSearchParams } from 'react-router-dom';
import { ApplyForm } from '../components/recipient/ApplyForm';
import { RecipientAwards } from '../components/recipient/RecipientAwards';
import { RecipientShell } from '../components/recipient/RecipientShell';
import { ProgrammeParamNotice } from '../components/programme/ProgrammeParamNotice';
import { useProgrammeParam } from '../hooks';

/**
 * `/recipients`: a recipient's awards, or the Apply form when the link asked
 * for it (`?apply=1`, or `?programme=` from a programme's "Apply").
 */
export function RecipientDashboard() {
  const [searchParams] = useSearchParams();
  const programmeParam = useProgrammeParam();
  const isApply = searchParams.has('programme') || searchParams.has('apply');

  return (
    <RecipientShell section={isApply ? 'apply' : 'awards'}>
      <ProgrammeParamNotice state={programmeParam} />
      {isApply ? (
        <ApplyForm
          preselectedProgrammeId={
            programmeParam.status === 'valid' ? (programmeParam.programmeId ?? undefined) : undefined
          }
        />
      ) : (
        <RecipientAwards />
      )}
    </RecipientShell>
  );
}
