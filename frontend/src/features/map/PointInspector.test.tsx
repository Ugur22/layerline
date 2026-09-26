import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { PointFeatureCollection } from '@/api/types'
import { useMapInspection, type InspectedPoint } from './mapInspection'
import { PointInspector } from './PointInspector'

const features: PointFeatureCollection = {
  type: 'FeatureCollection',
  features: [1, 2, 3].map((n) => ({
    type: 'Feature' as const,
    id: `f${String(n)}`,
    geometry: { type: 'Point' as const, coordinates: [4 + n / 10, 52] },
    properties: { name: `S-00${String(n)}`, depth_m: n * 10 },
  })),
}

function point(
  properties: Record<string, unknown>,
  data: PointFeatureCollection = features,
  index = 0,
): InspectedPoint {
  return { data, index, coordinates: [4.3651 + index, 52.4494], properties }
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
      useMapInspection.getState().setHover(point({ name: 'hovered' }, features, 1))
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

  describe('stepping along the file order', () => {
    function pinnedName() {
      return useMapInspection.getState().pinned?.properties.name
    }

    it('starts at the first point when nothing is pinned and Next is pressed', async () => {
      const user = userEvent.setup()
      render(<PointInspector features={features} />)

      await user.click(screen.getByRole('button', { name: 'Next point' }))

      expect(pinnedName()).toBe('S-001')
      expect(screen.getByText('Pinned point')).toBeInTheDocument()
    })

    it('starts at the last point when nothing is pinned and Previous is pressed', async () => {
      const user = userEvent.setup()
      render(<PointInspector features={features} />)

      await user.click(screen.getByRole('button', { name: 'Previous point' }))

      expect(pinnedName()).toBe('S-003')
    })

    it('moves one point at a time, both ways', async () => {
      const user = userEvent.setup()
      render(<PointInspector features={features} />)
      await user.click(screen.getByRole('button', { name: 'Next point' }))

      await user.click(screen.getByRole('button', { name: 'Next point' }))
      expect(pinnedName()).toBe('S-002')

      await user.click(screen.getByRole('button', { name: 'Previous point' }))
      expect(pinnedName()).toBe('S-001')
    })

    it('stops at either end', async () => {
      const user = userEvent.setup()
      render(<PointInspector features={features} />)
      await user.click(screen.getByRole('button', { name: 'Next point' }))
      expect(screen.getByRole('button', { name: 'Previous point' })).toBeDisabled()

      await user.click(screen.getByRole('button', { name: 'Next point' }))
      await user.click(screen.getByRole('button', { name: 'Next point' }))

      expect(pinnedName()).toBe('S-003')
      expect(screen.getByRole('button', { name: 'Next point' })).toBeDisabled()
    })

    it('says where the point is in the file', async () => {
      const user = userEvent.setup()
      render(<PointInspector features={features} />)

      await user.click(screen.getByRole('button', { name: 'Next point' }))

      expect(screen.getByText('Position').nextSibling).toHaveTextContent('1 of 3')
    })

    it('has nothing to step through in an empty layer', () => {
      render(<PointInspector features={{ type: 'FeatureCollection', features: [] }} />)

      expect(screen.getByRole('button', { name: 'Next point' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Previous point' })).toBeDisabled()
    })
  })
})
