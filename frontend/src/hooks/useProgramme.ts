import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useSoroban } from '../context/useSoroban';
import { DEMO_PROGRAMME_ID } from '../context/sorobanStore';
import { useContractRead } from './useContractRead';
import { useProgrammeParam } from './useProgrammeParam';

export function useProgramme() {
  const { programmeId } = useParams<{ programmeId?: string }>();
  const linkedProgramme = useProgrammeParam();
  const { programmeAt } = useSoroban();

  const linkedProgrammeId =
    !programmeId && linkedProgramme.status === 'valid' ? linkedProgramme.programmeId : null;
  const id = programmeId ?? linkedProgrammeId ?? DEMO_PROGRAMME_ID;
  const client = useMemo(() => programmeAt(id), [id, programmeAt]);
  const readsEnabled = !linkedProgramme.blocksProgramme || Boolean(programmeId);

  const { data: totalContributed } = useContractRead(
    () => client.total_contributed(),
    [client],
    { enabled: readsEnabled },
  );
  const { data: totalGranted } = useContractRead(
    () => client.total_granted(),
    [client],
    { enabled: readsEnabled },
  );
  const { data: totalReleased } = useContractRead(
    () => client.total_released(),
    [client],
    { enabled: readsEnabled },
  );
  const { data: totalRefunded } = useContractRead(
    () => client.total_refunded(),
    [client],
    { enabled: readsEnabled },
  );
  const { data: totalSwept } = useContractRead(
    () => client.total_swept(),
    [client],
    { enabled: readsEnabled },
  );

  return useMemo(() => {
    const contributed = totalContributed ?? 0n;
    const granted = totalGranted ?? 0n;
    const released = totalReleased ?? 0n;
    const refunded = totalRefunded ?? 0n;
    const swept = totalSwept ?? 0n;
    return {
      id,
      client,
      isDefault: !programmeId && linkedProgrammeId === null,
      linkedProgramme,
      readsEnabled,
      breakdown: {
        contributed,
        granted,
        released,
        refunded,
        swept,
        held: contributed - released - refunded - swept,
      },
    };
  }, [
    id,
    client,
    programmeId,
    linkedProgrammeId,
    linkedProgramme,
    readsEnabled,
    totalContributed,
    totalGranted,
    totalReleased,
    totalRefunded,
    totalSwept,
  ]);
}
