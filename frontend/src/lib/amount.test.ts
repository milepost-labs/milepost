import { describe, expect, it } from 'vitest'

import { formatAmount, parseAmount } from './amount'

const STROOPS_PER_LUMEN = 10_000_000n

describe('formatAmount', () => {
  it('formats zero', () => {
    expect(formatAmount(0n)).toBe('0')
  })

  it('formats one stroop', () => {
    expect(formatAmount(1n)).toBe('0.0000001')
  })

  it('formats whole lumens without a fraction', () => {
    expect(formatAmount(42n * STROOPS_PER_LUMEN)).toBe('42')
  })

  it('formats a mixed amount, trimming trailing zeros', () => {
    expect(formatAmount(1_500_000n)).toBe('0.15')
    expect(formatAmount(12_345_678n)).toBe('1.2345678')
  })

  it('groups thousands in the integer part', () => {
    expect(formatAmount(1_234_567n * STROOPS_PER_LUMEN)).toBe('1,234,567')
    expect(formatAmount(100_000_000_001n)).toBe('10,000.0000001')
    expect(formatAmount(1_000_000_000_000n)).toBe('100,000')
  })

  it('honours a configurable number of display decimals', () => {
    expect(formatAmount(12_345_678n, 2)).toBe('1.23')
    expect(formatAmount(9_999_999n, 2)).toBe('0.99')
    expect(formatAmount(12_300_000n, 1)).toBe('1.2')
    expect(formatAmount(42n * STROOPS_PER_LUMEN, 7)).toBe('42')
  })

  it('round-trips values far beyond Number.MAX_SAFE_INTEGER without floating point', () => {
    // 2^63 stroops — well past 2^53, where Number silently loses precision.
    const huge = 2n ** 63n
    expect(parseAmount(formatAmount(huge))).toBe(huge)
    // And an amount a real award could reach: 10^12 XLM.
    const award = 10n ** 12n * STROOPS_PER_LUMEN + 7n
    expect(parseAmount(formatAmount(award))).toBe(award)
  })

  it('rejects negative input', () => {
    expect(() => formatAmount(-1n)).toThrow(/negative/)
  })
})

describe('parseAmount', () => {
  it('parses zero', () => {
    expect(parseAmount('0')).toBe(0n)
  })

  it('parses whole lumens', () => {
    expect(parseAmount('42')).toBe(42n * STROOPS_PER_LUMEN)
  })

  it('parses fractions down to one stroop', () => {
    expect(parseAmount('0.0000001')).toBe(1n)
    expect(parseAmount('1.5')).toBe(15_000_000n)
  })

  it('parses values far beyond Number.MAX_SAFE_INTEGER exactly', () => {
    expect(parseAmount('922337203685.4775808')).toBe(2n ** 63n)
    expect(parseAmount('1000000000000.0000007')).toBe(
      10n ** 12n * STROOPS_PER_LUMEN + 7n,
    )
  })

  it('accepts thousands separators in the integer part', () => {
    expect(parseAmount('1,234,567.5')).toBe(
      1_234_567n * STROOPS_PER_LUMEN + 5_000_000n,
    )
  })

  it('rejects negative input', () => {
    expect(() => parseAmount('-1')).toThrow(/negative/)
  })

  it('rejects empty input', () => {
    expect(() => parseAmount('')).toThrow(/empty/)
    expect(() => parseAmount('   ')).toThrow(/empty/)
  })

  it('rejects non-numeric input', () => {
    for (const bad of ['abc', '1e5', '+1', '1.2.3', '.', '1.', '.5', '1 000']) {
      expect(() => parseAmount(bad)).toThrow()
    }
  })

  it('rejects more than seven decimal places', () => {
    expect(() => parseAmount('0.12345678')).toThrow(/decimal/)
  })
})
