import { useMemo } from 'react';
import { Client, networks, type Policy } from '@milepost/policy-spend';
import { useContractResult } from '../../hooks/useContractRead';
import { formatAmount, percentOf } from '../../lib/amount';
import { formatDateTime, timeUntil } from '../../lib/format';
import { Empty, Loading } from '../state/AsyncStates';
import { Badge, Card, Stat } from '../ui';
import './RemainingCapIndicator.css';

const policyClient = new Client({
  ...networks.testnet,
  rpcUrl: 'https://soroban-testnet.stellar.org',
});

export interface RemainingCapIndicatorProps {
  walletAddress: string;
}

export function RemainingCapIndicator({ walletAddress }: RemainingCapIndicatorProps) {
  const policyRead = useContractResult<Policy>(
    () => policyClient.get_policy({ wallet: walletAddress }),
    [walletAddress],
    { enabled: Boolean(walletAddress), contract: 'policy' }
  );

  const remainingRead = useContractResult<bigint>(
    () => policyClient.remaining({ wallet: walletAddress }),
    [walletAddress],
    { enabled: Boolean(walletAddress), contract: 'policy' }
  );

  const isLoading = policyRead.loading || remainingRead.loading;
  const hasNoPolicy =
    (!isLoading && !policyRead.data) ||
    (policyRead.error && String(policyRead.error).includes('NotConfigured')) ||
    (remainingRead.error && String(remainingRead.error).includes('NotConfigured'));

  const calculations = useMemo(() => {
    if (!policyRead.data || remainingRead.data === null) return null;

    const policy = policyRead.data;
    const remaining = remainingRead.data;
    const cap = policy.cap;

    const percentageLeft = percentOf(remaining, cap);
    const resetTimeUnix = Number(policy.window_start + policy.period);

    return {
      remainingStr: formatAmount(remaining, { asset: 'XLM' }),
      capStr: formatAmount(cap, { asset: 'XLM' }),
      percentageLeft,
      resetTimeFormatted: formatDateTime(resetTimeUnix),
      resetTimeRelative: timeUntil(resetTimeUnix),
    };
  }, [policyRead.data, remainingRead.data]);

  if (hasNoPolicy) {
    return (
      <Card className="remaining-cap-card">
        <Empty
          title="No spend policy configured"
          description="This wallet does not currently have an active spend policy attached."
        />
      </Card>
    );
  }

  if (isLoading || !calculations) {
    return (
      <Card className="remaining-cap-card">
        <Loading label="Loading remaining spend cap..." rows={2} />
      </Card>
    );
  }

  const { remainingStr, capStr, percentageLeft, resetTimeFormatted, resetTimeRelative } = calculations;

  return (
    <Card className="remaining-cap-card">
      <div className="remaining-cap-header">
        <h3 className="remaining-cap-title">Remaining Spend Cap</h3>
        <Badge tone={percentageLeft > 20 ? 'success' : 'warning'}>
          {percentageLeft}% Left
        </Badge>
      </div>

      <div className="remaining-cap-stats">
        <Stat label="Remaining Cap" value={remainingStr} />
        <Stat label="Total Window Cap" value={capStr} />
      </div>

      <div className="remaining-cap-progress-track">
        <div
          className={`remaining-cap-progress-fill ${percentageLeft <= 20 ? 'remaining-cap-progress-fill--low' : ''}`}
          style={{ width: `${Math.min(100, Math.max(0, percentageLeft))}%` }}
        />
      </div>

      <div className="remaining-cap-reset-info">
        <span className="remaining-cap-reset-label">Window Resets:</span>
        <span className="remaining-cap-reset-value" title={resetTimeFormatted}>
          {resetTimeRelative} ({resetTimeFormatted})
        </span>
      </div>
    </Card>
  );
}
