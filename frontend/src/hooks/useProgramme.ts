import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useSoroban } from '../context/useSoroban';
import { DEMO_PROGRAMME_ID } from '../context/sorobanStore';
import { useContractRead } from './useContractRead';

export function useProgramme() {
  const { programmeId } = useParams<{ programmeId?: string }>();
  const { programmeAt } = useSoroban();

  const id = programmeId ?? DEMO_PROGRAMME_ID;
  const client = useMemo(() => programmeAt(id), [id, programmeAt]);

  const { data: totalContributed } = useContractRead(() => client.total_contributed(), [client]);
  const { data: totalGranted } = useContractRead(() => client.total_granted(), [client]);
  const { data: totalReleased } = useContractRead(() => client.total_released(), [client]);
  const { data: totalRefunded } = useContractRead(() => client.total_refunded(), [client]);
  const { data: totalSwept } = useContractRead(() => client.total_swept(), [client]);

  return useMemo(() => {
    const contributed = totalContributed ?? 0n;
    const granted = totalGranted ?? 0n;
    const released = totalReleased ?? 0n;
    const refunded = totalRefunded ?? 0n;
    const swept = totalSwept ?? 0n;
    return {
      id,
      client,
      isDefault: !programmeId,
      breakdown: {
        contributed,
        granted,
        released,
        refunded,
        swept,
        held: contributed - released - refunded - swept,
      },
    };
  }, [id, client, programmeId, totalContributed, totalGranted, totalReleased, totalRefunded, totalSwept]);
}
