import { describe, expect, it } from 'vitest'
import type { PointFeatureCollection } from '@/api/types'
import { inspectedPointAt, nearestFeatureIndex } from './pointLookup'

const features: PointFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'a',
      geometry: { type: 'Point', coordinates: [4, 52] },
      properties: { n: 1 },
    },
    {
      type: 'Feature',
      id: 'b',
      geometry: { type: 'Point', coordinates: [5, 53] },
      properties: { n: 2 },
    },
    {
      type: 'Feature',
      id: 'c',
      geometry: { type: 'Point', coordinates: [6, 54] },
      properties: { n: 3 },
    },
  ],
}

describe('nearestFeatureIndex', () => {
  it('finds the feature closest to a position, even when the map rounded it a little', () => {
    expect(nearestFeatureIndex(features, [5.0004, 52.9996])).toBe(1)
    expect(nearestFeatureIndex(features, [6, 54])).toBe(2)
  })

  it('takes the first of several features at the same spot', () => {
    const first = features.features.slice(0, 1)
    const twins: PointFeatureCollection = {
      type: 'FeatureCollection',
      features: [...first, ...first.map((feature) => ({ ...feature, id: 'twin' }))],
    }

    expect(nearestFeatureIndex(twins, [4, 52])).toBe(0)
  })

  it('finds nothing in an empty layer', () => {
    expect(nearestFeatureIndex({ type: 'FeatureCollection', features: [] }, [4, 52])).toBe(-1)
  })
})

describe('inspectedPointAt', () => {
  it('describes a feature by its own coordinates and properties, and its place in the layer', () => {
    const point = inspectedPointAt(features, 1)

    expect(point).toEqual({
      data: features,
      index: 1,
      coordinates: [5, 53],
      properties: { n: 2 },
    })
  })

  it('copies the properties so nothing shares the layer data', () => {
    const point = inspectedPointAt(features, 0)

    expect(point?.properties).not.toBe(features.features[0]?.properties)
  })

  it('has no point beyond the ends', () => {
    expect(inspectedPointAt(features, -1)).toBeNull()
    expect(inspectedPointAt(features, 3)).toBeNull()
  })
})
