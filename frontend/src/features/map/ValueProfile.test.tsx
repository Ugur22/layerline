import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PointFeatureCollection } from '@/api/types'
import { buildColorScheme, type DrawableColorScheme } from './layerStyle'
import { useMapInspection } from './mapInspection'
import { PROFILE_LAYOUT } from './profileLayout'
import { ValueProfile } from './ValueProfile'

const { left, width } = PROFILE_LAYOUT

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

// The centre of column `index` in the chart's own coordinates, which the mocked box maps 1:1.
function centreOf(index: number) {
  return left + (width / rows.length) * (index + 0.5)
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

beforeEach(() => {
  useMapInspection.getState().clear()
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: PROFILE_LAYOUT.viewWidth,
    height: PROFILE_LAYOUT.viewHeight,
    right: PROFILE_LAYOUT.viewWidth,
    bottom: PROFILE_LAYOUT.viewHeight,
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

  it('makes the point under the pointer the hovered one', () => {
    renderProfile()

    fireEvent.mouseMove(screen.getByTestId('profile-surface'), { clientX: centreOf(2) })

    expect(useMapInspection.getState().hover?.index).toBe(2)
    expect(useMapInspection.getState().hover?.properties.name).toBe('S-003')
  })

  it('clears the hover when the pointer leaves', () => {
    renderProfile()
    const surface = screen.getByTestId('profile-surface')
    fireEvent.mouseMove(surface, { clientX: centreOf(1) })

    fireEvent.mouseLeave(surface)

    expect(useMapInspection.getState().hover).toBeNull()
  })

  it('pins the clicked point', () => {
    renderProfile()

    fireEvent.click(screen.getByTestId('profile-surface'), { clientX: centreOf(3) })

    expect(useMapInspection.getState().pinned?.index).toBe(3)
  })

  it('ignores the chart margin, where there is no point', () => {
    renderProfile()

    fireEvent.mouseMove(screen.getByTestId('profile-surface'), { clientX: left - 10 })

    expect(useMapInspection.getState().hover).toBeNull()
  })

  it('cannot reach a point the legend has dimmed', () => {
    useMapInspection.getState().setHiddenIndexes(new Set([1]))
    renderProfile()
    const surface = screen.getByTestId('profile-surface')

    fireEvent.mouseMove(surface, { clientX: centreOf(1) })
    fireEvent.click(surface, { clientX: centreOf(1) })

    expect(useMapInspection.getState().hover).toBeNull()
    expect(useMapInspection.getState().pinned).toBeNull()
  })

  it('shows the hovered point and its value at the cursor', () => {
    renderProfile()

    fireEvent.mouseMove(screen.getByTestId('profile-surface'), { clientX: centreOf(3) })

    expect(screen.getByTestId('profile-cursor')).toHaveTextContent('S-004 · 47.2')
  })

  it('keeps showing the pinned point at the cursor once the pointer has left', () => {
    renderProfile()
    const surface = screen.getByTestId('profile-surface')
    fireEvent.click(surface, { clientX: centreOf(0) })
    fireEvent.mouseLeave(surface)

    expect(screen.getByTestId('profile-cursor')).toHaveTextContent('S-001 · 8.6')
  })

  it('shows no cursor while nothing is hovered or pinned', () => {
    renderProfile()

    expect(screen.queryByTestId('profile-cursor')).not.toBeInTheDocument()
  })

  it('ignores points from other data', () => {
    const other = collection(rows)
    useMapInspection.getState().setPinned({
      data: other,
      index: 0,
      coordinates: [4, 52],
      properties: rows[0] ?? {},
    })
    renderProfile()

    expect(screen.queryByTestId('profile-cursor')).not.toBeInTheDocument()
  })

  it('shades the stretches of the coloured property, one band per run', () => {
    renderProfile({ scheme: categorical('campaign') })

    expect(screen.getAllByTestId('profile-band')).toHaveLength(2)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('draws no bands for a numeric colouring', () => {
    const numeric = buildColorScheme(features.features, 'depth_m')
    if (numeric?.kind !== 'numeric') throw new Error('expected a numeric scheme')
    renderProfile({ scheme: numeric })

    expect(screen.queryByTestId('profile-band')).not.toBeInTheDocument()
  })

  it('marks each point', () => {
    renderProfile()
    expect(screen.getAllByTestId('profile-dot')).toHaveLength(4)
  })

  it('leaves out the dots on a long series', () => {
    const many = collection(
      Array.from({ length: 300 }, (_, i) => ({ name: `P${String(i)}`, depth_m: String(i) })),
    )
    renderProfile({ features: many })

    expect(screen.queryByTestId('profile-dot')).not.toBeInTheDocument()
  })

  it('draws the larger value lower when the axis is inverted, and higher when it is not', async () => {
    const user = userEvent.setup()
    renderProfile()
    const [first, , , last] = screen.getAllByTestId('profile-dot')
    // Inverted: depth hangs from the top, so the deepest (last) point is the lowest on screen.
    expect(Number(last?.getAttribute('cy'))).toBeGreaterThan(Number(first?.getAttribute('cy')))

    await user.click(screen.getByRole('button', { name: 'Invert axis' }))

    expect(Number(last?.getAttribute('cy'))).toBeLessThan(Number(first?.getAttribute('cy')))
  })

  it('does not hang negative depths from the surface, since larger then means shallower', () => {
    renderProfile({ features: collection([{ depth_m: '-10' }, { depth_m: '-30' }]) })

    expect(screen.getByRole('button', { name: 'Invert axis' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('fades the dots of points the legend has dimmed', () => {
    useMapInspection.getState().setHiddenIndexes(new Set([1]))
    renderProfile()

    const opacities = screen.getAllByTestId('profile-dot').map((dot) => dot.getAttribute('opacity'))

    expect(opacities).toEqual(['1', '0.15', '1', '1'])
  })

  it('colours the dots as the map colours its points', () => {
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

  it('drops the band of a category the legend has hidden entirely', () => {
    useMapInspection.getState().setHiddenIndexes(new Set([2, 3]))
    renderProfile({ scheme: categorical('campaign') })

    expect(screen.getAllByTestId('profile-band')).toHaveLength(1)
  })

  it('reads a large value in full at the cursor, not rounded', () => {
    renderProfile({
      features: collection([
        { name: 'big', depth_m: '123456' },
        { name: 'small', depth_m: '1' },
      ]),
    })

    fireEvent.click(screen.getByTestId('profile-surface'), { clientX: left + width / 4 })

    expect(screen.getByTestId('profile-cursor')).toHaveTextContent('big · 123456')
  })

  it('flips the axis so depth hangs from the surface, and lets the user flip it back', async () => {
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

  it('leaves a gap where a point has no number', () => {
    renderProfile({
      features: collection([{ depth_m: '5' }, {}, { depth_m: '7' }]),
    })

    expect(screen.getAllByTestId('profile-dot')).toHaveLength(2)
  })
})
