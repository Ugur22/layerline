import { describe, expect, it } from 'vitest'
import { cycleOf, extremesOf, haversineKm, isSequence, separationOf, trendOf } from './stats'

describe('haversineKm', () => {
  it('is zero for the same point', () => {
    expect(haversineKm([4.9, 52.37], [4.9, 52.37])).toBe(0)
  })

  it('measures the great-circle distance between two points', () => {
    // Amsterdam to Rotterdam is about 58 km.
    expect(haversineKm([4.9, 52.37], [4.48, 51.92])).toBeCloseTo(57.7, 0)
  })

  it('is the same whichever way round', () => {
    expect(haversineKm([4.9, 52.37], [3.1, 53.6])).toBeCloseTo(
      haversineKm([3.1, 53.6], [4.9, 52.37]),
      9,
    )
  })
})

describe('trendOf', () => {
  it('counts the steps up, down and flat between neighbouring values', () => {
    expect(trendOf([1, 3, 2, 2, 5])).toEqual({ up: 2, down: 1, flat: 1, steps: 4 })
  })

  it('steps across gaps, comparing the values either side', () => {
    expect(trendOf([1, null, 3, null, null, 2])).toEqual({ up: 1, down: 1, flat: 0, steps: 2 })
  })

  it('has no steps for fewer than two values', () => {
    expect(trendOf([4])).toEqual({ up: 0, down: 0, flat: 0, steps: 0 })
    expect(trendOf([null, null])).toEqual({ up: 0, down: 0, flat: 0, steps: 0 })
  })
})

describe('extremesOf', () => {
  it('finds the lowest and highest value with where each first occurs', () => {
    expect(extremesOf([5, 2, 9, 2, 9])).toEqual({
      min: { value: 2, index: 1 },
      max: { value: 9, index: 2 },
    })
  })

  it('ignores gaps', () => {
    expect(extremesOf([null, 4, null])).toEqual({
      min: { value: 4, index: 1 },
      max: { value: 4, index: 1 },
    })
  })

  it('has no extremes without values', () => {
    expect(extremesOf([null])).toBeNull()
  })
})

describe('cycleOf', () => {
  it('finds a sequence that repeats in a fixed order', () => {
    expect(cycleOf(['a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('accepts a last cycle that is cut short', () => {
    expect(cycleOf(['a', 'b', 'a', 'b', 'a'])).toEqual(['a', 'b'])
  })

  it('needs at least two full turns to call it a cycle', () => {
    expect(cycleOf(['a', 'b', 'c', 'a'])).toBeNull()
  })

  it('finds no cycle in an irregular sequence', () => {
    expect(cycleOf(['a', 'b', 'a', 'a', 'b', 'b'])).toBeNull()
  })

  it('decides in one pass even on a long sequence with no cycle', () => {
    const long = Array.from({ length: 200_000 }, (_, i) => (i % 7 === 3 ? 'a' : 'b'))
    const started = performance.now()

    expect(cycleOf(long)).toBeNull()
    expect(performance.now() - started).toBeLessThan(200)
  })

  it('does not call a constant sequence a cycle', () => {
    expect(cycleOf(['a', 'a', 'a', 'a'])).toBeNull()
  })
})

describe('separationOf', () => {
  it('orders groups whose ranges do not overlap, lowest first', () => {
    const groups = new Map([
      ['B', [29.3, 47.2]],
      ['A', [8.1, 28.3]],
    ])

    expect(separationOf(groups)).toEqual([
      { label: 'A', min: 8.1, max: 28.3 },
      { label: 'B', min: 29.3, max: 47.2 },
    ])
  })

  it('finds no separation when ranges overlap', () => {
    expect(
      separationOf(
        new Map([
          ['A', [1, 10]],
          ['B', [5, 20]],
        ]),
      ),
    ).toBeNull()
  })

  it('treats groups that share an end value as overlapping', () => {
    expect(
      separationOf(
        new Map([
          ['A', [1, 10]],
          ['B', [10, 20]],
        ]),
      ),
    ).toBeNull()
  })

  it('needs at least two groups', () => {
    expect(separationOf(new Map([['A', [1, 2]]]))).toBeNull()
  })
})

describe('isSequence', () => {
  it('recognises values that step by the same amount', () => {
    expect(isSequence([1, 2, 3, 4])).toBe(true)
    expect(isSequence([10, 8, 6])).toBe(true)
    expect(isSequence([0, 0.1, 0.2, 0.3])).toBe(true)
  })

  it('does not take a measurement that merely rises for one', () => {
    expect(isSequence([1, 2, 4, 8])).toBe(false)
    expect(isSequence([1, 2, 2, 3])).toBe(false)
  })

  it('needs every value present and at least three values', () => {
    expect(isSequence([1, null, 3])).toBe(false)
    expect(isSequence([1, 2])).toBe(false)
  })
})
