import { Link } from 'react-router-dom';
import { Button, Card } from '../ui';
import { Loading } from '../state/AsyncStates';
import type { ProgrammeParamState } from '../../hooks/useProgrammeParam';
import './ProgrammeParamNotice.css';

export function ProgrammeParamNotice({ state }: { state: ProgrammeParamState }) {
  if (!state.active || !state.blocksProgramme) return null;

  if (state.status === 'checking') {
    return (
      <Card title="Checking programme link">
        <Loading label="Checking programme link" rows={2} />
        <p className="typo-text text-muted">{state.message}</p>
      </Card>
    );
  }

  return (
    <Card title="Programme link could not be used">
      <div role="alert">
        <p className="typo-text text-muted">{state.message}</p>
        {state.programmeId && <p className="programme-param-notice__id numeric">{state.programmeId}</p>}
      </div>
      <div className="state-empty__actions">
        {state.status === 'error' && (
          <Button variant="secondary" onClick={state.refetch}>
            Try again
          </Button>
        )}
        <Button variant="secondary" onClick={state.clear}>
          Clear programme
        </Button>
        <Link to="/directory" className="btn-secondary">
          Browse programmes
        </Link>
      </div>
    </Card>
  );
}
