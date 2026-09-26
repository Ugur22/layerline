import { describe, expect, it } from 'vitest'
import type { PointFeature } from '@/api/types'
import { TRACK_COLOR, trackGradient, trackLine } from './track'

function point(lon: number, lat: number): PointFeature {
  return {
    type: 'Feature',
    id: `${String(lon)},${String(lat)}`,
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: {},
  }
}

describe('trackLine', () => {
  it('joins the points in the order given', () => {
    const line = trackLine([point(4, 52), point(3, 53), point(5, 51)])

    expect(line?.geometry.coordinates).toEqual([
      [4, 52],
      [3, 53],
      [5, 51],
    ])
  })

  it('needs at least two points to draw a line', () => {
    expect(trackLine([point(4, 52)])).toBeNull()
    expect(trackLine([])).toBeNull()
  })
})

describe('trackGradient', () => {
  it('colours the line up to the progress and leaves the rest clear', () => {
    expect(trackGradient(0.4)).toEqual([
      'step',
      ['line-progress'],
      TRACK_COLOR,
      0.4,
      'rgba(0,0,0,0)',
    ])
  })

  it('shows nothing at the start, and never a stop the map would reject', () => {
    const [, , , stop] = trackGradient(0)
    expect(stop).toBeGreaterThan(0)
  })

  it('shows the whole line once complete, including its very last point', () => {
    const [, , , stop] = trackGradient(1)
    expect(stop).toBeGreaterThan(1)
  })
})
