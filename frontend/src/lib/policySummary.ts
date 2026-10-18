import { formatAmount } from './amount';
import { truncateAddress } from './format';

/** The parts of a `policy_spend` read the summary needs. */
export interface PolicyRead {
  cap: bigint;
  /** Window length in seconds (`u64`). */
  period: bigint;
  spent: bigint;
  token: string;
}

export type PolicyStatus =
  /** No policy configured and no signer installed. */
  | 'none'
  /** Rules exist but the signer is not installed, so nothing enforces them. */
  | 'unprotected'
  /** Signer installed, but no asset, payees or cap configured yet. */
  | 'no-rules'
  /** Signer installed and rules configured. */
  | 'protected';

export interface PolicySummary {
  status: PolicyStatus;
  /** One sentence describing what the wallet can do. */
  sentence: string;
  remaining: bigint | null;
}

const UNITS: [seconds: number, singular: string][] = [
  [7 * 86_400, 'week'],
  [86_400, 'day'],
  [3_600, 'hour'],
  [60, 'minute'],
];

/** "day", "week", "30 days", "6 hours"; falls back to seconds. */
export function formatPeriod(seconds: bigint): string {
  const total = Number(seconds);
  for (const [size, unit] of UNITS) {
    if (total >= size && total % size === 0) {
      const count = total / size;
      return count === 1 ? unit : `${count} ${unit}s`;
    }
  }
  return total === 1 ? 'second' : `${total} seconds`;
}

export function summarisePolicy({
  installed,
  policy,
  remaining,
}: {
  installed: boolean;
  policy: PolicyRead | null;
  remaining: bigint | null;
}): PolicySummary {
  if (!policy) {
    return installed
      ? {
          status: 'no-rules',
          sentence:
            'The policy signer is installed, but no asset, payees or cap are configured, so it limits nothing yet.',
          remaining: null,
        }
      : {
          status: 'none',
          sentence: 'This wallet has no spend policy. Money sent to it can go anywhere.',
          remaining: null,
        };
  }

  const left = remaining ?? (policy.cap > policy.spent ? policy.cap - policy.spent : 0n);
  const asset = truncateAddress(policy.token);
  const limit = `Can send up to ${formatAmount(policy.cap)} of ${asset} to approved payees each ${formatPeriod(policy.period)}`;
  const leftText = left > 0n ? `${formatAmount(left)} left` : 'nothing left this period';

  if (!installed) {
    return {
      status: 'unprotected',
      sentence: `Unprotected: rules are configured (${limit.charAt(0).toLowerCase()}${limit.slice(1)}) but the policy signer is not installed, so nothing enforces them.`,
      remaining: left,
    };
  }

  return { status: 'protected', sentence: `${limit}; ${leftText}.`, remaining: left };
}
