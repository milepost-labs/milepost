import { useWallet } from "../../context/useWallet";
import { useProgramme } from "../../hooks/useProgramme";
import { useContractRead } from "../../hooks/useContractRead";
import { AsyncView } from "../state/AsyncStates";
import { Card, Stat } from "../ui/Card";
import { formatAmount, percentOf } from "../../lib/amount";

/** The programme client shape the stats need — a bindings `programmeAt` client. */
export interface ContributionClient {
  contributed_by: (args: { donor: string }) => Promise<{ result: bigint }>;
  total_contributed: () => Promise<{ result: bigint }>;
}

export interface ContributionStatsProps {
  /** The programme client to read `contributed_by` and `total_contributed` from. */
  client: ContributionClient;
  /** The donor the contribution is read for — the connected wallet, or the donor a rebuilt receipt points at. */
  donorAddress: string;
}

/**
 * What a donor put in, and what share of the programme that is, for whichever
 * programme client and donor the caller names. Moved out of
 * {@link DonorContributionReceipt} so the transaction-hash lookup
 * (`/funders/receipt`) renders the same figures for a receipt being rebuilt —
 * one implementation, or the two screens drift apart.
 */
export function ContributionStats({ client, donorAddress }: ContributionStatsProps) {
  const contributionReq = useContractRead(
    () => client.contributed_by({ donor: donorAddress }),
    [client, donorAddress],
  );
  const totalContributedReq = useContractRead(() => client.total_contributed(), [client]);

  const contribution = contributionReq.data ?? 0n;

  if (contribution === 0n && !contributionReq.loading) {
    return (
      <p style={{ fontSize: "0.875rem", color: "var(--color-muted)" }}>
        This address has not contributed to this programme.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
      <AsyncView {...contributionReq} onRetry={contributionReq.refetch}>
        {(value) => (
          <Stat
            label="Your Contribution"
            value={formatAmount(value, { asset: "XLM" })}
            numeric
          />
        )}
      </AsyncView>
      <AsyncView {...totalContributedReq} onRetry={totalContributedReq.refetch}>
        {(total) => (
          <Stat
            label="Share of Programme"
            value={`${percentOf(contribution, total).toFixed(2)}%`}
            hint={`Out of ${formatAmount(total, { asset: "XLM" })} total`}
          />
        )}
      </AsyncView>
    </div>
  );
}

export function DonorContributionReceipt() {
  const { address: donorAddress } = useWallet();
  const { client: programme } = useProgramme();

  if (!donorAddress) {
    return (
      <Card>
        <div style={{ padding: "1.5rem", textAlign: "center" }}>
          <h3
            style={{
              fontSize: "1.125rem",
              fontWeight: 600,
              marginBottom: "0.5rem",
            }}
          >
            Your Contribution
          </h3>
          <p style={{ fontSize: "0.875rem", color: "var(--color-muted)" }}>
            Connect your wallet to view your contribution and share of this
            programme.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div style={{ padding: "1.5rem" }}>
        <h3
          style={{
            fontSize: "1.125rem",
            fontWeight: 600,
            marginBottom: "1rem",
          }}
        >
          Your Contribution
        </h3>
        <ContributionStats client={programme} donorAddress={donorAddress} />
      </div>
    </Card>
  );
}
