import { useMemo } from 'react';
import type { Programme } from '@milepost/program';
import { useSoroban } from '../../context/useSoroban';
import { isPhase, type Phase } from '../../lib/phaseGate';
import { CancelAction } from './CancelAction';
import { ExtendDeadlineAction } from './ExtendDeadlineAction';
import { PauseAction } from './PauseAction';
import { VerifiersAction } from './VerifiersAction';

/** What every creator action needs to gate itself and refresh the page. */
export interface CreatorContext {
  programmeId: string;
  client: Programme;
  /** Null while the phase is being read. */
  phase: Phase | null;
  /** Registry verification: only `true` allows a write. */
  verified: boolean | null;
  /** Called after a write lands, so the page re-reads what it changed. */
  onChanged: () => void;
}

export interface CreatorActionsProps {
  programmeId: string;
  phase: string | null;
  verified: boolean | null;
  onChanged: () => void;
}

/**
 * The "Creator" group in the programme page's side column.
 *
 * Rendered only for the signed-in creator (the parent checks the address
 * against `get_config().creator`), so no one else sees any of it. Each action
 * gates itself on phase and says why when it is unavailable.
 */
export function CreatorActions({ programmeId, phase, verified, onChanged }: CreatorActionsProps) {
  const { programmeAt } = useSoroban();
  const client = useMemo(() => programmeAt(programmeId), [programmeAt, programmeId]);

  const context: CreatorContext = {
    programmeId,
    client,
    phase: isPhase(phase) ? phase : null,
    verified,
    onChanged,
  };

  return (
    <section className="programme-actions__group" aria-labelledby="programme-creator-heading">
      <h3 id="programme-creator-heading" className="programme-actions__group-title">
        Creator
      </h3>
      <p className="programme-actions__group-note">Only you can see these. You created this programme.</p>
      <ul className="programme-actions__list">
        <PauseAction {...context} />
        <VerifiersAction {...context} />
        <ExtendDeadlineAction {...context} />
        <CancelAction {...context} />
      </ul>
    </section>
  );
}
