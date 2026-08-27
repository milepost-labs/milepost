import { useWallet } from "../../context/useWallet";
import { useProgramme } from "../../hooks/useProgramme";
import { useContractRead } from "../../hooks/useContractRead";
import { AsyncView } from "../state/AsyncStates";
import { Card, Stat } from "../ui/Card";
import { formatAmount, percentOf } from "../../lib/amount";

export function DonorContributionReceipt() {
  const { address: donorAddress } = useWallet();
  const { client: programme } = useProgramme();

  const contributionReq = useContractRead(() => {
    if (!donorAddress) return Promise.resolve({ result: 0n });
    return programme.contributed_by({ donor: donorAddress });
  }, [programme, donorAddress]);

  const totalContributedReq = useContractRead(
    () => programme.total_contributed(),
    [programme],
  );

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

  const contribution = contributionReq.data ?? 0n;

  if (contribution === 0n && !contributionReq.loading) {
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
            You have not contributed to this programme.
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
          <AsyncView
            {...totalContributedReq}
            onRetry={totalContributedReq.refetch}
          >
            {(total) => (
              <Stat
                label="Share of Programme"
                value={`${percentOf(contribution, total).toFixed(2)}%`}
                hint={`Out of ${formatAmount(total, { asset: "XLM" })} total`}
              />
            )}
          </AsyncView>
        </div>
      </div>
    </Card>
  );
}
