import { STROOPS_PER_UNIT } from './amount';

/**
 * Format a stroop amount as a plain XLM decimal string with up to 7 decimal
 * places and no trailing zeros (e.g. 100_000n -> "0.01", 10_000_000n -> "1").
 */
export function formatXlmStroops(stroops: bigint): string {
  const negative = stroops < 0n;
  const abs = negative ? -stroops : stroops;
  const whole = abs / STROOPS_PER_UNIT;
  const fraction = abs % STROOPS_PER_UNIT;
  const sign = negative ? '-' : '';
  if (fraction === 0n) return `${sign}${whole}`;
  return `${sign}${whole}.${fraction.toString().padStart(7, '0').replace(/0+$/, '')}`;
}

/**
 * Human-readable network fee line shown in write sheets before signing:
 * "Network fee: about X XLM".
 */
export function formatNetworkFee(stroops: bigint): string {
  return `Network fee: about ${formatXlmStroops(stroops)} XLM`;
}

export interface XlmBalanceCheck {
  /** True only when both balance and fee are known and balance < fee. */
  insufficient: boolean;
  balance: bigint | null;
  fee: bigint | null;
}

/**
 * Compare the wallet's XLM balance against the simulated network fee.
 * When either figure is unknown (null), returns `insufficient: false` so an
 * unreadable balance does not falsely block signing.
 */
export function checkXlmForFee(
  xlmBalance: bigint | null,
  estimatedFee: bigint | null,
): XlmBalanceCheck {
  if (xlmBalance === null || estimatedFee === null) {
    return { insufficient: false, balance: xlmBalance, fee: estimatedFee };
  }
  return {
    insufficient: xlmBalance < estimatedFee,
    balance: xlmBalance,
    fee: estimatedFee,
  };
}

/**
 * Plain-language warning when the wallet's XLM balance cannot cover the
 * simulated fee. Mentions Friendbot only when the network setting allows it
 * (testnet).
 */
export function insufficientXlmWarning(
  xlmBalance: bigint,
  estimatedFee: bigint,
  friendbot: boolean,
): string {
  const base = `Your wallet has ${formatXlmStroops(xlmBalance)} XLM, which cannot cover the estimated network fee of ${formatXlmStroops(estimatedFee)} XLM.`;
  return friendbot
    ? `${base} Fund your testnet account with Friendbot before signing.`
    : `${base} Add XLM to your wallet before signing.`;
}
