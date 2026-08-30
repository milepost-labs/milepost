import { useWallet } from '../../context/useWallet';
import { useProgramme } from '../../hooks/useProgramme';
import { useContractRead } from '../../hooks/useContractRead';
import { useTransaction, phaseLabel } from '../../hooks/useTransaction';
import { AsyncView } from '../state/AsyncStates';
import { Button } from '../ui/Button';
import { Card, Stat } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { formatAmount } from '../../lib/amount';
import { explain } from '../../lib/errors';

const NOW = BigInt(Math.floor(Date.now() / 1000));

export function RefundsAndSweepsSection() {
  const { address: donorAddress } = useWallet();
  const { client: programme } = useProgramme();

  const configReq = useContractRead(() => programme.config(), [programme]);
  const totalContributedReq = useContractRead(() => programme.total_contributed(), [programme]);
  const totalReleasedReq = useContractRead(() => programme.total_released(), [programme]);
  
  const donorAllocationReq = useContractRead(
    () => {
      if (!donorAddress) return Promise.resolve({ result: 0n });
      return programme.allocation_of({ recipient: donorAddress });
    },
    [programme, donorAddress]
  );

  const refundTx = useTransaction({ contract: 'program' });
  const sweepFeeTx = useTransaction({ contract: 'program' });
  const sweepUnclaimedTx = useTransaction({ contract: 'program' });

  return (
    <div className="refunds-sweeps-section" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>Donor Refund</h3>
          
          {!donorAddress ? (
            <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>Connect your wallet to view your contribution and claimable refund.</p>
          ) : (
            <AsyncView {...configReq} onRetry={configReq.refetch}>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(config: any) => (
                <AsyncView {...donorAllocationReq} onRetry={donorAllocationReq.refetch}>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(allocation: any) => (
                    <AsyncView {...totalContributedReq} onRetry={totalContributedReq.refetch}>
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {(totalContributed: any) => (
                        <AsyncView {...totalReleasedReq} onRetry={totalReleasedReq.refetch}>
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          {(totalReleased: any) => {
                            const releaseDeadline = config.release_deadline;
                            const isPastRelease = NOW >= BigInt(releaseDeadline);
                            const deadlineDate = new Date(Number(releaseDeadline) * 1000).toLocaleDateString();
                            
                            const unreleased = BigInt(totalContributed) - BigInt(totalReleased);
                            const alloc = BigInt(allocation);
                            const totalContr = BigInt(totalContributed);
                            const estimatedRefund = totalContr > 0n 
                              ? (alloc * unreleased) / totalContr 
                              : 0n;

                            const refundError = refundTx.error ? explain(refundTx.error, 'program') : null;

                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div style={{ display: 'flex', gap: '2rem' }}>
                                  <Stat label="Your Contribution" value={formatAmount(alloc, { asset: 'XLM' })} />
                                  <Stat label="Estimated Refund" value={formatAmount(estimatedRefund, { asset: 'XLM' })} />
                                </div>
                                
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
                                  <div style={{ fontSize: '0.875rem' }}>
                                    {isPastRelease ? (
                                      <Badge tone="success">Refund window open</Badge>
                                    ) : (
                                      <span style={{ color: 'var(--color-muted)' }}>Available after {deadlineDate}</span>
                                    )}
                                  </div>
                                  
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                                    <Button 
                                      loading={refundTx.busy}
                                      disabled={!isPastRelease || refundTx.busy || estimatedRefund === 0n}
                                      onClick={() => refundTx.send(() => programme.refund({ donor: donorAddress }))}
                                    >
                                      {isPastRelease ? "Claim Refund" : `Claimable on ${deadlineDate}`}
                                    </Button>
                                    {refundTx.busy && <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{phaseLabel(refundTx.phase)}</span>}
                                    {refundError && (
                                      <span style={{ fontSize: '0.875rem', color: 'var(--color-error)' }}>
                                        {refundError.message}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          }}
                        </AsyncView>
                      )}
                    </AsyncView>
                  )}
                </AsyncView>
              )}
            </AsyncView>
          )}
        </div>
      </Card>

      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>Programme Sweeps</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', margin: 0 }}>
            Sweeps return unclaimed funds to donors or transfer fees to the treasury. These actions are permissionless.
          </p>

          <AsyncView {...configReq} onRetry={configReq.refetch}>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(config: any) => {
              const sweepDeadline = config.sweep_deadline;
              const isPastSweep = NOW >= BigInt(sweepDeadline);
              const sweepDate = new Date(Number(sweepDeadline) * 1000).toLocaleDateString();

              return (
                <div style={{ display: 'flex', gap: '1.5rem', paddingTop: '0.5rem', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-md)', minWidth: '250px' }}>
                    <h4 style={{ fontSize: '0.875rem', fontWeight: 500, margin: 0 }}>Sweep Fees</h4>
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', flex: 1, margin: 0 }}>Transfers accumulated protocol fees to the treasury destination.</p>
                    <Button 
                      loading={sweepFeeTx.busy}
                      onClick={() => sweepFeeTx.send(() => programme.sweep_fee())}
                    >
                      Sweep Fees
                    </Button>
                    {sweepFeeTx.busy && <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{phaseLabel(sweepFeeTx.phase)}</span>}
                    {sweepFeeTx.error && (
                      <span style={{ fontSize: '0.875rem', color: 'var(--color-error)' }}>{explain(sweepFeeTx.error, 'program').message}</span>
                    )}
                  </div>

                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-md)', minWidth: '250px' }}>
                    <h4 style={{ fontSize: '0.875rem', fontWeight: 500, margin: 0 }}>Sweep Unclaimed</h4>
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', flex: 1, margin: 0 }}>Returns all unreleased funds proportionally to donors.</p>
                    <Button 
                      loading={sweepUnclaimedTx.busy}
                      disabled={!isPastSweep || sweepUnclaimedTx.busy}
                      onClick={() => sweepUnclaimedTx.send(() => programme.sweep_unclaimed())}
                    >
                      {isPastSweep ? "Sweep Unclaimed" : `Available on ${sweepDate}`}
                    </Button>
                    {sweepUnclaimedTx.busy && <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{phaseLabel(sweepUnclaimedTx.phase)}</span>}
                    {sweepUnclaimedTx.error && (
                      <span style={{ fontSize: '0.875rem', color: 'var(--color-error)' }}>{explain(sweepUnclaimedTx.error, 'program').message}</span>
                    )}
                  </div>
                </div>
              );
            }}
          </AsyncView>
        </div>
      </Card>
    </div>
  );
}
