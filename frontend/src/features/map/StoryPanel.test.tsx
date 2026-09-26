import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { PointFeature } from '@/api/types'
import { useMapView } from './mapView'
import { StoryPanel } from './StoryPanel'

// Twelve points along a line: campaign A then B, depth rising, so the story has an overview and
// two more chapters.
const features: PointFeature[] = Array.from({ length: 12 }, (_, i) => ({
  type: 'Feature' as const,
  id: String(i),
  geometry: { type: 'Point' as const, coordinates: [4 + i / 10, 52 + i / 10] },
  properties: {
    name: `S-${String(i + 1).padStart(2, '0')}`,
    campaign: i < 6 ? 'A' : 'B',
    depth: String(10 + i * i),
  },
}))
const KEYS = ['campaign', 'depth', 'name']

function renderPanel(list = features) {
  return render(<StoryPanel features={list} propertyKeys={KEYS} />)
}

beforeEach(() => {
  useMapView.getState().reset()
})

describe('StoryPanel', () => {
  it('opens on the overview', () => {
    renderPanel()

    const panel = screen.getByRole('region', { name: /what you are looking at/i })
    expect(within(panel).getByText('Overview')).toBeInTheDocument()
    expect(within(panel).getByText('12 points in file order')).toBeInTheDocument()
    expect(within(panel).getByText(/first point is S-01 and the last is S-12/)).toBeInTheDocument()
    expect(within(panel).getByText('1 / 3')).toBeInTheDocument()
  })

  it('shows the figures of the chapter as tiles', () => {
    renderPanel()

    expect(screen.getByText('first to last, straight line')).toBeInTheDocument()
    expect(screen.getByText('properties')).toBeInTheDocument()
  })

  it('moves through the chapters and back again', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    expect(screen.getByText(/^Category · campaign$/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
  })

  it('cannot go back from the first chapter, and offers to start over after the last', async () => {
    const user = userEvent.setup()
    renderPanel()
    expect(screen.getByRole('button', { name: 'Back' })).toHaveAttribute('aria-disabled', 'true')

    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('3 / 3')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Start over' }))

    expect(screen.getByText('1 / 3')).toBeInTheDocument()
  })

  it('jumps to a chapter from the bars, and marks the current one', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('button', { name: 'Chapter 3: depth' }))

    expect(screen.getByText('3 / 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Chapter 3: depth' })).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(screen.getByRole('button', { name: 'Chapter 1: Overview' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  describe('setting the map', () => {
    it('starts each layer from a clean view, not from what the last one left', () => {
      useMapView.getState().setLabelKey('name')
      useMapView.getState().setSizeKey('depth')
      useMapView.getState().toggleHidden('A')

      renderPanel()

      expect(useMapView.getState()).toMatchObject({ labelKey: '', sizeKey: '', hidden: [] })
    })

    it('shows the track for the overview as soon as the story opens', () => {
      renderPanel()

      expect(useMapView.getState()).toMatchObject({ colorKey: '', sizeKey: '', showTrack: true })
    })

    it('colours, sizes and charts the property of the chapter that is open', async () => {
      const user = userEvent.setup()
      renderPanel()

      await user.click(screen.getByRole('button', { name: 'Chapter 3: depth' }))

      expect(useMapView.getState()).toMatchObject({
        colorKey: 'depth',
        sizeKey: 'depth',
        profileKey: 'depth',
        showTrack: true,
      })
    })

    it('colours by the property of a category chapter and charts what separates it', async () => {
      const user = userEvent.setup()
      renderPanel()

      await user.click(screen.getByRole('button', { name: 'Next' }))

      expect(useMapView.getState()).toMatchObject({
        colorKey: 'campaign',
        sizeKey: '',
        profileKey: 'depth',
      })
    })

    it('leaves the label the reader chose', async () => {
      const user = userEvent.setup()
      renderPanel()
      useMapView.getState().setLabelKey('name')

      await user.click(screen.getByRole('button', { name: 'Next' }))

      expect(useMapView.getState().labelKey).toBe('name')
    })
  })

  it('keeps what the reader changed on the map when the same data arrives again', () => {
    const { rerender } = renderPanel()
    useMapView.getState().setColorKey('depth')
    useMapView.getState().setShowTrack(false)

    rerender(
      <StoryPanel
        features={features.map((feature) => ({ ...feature }))}
        propertyKeys={[...KEYS]}
      />,
    )

    expect(useMapView.getState()).toMatchObject({ colorKey: 'depth', showTrack: false })
  })

  it('announces a new chapter to screen readers', () => {
    renderPanel()

    expect(screen.getByText('12 points in file order').closest('[aria-live]')).toHaveAttribute(
      'aria-live',
      'polite',
    )
  })

  it('names the region after its visible title', () => {
    renderPanel()

    expect(screen.getByRole('region', { name: /what you are looking at/i })).toBeInTheDocument()
  })

  it('offers no way to move when there is only one chapter', () => {
    renderPanel(features.slice(0, 1))

    expect(screen.getByText('1 point')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start over' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
  })

  it('has no panel for a layer with no points', () => {
    renderPanel([])

    expect(
      screen.queryByRole('region', { name: /what you are looking at/i }),
    ).not.toBeInTheDocument()
  })
})
