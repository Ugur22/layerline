import { describe, expect, it } from 'vitest'
import type { PointFeature } from '@/api/types'
import {
  activeHidden,
  buildColorScheme,
  buildSizeScale,
  colorExpression,
  DEFAULT_COLOR,
  MAX_CATEGORIES,
  MAX_RADIUS,
  MISSING_COLOR,
  HIDDEN_OPACITY,
  isHiddenPoint,
  MIN_RADIUS,
  NUMERIC_RAMP,
  opacityExpression,
  pointColor,
  radiusExpression,
  visibleFilter,
} from './layerStyle'

function features(values: unknown[], key = 'p'): PointFeature[] {
  return values.map((value, index) => ({
    type: 'Feature',
    id: String(index),
    geometry: { type: 'Point', coordinates: [4, 52] },
    properties: value === undefined ? {} : { [key]: value },
  }))
}

describe('buildColorScheme', () => {
  it('treats a column whose values are all numeric text as a numeric scale', () => {
    const scheme = buildColorScheme(features(['8.6', '10', '9.25']), 'p')

    expect(scheme).toMatchObject({ kind: 'numeric', min: 8.6, max: 10, hasMissing: false })
  })

  it('accepts real JSON numbers as numeric too', () => {
    expect(buildColorScheme(features([1, 5]), 'p')).toMatchObject({
      kind: 'numeric',
      min: 1,
      max: 5,
    })
  })

  it('falls back to categories when a single value is not a number', () => {
    const scheme = buildColorScheme(features(['8.6', 'n/a', '9']), 'p')

    expect(scheme?.kind).toBe('categorical')
  })

  it('orders categories by frequency, then alphabetically', () => {
    const scheme = buildColorScheme(features(['b', 'a', 'b', 'c', 'a', 'b']), 'p')

    expect(scheme?.kind === 'categorical' && scheme.entries.map((e) => e.value)).toEqual([
      'b',
      'a',
      'c',
    ])
  })

  it('gives every category its own colour', () => {
    const scheme = buildColorScheme(features(['a', 'b', 'c']), 'p')

    const colors = scheme?.kind === 'categorical' ? scheme.entries.map((e) => e.color) : []
    expect(new Set(colors).size).toBe(3)
  })

  it('refuses to colour a column with more distinct values than the palette holds', () => {
    const many = Array.from({ length: MAX_CATEGORIES + 1 }, (_, i) => `v${String(i)}`)

    expect(buildColorScheme(features(many), 'p')).toEqual({
      kind: 'too-many',
      key: 'p',
      distinct: MAX_CATEGORIES + 1,
    })
  })

  it('still colours a numeric column that has many distinct values', () => {
    const many = Array.from({ length: 40 }, (_, i) => String(i))

    expect(buildColorScheme(features(many), 'p')?.kind).toBe('numeric')
  })

  it('counts absent, null and empty values as missing without breaking the kind', () => {
    const scheme = buildColorScheme(features(['1', undefined, null, '', '3']), 'p')

    expect(scheme).toMatchObject({ kind: 'numeric', min: 1, max: 3, hasMissing: true })
  })

  it('returns null when no feature has a value, so there is nothing to colour by', () => {
    expect(buildColorScheme(features([undefined, '']), 'p')).toBeNull()
  })

  it('does not read a whitespace-only value as the number zero', () => {
    const scheme = buildColorScheme(features([' ', '5']), 'p')

    expect(scheme?.kind).toBe('categorical')
  })
})

describe('colorExpression', () => {
  it('matches categories on their text form and falls back to other and missing colours', () => {
    const scheme = buildColorScheme(features(['x', 'y', undefined]), 'p')
    if (!scheme || scheme.kind === 'too-many') throw new Error('expected a drawable scheme')

    const expression = JSON.stringify(colorExpression(scheme))

    expect(expression).toContain('"match"')
    expect(expression).toContain('"x"')
    expect(expression).toContain('"y"')
    expect(expression).toContain('"case"')
  })

  it('interpolates numeric values between the observed min and max', () => {
    const scheme = buildColorScheme(features(['2', '8']), 'p')
    if (!scheme || scheme.kind === 'too-many') throw new Error('expected a drawable scheme')

    const expression = colorExpression(scheme) as unknown[]
    const interpolate = expression.flat(3)

    expect(interpolate).toContain('interpolate')
    expect(interpolate).toContain(2)
    expect(interpolate).toContain(8)
  })

  it('uses one flat colour when every numeric value is identical, since stops must ascend', () => {
    const scheme = buildColorScheme(features(['5', '5']), 'p')
    if (!scheme || scheme.kind === 'too-many') throw new Error('expected a drawable scheme')

    expect(JSON.stringify(colorExpression(scheme))).not.toContain('interpolate')
  })
})

describe('buildSizeScale', () => {
  it('builds a scale for a numeric column and notes missing values', () => {
    expect(buildSizeScale(features(['3', '9', undefined]), 'p')).toEqual({
      key: 'p',
      min: 3,
      max: 9,
      hasMissing: true,
    })
  })

  it('offers no scale for a text column, even one that is mostly numbers', () => {
    expect(buildSizeScale(features(['3', '9', 'n/a']), 'p')).toBeNull()
  })

  it('offers no scale when no point has a value', () => {
    expect(buildSizeScale(features([undefined]), 'p')).toBeNull()
  })
})

describe('radiusExpression', () => {
  it('maps the observed range onto the allowed radii', () => {
    const scale = buildSizeScale(features(['2', '8']), 'p')
    if (!scale) throw new Error('expected a scale')

    const flat = (radiusExpression(scale) as unknown[]).flat(3)

    expect(flat).toEqual(expect.arrayContaining(['interpolate', 2, MIN_RADIUS, 8, MAX_RADIUS]))
  })

  it('uses one radius when every value is identical, since stops must ascend', () => {
    const scale = buildSizeScale(features(['4', '4']), 'p')
    if (!scale) throw new Error('expected a scale')

    expect(JSON.stringify(radiusExpression(scale))).not.toContain('interpolate')
  })
})

describe('category counts', () => {
  it('counts the points in each category and the ones without a value', () => {
    const scheme = buildColorScheme(features(['b', 'a', 'b', undefined, '']), 'p')

    expect(scheme).toMatchObject({
      kind: 'categorical',
      entries: [
        { value: 'b', count: 2 },
        { value: 'a', count: 1 },
      ],
      missingCount: 2,
    })
  })
})

describe('opacityExpression', () => {
  const scheme = buildColorScheme(features(['a', 'b', undefined]), 'p')
  if (scheme?.kind !== 'categorical') throw new Error('expected a categorical scheme')

  it('leaves every point fully opaque while nothing is hidden', () => {
    expect(opacityExpression(scheme, [])).toBe(1)
  })

  it('dims the hidden values, matched on their text form', () => {
    expect(opacityExpression(scheme, ['a'])).toEqual([
      'case',
      ['in', ['to-string', ['get', 'p']], ['literal', ['a']]],
      HIDDEN_OPACITY,
      1,
    ])
  })

  it('hides points without a value through the empty string, as the colours do', () => {
    expect(JSON.stringify(opacityExpression(scheme, ['']))).toContain('["literal",[""]]')
  })
})

describe('isHiddenPoint', () => {
  it('matches a point on the text form of its value', () => {
    expect(isHiddenPoint({ p: 7 }, 'p', ['7'])).toBe(true)
    expect(isHiddenPoint({ p: 'a' }, 'p', ['b'])).toBe(false)
  })

  it('treats an absent property as the empty value', () => {
    expect(isHiddenPoint({}, 'p', [''])).toBe(true)
  })

  it('hides nothing when no property is coloured', () => {
    expect(isHiddenPoint({ p: 'a' }, '', ['a'])).toBe(false)
  })
})

describe('activeHidden', () => {
  const scheme = buildColorScheme(features(['a', 'b', undefined]), 'p')
  if (scheme?.kind !== 'categorical') throw new Error('expected a categorical scheme')

  it('keeps hidden values the legend still has a row for', () => {
    expect(activeHidden(scheme, ['a', ''])).toEqual(['a', ''])
  })

  it('drops values that are no longer in the data, so nothing stays dimmed without a row', () => {
    expect(activeHidden(scheme, ['gone'])).toEqual([])
  })

  it('drops "No value" when no point is missing one', () => {
    const complete = buildColorScheme(features(['a', 'b']), 'p')
    if (complete?.kind !== 'categorical') throw new Error('expected a categorical scheme')

    expect(activeHidden(complete, [''])).toEqual([])
  })

  it('hides nothing without a categorical scheme', () => {
    expect(activeHidden(null, ['a'])).toEqual([])
  })
})

describe('visibleFilter', () => {
  const scheme = buildColorScheme(features(['a', 'b']), 'p')
  if (scheme?.kind !== 'categorical') throw new Error('expected a categorical scheme')

  it('does not filter while nothing is hidden', () => {
    expect(visibleFilter(scheme, [])).toBeUndefined()
  })

  it('drops the hidden values', () => {
    expect(visibleFilter(scheme, ['a'])).toEqual([
      '!',
      ['in', ['to-string', ['get', 'p']], ['literal', ['a']]],
    ])
  })
})

describe('pointColor', () => {
  it('uses the default colour when nothing is coloured', () => {
    expect(pointColor(null, { p: 'a' })).toBe(DEFAULT_COLOR)
  })

  it('gives a category its own colour, and points without a value the missing colour', () => {
    const scheme = buildColorScheme(features(['a', 'b', undefined]), 'p')
    if (scheme?.kind !== 'categorical') throw new Error('expected a categorical scheme')

    expect(pointColor(scheme, { p: 'b' })).toBe(scheme.entries[1]?.color)
    expect(pointColor(scheme, {})).toBe(MISSING_COLOR)
  })

  it('places a number on the ramp: the lowest value is the first stop, the highest the last', () => {
    const scheme = buildColorScheme(features(['0', '10']), 'p')
    if (scheme?.kind !== 'numeric') throw new Error('expected a numeric scheme')
    const [low, , high] = NUMERIC_RAMP

    expect(pointColor(scheme, { p: '0' })).toBe(low)
    expect(pointColor(scheme, { p: '10' })).toBe(high)
  })

  it('blends between the stops for values in between', () => {
    const scheme = buildColorScheme(features(['0', '10']), 'p')
    if (scheme?.kind !== 'numeric') throw new Error('expected a numeric scheme')
    const [, mid] = NUMERIC_RAMP

    expect(pointColor(scheme, { p: '5' })).toBe(mid)
    // Halfway between the first two stops, channel by channel: (253,231,37) and (33,145,140).
    expect(pointColor(scheme, { p: '2.5' })).toBe('#8fbc59')
  })

  it('uses the missing colour for a number that is missing', () => {
    const scheme = buildColorScheme(features(['0', '10', undefined]), 'p')
    if (scheme?.kind !== 'numeric') throw new Error('expected a numeric scheme')

    expect(pointColor(scheme, {})).toBe(MISSING_COLOR)
  })

  it('uses one flat colour when every value is the same', () => {
    const scheme = buildColorScheme(features(['7', '7']), 'p')
    if (scheme?.kind !== 'numeric') throw new Error('expected a numeric scheme')
    const [, mid] = NUMERIC_RAMP

    expect(pointColor(scheme, { p: '7' })).toBe(mid)
  })
})
