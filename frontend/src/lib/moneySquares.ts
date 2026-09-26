/**
 * Compute the 40-square distribution grid matching the design tokens.
 * All computations use BigInt to avoid losing precision on large stroop amounts.
 */
export function computeMoneySquares(
  budget: bigint,
  released: bigint,
  awarded: bigint,
  refundable: bigint,
  count = 40,
): string[] {
  if (budget <= 0n) {
    return Array(count).fill('var(--surface-raised)');
  }
  const countBig = BigInt(count);
  const roundScale = (val: bigint) => {
    if (val <= 0n) return 0;
    const scaled = (val * countBig + budget / 2n) / budget;
    return Math.max(0, Math.min(count, Number(scaled)));
  };

  const r = roundScale(released);
  const aw = roundScale(awarded);
  const rf = roundScale(refundable);

  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    if (i < r) {
      out.push('var(--accent)');
    } else if (i < aw) {
      out.push('var(--locked)');
    } else if (i >= count - rf) {
      out.push('var(--refund)');
    } else {
      out.push('var(--accent-soft)');
    }
  }
  return out;
}
