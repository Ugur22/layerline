import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { PointFeatureCollection } from '@/api/types'
import { useMapInspection, type InspectedPoint } from './mapInspection'
import { PointInspector } from './PointInspector'

const features: PointFeatureCollection = { type: 'FeatureCollection', features: [] }

function point(
  properties: Record<string, unknown>,
  data: PointFeatureCollection = features,
  lon = 4.3651,
): InspectedPoint {
  return { data, coordinates: [lon, 52.4494], properties }
}

beforeEach(() => {
  useMapInspection.getState().clear()
})

describe('PointInspector', () => {
  it('invites the user to point at the map while nothing is inspected', () => {
    render(<PointInspector features={features} />)

    expect(screen.getByText(/hover a point/i)).toBeInTheDocument()
  })

  it('lists every property of the pinned point, with its coordinates', () => {
    useMapInspection.getState().setPinned(point({ name: 'S-001', depth_m: 8.6, active: false }))
    render(<PointInspector features={features} />)

    expect(screen.getByText('Pinned point')).toBeInTheDocument()
    expect(screen.getByText('S-001', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText('depth_m').nextSibling).toHaveTextContent('8.6')
    expect(screen.getByText('active').nextSibling).toHaveTextContent('false')
    expect(screen.getByText('Coordinates').nextSibling).toHaveTextContent('52.44940, 4.36510')
  })

  it('shows nested values as JSON instead of [object Object]', () => {
    useMapInspection.getState().setPinned(point({ tags: { a: 1 } }))
    render(<PointInspector features={features} />)

    expect(screen.getByText('{"a":1}')).toBeInTheDocument()
  })

  it('previews the hovered point, then returns to the pinned one', () => {
    useMapInspection.getState().setPinned(point({ name: 'pinned' }))
    render(<PointInspector features={features} />)

    act(() => {
      useMapInspection.getState().setHover(point({ name: 'hovered' }, features, 4.5))
    })

    expect(screen.getByText('Hovering')).toBeInTheDocument()
    expect(screen.getByText('hovered', { selector: 'p' })).toBeInTheDocument()

    act(() => {
      useMapInspection.getState().setHover(null)
    })

    expect(screen.getByText('Pinned point')).toBeInTheDocument()
    expect(screen.getByText('pinned', { selector: 'p' })).toBeInTheDocument()
  })

  it('still calls it pinned while the pointer rests on the pinned point', () => {
    useMapInspection.getState().setPinned(point({ name: 'pinned' }))
    useMapInspection.getState().setHover(point({ name: 'pinned' }))
    render(<PointInspector features={features} />)

    expect(screen.getByText('Pinned point')).toBeInTheDocument()
    expect(screen.queryByText('Hovering')).not.toBeInTheDocument()
  })

  it('ignores a point that belongs to other data, such as one a new filter removed', () => {
    const other: PointFeatureCollection = { type: 'FeatureCollection', features: [] }
    useMapInspection.getState().setPinned(point({ name: 'stale' }, other))
    render(<PointInspector features={features} />)

    expect(screen.queryByText('stale')).not.toBeInTheDocument()
    expect(screen.getByText(/hover a point/i)).toBeInTheDocument()
  })

  it('says when a point has no properties', () => {
    useMapInspection.getState().setPinned(point({}))
    render(<PointInspector features={features} />)

    expect(screen.getByText('This point has no properties.')).toBeInTheDocument()
  })
})
