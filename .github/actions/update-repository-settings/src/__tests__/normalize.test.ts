import {beforeEach, describe, expect, it, vi} from 'vitest'

import {normalizeColor, normalizeCommaDelimited} from '../normalize.js'

const mockWarning = vi.hoisted(() => vi.fn())
vi.mock('@actions/core', () => ({warning: mockWarning}))

describe('normalizeCommaDelimited', () => {
  beforeEach(() => {
    mockWarning.mockClear()
  })

  it('splits comma-delimited string with spaces', () => {
    const result = normalizeCommaDelimited('a, b, c')
    expect(result).toEqual(['a', 'b', 'c'])
  })

  it('splits comma-delimited string without spaces', () => {
    const result = normalizeCommaDelimited('a,b')
    expect(result).toEqual(['a', 'b'])
  })

  it('passes through array unchanged', () => {
    const result = normalizeCommaDelimited(['a', 'b'])
    expect(result).toEqual(['a', 'b'])
  })

  it('returns empty array for empty string', () => {
    const result = normalizeCommaDelimited('')
    expect(result).toEqual([])
  })

  it('returns empty array for undefined', () => {
    const result = normalizeCommaDelimited(undefined)
    expect(result).toEqual([])
  })

  it('returns empty array for null', () => {
    const result = normalizeCommaDelimited(null)
    expect(result).toEqual([])
  })

  it('warns and returns empty array for number input', () => {
    const result = normalizeCommaDelimited(42)
    expect(result).toEqual([])
    expect(mockWarning).toHaveBeenCalledWith(expect.stringContaining('Expected string or array'))
  })

  it('converts array elements to strings', () => {
    const result = normalizeCommaDelimited([1, 2, 3])
    expect(result).toEqual(['1', '2', '3'])
  })

  it('trims whitespace around commas', () => {
    const result = normalizeCommaDelimited('  a  ,  b  ,  c  ')
    expect(result).toEqual(['a', 'b', 'c'])
  })

  it('filters out empty strings from split', () => {
    const result = normalizeCommaDelimited('a,,b')
    expect(result).toEqual(['a', 'b'])
  })
})

describe('normalizeColor', () => {
  beforeEach(() => {
    mockWarning.mockClear()
  })

  it('strips # prefix and lowercases', () => {
    const result = normalizeColor('#7057ff')
    expect(result).toBe('7057ff')
  })

  it('lowercases without # prefix', () => {
    const result = normalizeColor('4a94DC')
    expect(result).toBe('4a94dc')
  })

  it('pads to 6 chars with leading zeros', () => {
    const result = normalizeColor('fff')
    expect(result).toBe('000fff')
  })

  it('handles # prefix with padding', () => {
    const result = normalizeColor('#ffffff')
    expect(result).toBe('ffffff')
  })

  it('returns undefined for undefined input', () => {
    const result = normalizeColor(undefined)
    expect(result).toBeUndefined()
  })

  it('returns undefined for null input', () => {
    const result = normalizeColor(null)
    expect(result).toBeUndefined()
  })

  it('warns and returns undefined for number input', () => {
    const result = normalizeColor(42)
    expect(result).toBeUndefined()
    expect(mockWarning).toHaveBeenCalledWith(expect.stringContaining('Expected string for color'))
  })

  it('handles real config value #7057ff', () => {
    const result = normalizeColor('#7057ff')
    expect(result).toBe('7057ff')
  })

  it('handles real config value 4a94dc', () => {
    const result = normalizeColor('4a94dc')
    expect(result).toBe('4a94dc')
  })

  it('handles real config value d73a4a', () => {
    const result = normalizeColor('d73a4a')
    expect(result).toBe('d73a4a')
  })
})
