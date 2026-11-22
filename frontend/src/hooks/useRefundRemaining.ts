import { useMemo } from 'react';
import { useSoroban } from '../context/useSoroban';
import { proportionalRefund } from '../lib/funding';
import { useContractRead } from './useContractRead';

export interface RefundRemaining {
  /** What this donor has already claimed: `refunded_to(donor)`. Zero until read. */
  refundedSoFar: bigint;
  /**
   * What the donor can still claim: their proportional share of what is
   * unpaid, less what they have claimed, worked out by the contract's own
   * formula from on-chain figures. Null while it is being read, or if the
   * read failed.
   */
  remaining: bigint | null;
  loading: boolean;
  /** Read both figures again, after a claim. */
  refetch: () => void;
}

/**
 * How much of their refund a donor has claimed and how much is still theirs,
 * from the programme's own figures rather than a listing's. A partial claim is
 * capped by the second number, so it has to match the contract exactly:
 * `refund_partial` refuses anything above it.
 *
 * Skipped for sample programmes (no contract) and without a donor address.
 */
export function useRefundRemaining(
  programmeId: string | null,
  donor: string | null,
  sample: boolean,
): RefundRemaining {
  const { programmeAt } = useSoroban();
  const client = useMemo(
    () => (programmeId && !sample ? programmeAt(programmeId) : null),
    [programmeId, sample, programmeAt],
  );

  const read = useContractRead(
    async () => {
      const [contributed, total, released, config, refunded] = await Promise.all([
        client!.contributed_by({ donor: donor! }),
        client!.total_contributed(),
        client!.total_released(),
        client!.get_config(),
        client!.refunded_to({ donor: donor! }),
      ]);
      const feeBps = BigInt(config.result.unwrap().fee_bps);
      return {
        result: {
          refunded: refunded.result,
          remaining: proportionalRefund(contributed.result, total.result, feeBps, released.result, refunded.result),
        },
      };
    },
    [client, donor],
    { enabled: Boolean(client) && Boolean(donor) },
  );

  return {
    refundedSoFar: read.data?.refunded ?? 0n,
    remaining: read.data?.remaining ?? null,
    loading: read.loading,
    refetch: read.refetch,
  };
}
