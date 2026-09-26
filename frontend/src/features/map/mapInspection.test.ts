import { beforeEach, describe, expect, it } from 'vitest'
import type { PointFeatureCollection } from '@/api/types'
import { useMapInspection, type InspectedPoint } from './mapInspection'

const data: PointFeatureCollection = { type: 'FeatureCollection', features: [] }

function point(lon: number, properties: Record<string, unknown> = {}): InspectedPoint {
  return { data, coordinates: [lon, 52], properties }
}

beforeEach(() => {
  useMapInspection.getState().clear()
})

describe('useMapInspection', () => {
  it('keeps the same hover object while the pointer stays on one point', () => {
    useMapInspection.getState().setHover(point(4))
    const first = useMapInspection.getState().hover

    useMapInspection.getState().setHover(point(4, { name: 'copy' }))

    expect(useMapInspection.getState().hover).toBe(first)
  })

  it('moves the hover to another point, or off the points', () => {
    useMapInspection.getState().setHover(point(4))

    useMapInspection.getState().setHover(point(5))
    expect(useMapInspection.getState().hover?.coordinates[0]).toBe(5)

    useMapInspection.getState().setHover(null)
    expect(useMapInspection.getState().hover).toBeNull()
  })

  it('clears both the hover and the pinned point', () => {
    useMapInspection.getState().setHover(point(4))
    useMapInspection.getState().setPinned(point(5))

    useMapInspection.getState().clear()

    expect(useMapInspection.getState()).toMatchObject({ hover: null, pinned: null })
  })
})
