import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PointFeatureCollection } from '@/api/types'
import { buildColorScheme, type DrawableColorScheme } from './layerStyle'
import { useMapInspection } from './mapInspection'
import { PROFILE_MARGIN, PROFILE_Y_AXIS_WIDTH } from './profileLayout'
import { ValueProfile } from './ValueProfile'

// jsdom has no layout. The chart renders at the size its container starts with, and the pointer
// is placed against that size.
const WIDTH = 320
const HEIGHT = 200
const Y_AXIS = PROFILE_Y_AXIS_WIDTH
const MARGIN_RIGHT = PROFILE_MARGIN.right

function collection(rows: Record<string, unknown>[]): PointFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: rows.map((properties, index) => ({
      type: 'Feature' as const,
      id: String(index),
      geometry: { type: 'Point' as const, coordinates: [4 + index / 10, 52] },
      properties,
    })),
  }
}

const rows = [
  { name: 'S-001', depth_m: '8.6', campaign: 'A' },
  { name: 'S-002', depth_m: '20', campaign: 'A' },
  { name: 'S-003', depth_m: '30', campaign: 'B' },
  { name: 'S-004', depth_m: '47.2', campaign: 'B' },
]
const features = collection(rows)

function categorical(key: string): Extract<DrawableColorScheme, { kind: 'categorical' }> {
  const scheme = buildColorScheme(features.features, key)
  if (scheme?.kind !== 'categorical') throw new Error('expected a categorical scheme')
  return scheme
}

// The centre of the column for point `index` out of `count`.
function columnX(index: number, count = rows.length) {
  const plot = WIDTH - Y_AXIS - MARGIN_RIGHT
  return Y_AXIS + (plot * (index + 0.5)) / count
}

function renderProfile(overrides: Partial<Parameters<typeof ValueProfile>[0]> = {}) {
  return render(
    <ValueProfile
      features={features}
      keys={['depth_m']}
      valueKey="depth_m"
      onKeyChange={() => undefined}
      scheme={null}
      {...overrides}
    />,
  )
}

function wrapperOf(container: HTMLElement): HTMLElement {
  const wrapper = container.querySelector<HTMLElement>('.recharts-wrapper')
  if (!wrapper) throw new Error('the chart did not render')
  return wrapper
}

function point(container: HTMLElement, x: number) {
  fireEvent.mouseMove(wrapperOf(container), { clientX: x, clientY: HEIGHT / 2 })
}

beforeEach(() => {
  useMapInspection.getState().clear()
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: WIDTH,
    height: HEIGHT,
    right: WIDTH,
    bottom: HEIGHT,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ValueProfile', () => {
  it('names the property it plots and describes the chart for screen readers', () => {
    renderProfile()

    expect(screen.getByText(/depth_m along the file order/i)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /depth_m.*8\.6.*47\.2/i })).toBeInTheDocument()
  })

  it('offers every numeric property and reports a change', async () => {
    const onKeyChange = vi.fn()
    const user = userEvent.setup()
    renderProfile({ keys: ['depth_m', 'temp'], onKeyChange })

    await user.selectOptions(screen.getByLabelText('Profile of'), 'temp')

    expect(onKeyChange).toHaveBeenCalledWith('temp')
  })

  describe('pointing', () => {
    it('makes the point under the pointer the hovered one', async () => {
      const { container } = renderProfile()

      point(container, columnX(2))

      await waitFor(() => {
        expect(useMapInspection.getState().hover?.index).toBe(2)
      })
      expect(useMapInspection.getState().hover?.properties.name).toBe('S-003')
    })

    it('clears the hover when the pointer leaves', async () => {
      const { container } = renderProfile()
      point(container, columnX(1))
      await waitFor(() => {
        expect(useMapInspection.getState().hover?.index).toBe(1)
      })

      fireEvent.mouseLeave(wrapperOf(container))

      await waitFor(() => {
        expect(useMapInspection.getState().hover).toBeNull()
      })
    })

    it('pins the clicked point', async () => {
      const { container } = renderProfile()
      point(container, columnX(3))
      await waitFor(() => {
        expect(useMapInspection.getState().hover?.index).toBe(3)
      })

      fireEvent.click(wrapperOf(container), { clientX: columnX(3), clientY: HEIGHT / 2 })

      await waitFor(() => {
        expect(useMapInspection.getState().pinned?.index).toBe(3)
      })
    })

    it('pins the point that was clicked even when the click follows straight on from a move', () => {
      const { container } = renderProfile()
      point(container, columnX(1))

      fireEvent.click(wrapperOf(container), { clientX: columnX(2), clientY: HEIGHT / 2 })

      expect(useMapInspection.getState().pinned?.index).toBe(2)
    })

    it('pins a tapped point that was never hovered', () => {
      const { container } = renderProfile()

      fireEvent.click(wrapperOf(container), { clientX: columnX(3), clientY: HEIGHT / 2 })

      expect(useMapInspection.getState().pinned?.index).toBe(3)
    })

    it('ignores a click in the margin, where there is no point', () => {
      const { container } = renderProfile()

      fireEvent.click(wrapperOf(container), { clientX: Y_AXIS - 10, clientY: HEIGHT / 2 })

      expect(useMapInspection.getState().pinned).toBeNull()
    })

    it('cannot reach a point the legend has dimmed', () => {
      useMapInspection.getState().setHiddenIndexes(new Set([1]))
      const { container } = renderProfile()

      point(container, columnX(1))
      fireEvent.click(wrapperOf(container), { clientX: columnX(1), clientY: HEIGHT / 2 })
      expect(useMapInspection.getState().hover).toBeNull()
      expect(useMapInspection.getState().pinned).toBeNull()
    })
  })

  describe('layout', () => {
    it('draws each dot in the middle of the column the pointer maths gives it', () => {
      renderProfile()

      const centres = screen
        .getAllByTestId('profile-dot')
        .map((dot) => Number(dot.getAttribute('cx')))

      centres.forEach((centre, index) => {
        expect(centre).toBeCloseTo(columnX(index), 0)
      })
    })

    it('tells neighbouring columns apart either side of their boundary', () => {
      const { container } = renderProfile()
      const boundary = columnX(0) + (columnX(1) - columnX(0)) / 2

      fireEvent.click(wrapperOf(container), { clientX: boundary - 1, clientY: HEIGHT / 2 })
      expect(useMapInspection.getState().pinned?.index).toBe(0)

      fireEvent.click(wrapperOf(container), { clientX: boundary + 1, clientY: HEIGHT / 2 })
      expect(useMapInspection.getState().pinned?.index).toBe(1)
    })

    it('keeps the cursor chip inside the plot, even for a long name at either end', () => {
      const long = collection([
        { name: 'Station-North-Sea-Transect-12', depth_m: '5' },
        { name: 'x', depth_m: '6' },
        { name: 'Station-North-Sea-Transect-99', depth_m: '7' },
      ])
      const { rerender } = renderProfile({ features: long })
      const chipBounds = () => {
        const chip = screen.getByTestId('profile-cursor').querySelector('rect')
        const x = Number(chip?.getAttribute('x'))
        return [x, x + Number(chip?.getAttribute('width'))]
      }

      for (const index of [0, 2]) {
        useMapInspection.getState().setPinned({
          data: long,
          index,
          coordinates: [4, 52],
          properties: {},
        })
        rerender(
          <ValueProfile
            features={long}
            keys={['depth_m']}
            valueKey="depth_m"
            onKeyChange={() => undefined}
            scheme={null}
          />,
        )
        const [left, right] = chipBounds()
        expect(left).toBeGreaterThanOrEqual(PROFILE_Y_AXIS_WIDTH)
        expect(right).toBeLessThanOrEqual(WIDTH - MARGIN_RIGHT)
      }
    })

    it('keeps the first and last labels on the axis instead of centring them on their points', () => {
      renderProfile({
        features: collection([
          { name: 'Station-North-Sea-Transect-12', depth_m: '5' },
          { name: 'Station-North-Sea-Transect-99', depth_m: '7' },
        ]),
      })

      const anchors = screen
        .getAllByTestId('profile-tick')
        .map((tick) => tick.getAttribute('text-anchor'))

      expect(anchors).toEqual(['start', 'end'])
    })

    it('draws a horizontal gridline for the value axis', () => {
      const { container } = renderProfile()

      expect(
        container.querySelectorAll('.recharts-cartesian-grid-horizontal line').length,
      ).toBeGreaterThan(0)
    })
  })

  describe('cursor', () => {
    it('shows the hovered point and its value', async () => {
      const { container } = renderProfile()

      point(container, columnX(3))

      expect(await screen.findByTestId('profile-cursor')).toHaveTextContent('S-004 · 47.2')
    })

    it('keeps showing the pinned point once the pointer has left', async () => {
      const { container } = renderProfile()
      point(container, columnX(0))
      await waitFor(() => {
        expect(useMapInspection.getState().hover?.index).toBe(0)
      })
      fireEvent.click(wrapperOf(container), { clientX: columnX(0), clientY: HEIGHT / 2 })
      await waitFor(() => {
        expect(useMapInspection.getState().pinned?.index).toBe(0)
      })
      fireEvent.mouseLeave(wrapperOf(container))

      await waitFor(() => {
        expect(useMapInspection.getState().hover).toBeNull()
      })
      expect(screen.getByTestId('profile-cursor')).toHaveTextContent('S-001 · 8.6')
    })

    it('is absent while nothing is hovered or pinned', () => {
      renderProfile()

      expect(screen.queryByTestId('profile-cursor')).not.toBeInTheDocument()
    })

    it('ignores points from other data', () => {
      useMapInspection.getState().setPinned({
        data: collection(rows),
        index: 0,
        coordinates: [4, 52],
        properties: rows[0] ?? {},
      })
      renderProfile()

      expect(screen.queryByTestId('profile-cursor')).not.toBeInTheDocument()
    })

    it('reads a large value in full, not rounded', () => {
      useMapInspection.getState().clear()
      const big = collection([
        { name: 'big', depth_m: '123456' },
        { name: 'small', depth_m: '1' },
      ])
      useMapInspection.getState().setPinned({
        data: big,
        index: 0,
        coordinates: [4, 52],
        properties: { name: 'big' },
      })
      renderProfile({ features: big })

      expect(screen.getByTestId('profile-cursor')).toHaveTextContent('big · 123456')
    })
  })

  describe('drawing', () => {
    it('marks each point in the colour the map gives it', () => {
      const scheme = categorical('campaign')
      renderProfile({ scheme })

      const fills = screen.getAllByTestId('profile-dot').map((dot) => dot.getAttribute('fill'))

      expect(fills).toEqual([
        scheme.entries[0]?.color,
        scheme.entries[0]?.color,
        scheme.entries[1]?.color,
        scheme.entries[1]?.color,
      ])
    })

    it('fades the dots of points the legend has dimmed', () => {
      useMapInspection.getState().setHiddenIndexes(new Set([1]))
      renderProfile()

      const opacities = screen
        .getAllByTestId('profile-dot')
        .map((dot) => dot.getAttribute('opacity'))

      expect(opacities).toEqual(['1', '0.15', '1', '1'])
    })

    it('leaves out the dots on a long series', () => {
      const many = collection(
        Array.from({ length: 300 }, (_, i) => ({ name: `P${String(i)}`, depth_m: String(i) })),
      )
      renderProfile({ features: many })

      expect(screen.queryByTestId('profile-dot')).not.toBeInTheDocument()
    })

    it('leaves a gap where a point has no number', () => {
      renderProfile({ features: collection([{ depth_m: '5' }, {}, { depth_m: '7' }]) })

      expect(screen.getAllByTestId('profile-dot')).toHaveLength(2)
    })

    it('draws the larger value lower when the axis is inverted, and higher when it is not', async () => {
      const user = userEvent.setup()
      renderProfile()
      const cy = (index: number) =>
        Number(screen.getAllByTestId('profile-dot')[index]?.getAttribute('cy'))
      // Inverted: depth hangs from the top, so the deepest (last) point is the lowest on screen.
      expect(cy(3)).toBeGreaterThan(cy(0))

      await user.click(screen.getByRole('button', { name: 'Invert axis' }))

      expect(cy(3)).toBeLessThan(cy(0))
    })

    it('shows the invert toggle as pressed for depth, and lets the user flip it back', async () => {
      const user = userEvent.setup()
      renderProfile()
      const invert = screen.getByRole('button', { name: 'Invert axis' })
      expect(invert).toHaveAttribute('aria-pressed', 'true')

      await user.click(invert)

      expect(invert).toHaveAttribute('aria-pressed', 'false')
    })

    it('draws other quantities upwards until asked otherwise', () => {
      renderProfile({ keys: ['temp'], valueKey: 'temp' })

      expect(screen.getByRole('button', { name: 'Invert axis' })).toHaveAttribute(
        'aria-pressed',
        'false',
      )
    })
  })

  describe('bands', () => {
    it('shades each stretch of the coloured property and labels it', () => {
      const { container } = renderProfile({ scheme: categorical('campaign') })

      expect(container.querySelectorAll('.recharts-reference-area')).toHaveLength(2)
      expect(screen.getByText('A')).toBeInTheDocument()
      expect(screen.getByText('B')).toBeInTheDocument()
    })

    it('draws none for a numeric colouring', () => {
      const numeric = buildColorScheme(features.features, 'depth_m')
      if (numeric?.kind !== 'numeric') throw new Error('expected a numeric scheme')
      const { container } = renderProfile({ scheme: numeric })

      expect(container.querySelectorAll('.recharts-reference-area')).toHaveLength(0)
    })

    it('drops the band of a category the legend has hidden entirely', () => {
      useMapInspection.getState().setHiddenIndexes(new Set([2, 3]))
      const { container } = renderProfile({ scheme: categorical('campaign') })

      expect(container.querySelectorAll('.recharts-reference-area')).toHaveLength(1)
    })
  })
})
