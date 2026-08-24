/**
 * Stroop amount formatting and parsing.
 *
 * 1 XLM = 10,000,000 stroops. Contract bindings return amounts as bigint;
 * converting through Number loses precision above 2^53, which real award
 * amounts can exceed, so every operation here stays in bigint.
 */

const STROOPS_PER_LUMEN = 10_000_000n
const MAX_DECIMAL_PLACES = 7

function groupThousands(digits: string): string {
  let grouped = ''
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) {
      grouped += ','
    }
    grouped += digits[i]
  }
  return grouped
}

/**
 * Formats a stroop amount for display.
 *
 * The fraction is truncated to `decimals` places (display only, never used to
 * compute amounts) and trailing zeros are dropped, so whole lumens render
 * without a fraction. The result round-trips through `parseAmount` exactly
 * when `decimals` is 7.
 */
export function formatAmount(stroops: bigint, decimals = MAX_DECIMAL_PLACES): string {
  if (stroops < 0n) {
    throw new Error('stroop amount must not be negative')
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_DECIMAL_PLACES) {
    throw new Error(`decimals must be an integer between 0 and ${MAX_DECIMAL_PLACES}`)
  }

  const whole = stroops / STROOPS_PER_LUMEN
  const fraction = (stroops % STROOPS_PER_LUMEN)
    .toString()
    .padStart(MAX_DECIMAL_PLACES, '0')
    .slice(0, decimals)
    .replace(/0+$/, '')

  const wholePart = groupThousands(whole.toString())
  return fraction === '' ? wholePart : `${wholePart}.${fraction}`
}

/**
 * Parses a user-entered amount into stroops.
 *
 * Accepts plain digits ("42.5") or thousands-grouped digits ("1,234,567.5"),
 * with at most seven decimal places. Rejects empty, negative, and malformed
 * input by throwing an Error whose message names the problem.
 */
export function parseAmount(input: string): bigint {
  const trimmed = input.trim()
  if (trimmed === '') {
    throw new Error('amount is empty')
  }
  if (trimmed.startsWith('-')) {
    throw new Error('amount must not be negative')
  }

  const dot = trimmed.indexOf('.')
  const wholePart = dot === -1 ? trimmed : trimmed.slice(0, dot)
  const fractionPart = dot === -1 ? '' : trimmed.slice(dot + 1)

  if (wholePart === '') {
    throw new Error('amount is missing digits before the decimal point')
  }
  if (!/^\d+$/.test(wholePart) && !/^\d{1,3}(,\d{3})*$/.test(wholePart)) {
    throw new Error(`amount is not a valid number: "${input}"`)
  }
  if (dot !== -1) {
    if (fractionPart === '') {
      throw new Error('amount is missing digits after the decimal point')
    }
    if (!/^\d+$/.test(fractionPart)) {
      throw new Error(`amount is not a valid number: "${input}"`)
    }
    if (fractionPart.length > MAX_DECIMAL_PLACES) {
      throw new Error(`amount has more than ${MAX_DECIMAL_PLACES} decimal places`)
    }
  }

  const wholeStroops = BigInt(wholePart.replaceAll(',', '')) * STROOPS_PER_LUMEN
  const fractionStroops = fractionPart === '' ? 0n : BigInt(fractionPart.padEnd(MAX_DECIMAL_PLACES, '0'))
  return wholeStroops + fractionStroops
}
