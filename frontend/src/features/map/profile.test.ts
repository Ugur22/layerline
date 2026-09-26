import { describe, expect, it } from 'vitest'
import type { PointFeature } from '@/api/types'
import {
  areaPath,
  indexAtX,
  linePath,
  niceTicks,
  profileDomain,
  runsOf,
  valuesFor,
  extentOf,
} from './profile'

function feature(properties: Record<string, unknown>): PointFeature {
  return { type: 'Feature', id: 'x', geometry: { type: 'Point', coordinates: [4, 52] }, properties }
}

describe('valuesFor', () => {
  it('reads a numeric property from each feature, in order, with null where it is missing', () => {
    const features = [feature({ d: '8.6' }), feature({}), feature({ d: 12 }), feature({ d: '' })]

    expect(valuesFor(features, 'd')).toEqual([8.6, null, 12, null])
  })

  it('treats text that is not a number as missing', () => {
    expect(valuesFor([feature({ d: 'deep' })], 'd')).toEqual([null])
  })
})

describe('profileDomain', () => {
  it('starts at zero when every value is positive, so the baseline means something', () => {
    expect(profileDomain([8.1, 47.2, null])).toEqual([0, 47.2])
  })

  it('follows the data when values go below zero', () => {
    expect(profileDomain([-3, 5])).toEqual([-3, 5])
  })

  it('widens a constant series so it still has a height', () => {
    const [min, max] = profileDomain([5, 5])

    expect(max).toBeGreaterThan(min)
  })

  it('widens a constant negative series by its own size, however large', () => {
    const [min, max] = profileDomain([-1e17, -1e17])

    expect(max).toBeGreaterThan(min)
  })

  it('has a default range when there are no values at all', () => {
    expect(profileDomain([null, null])).toEqual([0, 1])
  })
})

describe('niceTicks', () => {
  it('picks round steps that cover the range', () => {
    expect(niceTicks(0, 47.2)).toEqual([0, 10, 20, 30, 40])
  })

  it('handles fractions', () => {
    expect(niceTicks(0, 1)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1])
  })

  it('keeps tiny ranges apart instead of rounding every tick to zero', () => {
    const ticks = niceTicks(0, 5e-12)

    expect(new Set(ticks).size).toBe(ticks.length)
    expect(ticks.length).toBeGreaterThan(1)
  })

  it('includes negative values', () => {
    expect(niceTicks(-3, 5)).toEqual([-2, 0, 2, 4])
  })
})

describe('extentOf', () => {
  it('finds the smallest and largest value, ignoring gaps', () => {
    expect(extentOf([3, null, -1, 8])).toEqual([-1, 8])
  })

  it('has no extent without values', () => {
    expect(extentOf([null])).toBeNull()
  })

  it('copes with more values than a function call can take as arguments', () => {
    const many = Array.from({ length: 300_000 }, (_, i) => i)

    expect(extentOf(many)).toEqual([0, 299_999])
    expect(profileDomain(many)).toEqual([0, 299_999])
  })
})

describe('runsOf', () => {
  it('groups neighbours with the same label into runs', () => {
    expect(runsOf(['A', 'A', 'B', 'B', 'B', 'A'])).toEqual([
      { start: 0, end: 1, label: 'A' },
      { start: 2, end: 4, label: 'B' },
      { start: 5, end: 5, label: 'A' },
    ])
  })

  it('keeps missing labels as their own runs', () => {
    expect(runsOf(['A', null, null])).toEqual([
      { start: 0, end: 0, label: 'A' },
      { start: 1, end: 2, label: null },
    ])
  })

  it('has no runs for no points', () => {
    expect(runsOf([])).toEqual([])
  })
})

describe('linePath', () => {
  it('joins the points with straight segments', () => {
    expect(
      linePath([
        [0, 1],
        [2, 3],
        [4, 5],
      ]),
    ).toBe('M0 1L2 3L4 5')
  })

  it('lifts the pen over gaps instead of drawing through them', () => {
    expect(linePath([[0, 1], null, [4, 5], [6, 7]])).toBe('M0 1M4 5L6 7')
  })

  it('draws nothing without points', () => {
    expect(linePath([null])).toBe('')
  })
})

describe('areaPath', () => {
  it('fills between the line and the baseline', () => {
    expect(
      areaPath(
        [
          [0, 5],
          [2, 7],
        ],
        0,
      ),
    ).toBe('M0 0L0 5L2 7L2 0Z')
  })

  it('closes each stretch of points separately, skipping the gaps', () => {
    expect(areaPath([[0, 5], null, [4, 6], [6, 7]], 0)).toBe('M0 0L0 5L0 0ZM4 0L4 6L6 7L6 0Z')
  })
})

describe('indexAtX', () => {
  // Four columns of 10 starting at x = 20.
  const layout = { left: 20, width: 40, count: 4 }

  it('finds the column under an x position', () => {
    expect(indexAtX(21, layout)).toBe(0)
    expect(indexAtX(35, layout)).toBe(1)
    expect(indexAtX(59.9, layout)).toBe(3)
  })

  it('has no column outside the plot', () => {
    expect(indexAtX(10, layout)).toBeNull()
    expect(indexAtX(60.1, layout)).toBeNull()
  })

  it('has no column when there are no points', () => {
    expect(indexAtX(30, { left: 20, width: 40, count: 0 })).toBeNull()
  })
})
