import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImportJob, MapLayerResponse } from '@/api/types'
import { useImportSession } from '@/features/imports/importSession'
import { useMapInspection } from './mapInspection'
import { useMapView } from './mapView'
import { renderWithClient } from '@/test/render'
import { MapPanel } from './MapPanel'

// jsdom has no WebGL, so the map library is replaced by stubs that expose what they receive.
vi.mock('react-map-gl/maplibre', async () => {
  const React = await import('react')
  return {
    default: (props: { mapStyle: string; initialViewState: unknown; children: unknown }) =>
      React.createElement(
        'div',
        {
          'data-testid': 'map',
          'data-style': props.mapStyle,
          'data-view': JSON.stringify(props.initialViewState),
        },
        props.children as never,
      ),
    Source: (props: {
      id: string
      data: { features?: unknown[]; geometry?: { coordinates: unknown } }
      children: unknown
    }) =>
      React.createElement(
        'div',
        {
          'data-testid': props.id === 'layer' ? 'source' : `source-${props.id}`,
          'data-count': props.data.features?.length,
          'data-coordinates': JSON.stringify(props.data.geometry?.coordinates),
        },
        props.children as never,
      ),
    Layer: (props: {
      id: string
      paint: Record<string, unknown>
      layout?: Record<string, unknown>
    }) =>
      React.createElement('div', {
        'data-testid': props.id === 'layer-points' ? 'layer' : props.id,
        'data-color': JSON.stringify(props.paint['circle-color']),
        'data-radius': JSON.stringify(props.paint['circle-radius']),
        'data-opacity': JSON.stringify(props.paint['circle-opacity']),
        'data-gradient': JSON.stringify(props.paint['line-gradient']),
        'data-label': JSON.stringify(props.layout?.['text-field']),
      }),
    Popup: (props: { children: unknown }) =>
      React.createElement('div', { 'data-testid': 'popup' }, props.children as never),
    Marker: (props: { longitude: number; latitude: number; children: unknown }) =>
      React.createElement(
        'div',
        {
          'data-testid': 'map-callout',
          'data-lnglat': JSON.stringify([props.longitude, props.latitude]),
        },
        props.children as never,
      ),
  }
})

const POLL_MS = 10

function job(overrides: Partial<ImportJob>): ImportJob {
  return {
    id: 'job-1',
    dataset_id: 'dataset-1',
    original_filename: 'good.geojson',
    status: 'succeeded',
    created_at: '2026-01-01T00:00:00Z',
    finished_at: null,
    feature_count: 2,
    map_layer_id: 'layer-1',
    errors: [],
    errors_truncated: false,
    ...overrides,
  }
}

function layer(
  bbox: MapLayerResponse['map_layer']['bbox'],
  propertyKeys: string[] = ['name'],
  onlyFirst = false,
): MapLayerResponse {
  const point = (id: string, lon: number, lat: number) => ({
    type: 'Feature' as const,
    id,
    geometry: { type: 'Point' as const, coordinates: [lon, lat] },
    properties: {},
  })
  return {
    map_layer: {
      id: 'layer-1',
      dataset_id: 'dataset-1',
      name: 'good',
      geometry_type: 'Point',
      feature_count: 2,
      bbox,
      property_keys: propertyKeys,
    },
    features: {
      type: 'FeatureCollection',
      features: onlyFirst
        ? [point('a', 4.9, 52.37)]
        : [point('a', 4.9, 52.37), point('b', 4.95, 52.4)],
    },
  }
}

function layerWithProperties(rows: Record<string, unknown>[], keys: string[]): MapLayerResponse {
  return {
    map_layer: {
      id: 'layer-1',
      dataset_id: 'dataset-1',
      name: 'good',
      geometry_type: 'Point',
      feature_count: rows.length,
      bbox: [4.9, 52.37, 4.95, 52.4],
      property_keys: keys,
    },
    features: {
      type: 'FeatureCollection',
      features: rows.map((properties, index) => ({
        type: 'Feature' as const,
        id: String(index),
        geometry: { type: 'Point' as const, coordinates: [4.9, 52.37] },
        properties,
      })),
    },
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockApi(routes: Record<string, () => Response>) {
  const fetchMock = vi.fn((url: string) => {
    const route = routes[url]
    return Promise.resolve(
      route ? route() : json({ error: { code: 'not_found', message: 'nope', details: [] } }, 404),
    )
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('MapPanel', () => {
  beforeEach(() => {
    useImportSession.setState({ jobId: 'job-1', filter: null })
    useMapInspection.getState().clear()
    useMapView.getState().reset()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders nothing before an import exists', () => {
    useImportSession.setState({ jobId: null })
    const fetchMock = mockApi({})

    renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)

    expect(screen.queryByTestId('map')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not request a layer while the import has none', async () => {
    const fetchMock = mockApi({
      '/api/v1/imports/job-1': () =>
        json({ import_job: job({ status: 'processing', map_layer_id: null }) }),
    })

    renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })

    expect(screen.queryByTestId('map')).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => url.includes('map-layers'))).toBe(false)
  })

  it('draws the layer fitted to its bounding box', async () => {
    mockApi({
      '/api/v1/imports/job-1': () => json({ import_job: job({}) }),
      '/api/v1/map-layers/layer-1': () => json(layer([4.9, 52.37, 4.95, 52.4])),
    })

    renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)

    expect(await screen.findByText('good · 2 points')).toBeInTheDocument()
    expect(await screen.findByTestId('source')).toHaveAttribute('data-count', '2')
    const view = JSON.parse(screen.getByTestId('map').getAttribute('data-view') ?? '{}') as {
      bounds: unknown
      fitBoundsOptions: { padding: { top: number; left: number } }
    }
    expect(view.bounds).toEqual([
      [4.9, 52.37],
      [4.95, 52.4],
    ])
    // The control bar floats over the top of the map, so the points must be fitted below it.
    expect(view.fitBoundsOptions.padding.top).toBeGreaterThan(view.fitBoundsOptions.padding.left)
    expect(screen.getByTestId('map').getAttribute('data-style')).toMatch(/^https:\/\//)
  })

  it('joins the points in file order with a track line, which the reader can switch off and on', async () => {
    mockApi({
      '/api/v1/imports/job-1': () => json({ import_job: job({}) }),
      '/api/v1/map-layers/layer-1': () => json(layer([4.9, 52.37, 4.95, 52.4])),
    })
    const user = userEvent.setup()
    renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)
    const toggle = await screen.findByRole('button', { name: 'Track' })

    // The story opens on the overview, which shows the track.
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('source-track')).toHaveAttribute(
      'data-coordinates',
      '[[4.9,52.37],[4.95,52.4]]',
    )
    expect(screen.getByTestId('layer-track').getAttribute('data-gradient')).toContain(
      'line-progress',
    )

    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByTestId('source-track')).not.toBeInTheDocument()

    await user.click(toggle)

    expect(screen.getByTestId('source-track')).toBeInTheDocument()
  })

  it('offers the track even when the layer has no properties to control', async () => {
    mockApi({
      '/api/v1/imports/job-1': () => json({ import_job: job({}) }),
      '/api/v1/map-layers/layer-1': () => json(layer([4.9, 52.37, 4.95, 52.4], [])),
    })
    renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)

    expect(await screen.findByRole('button', { name: 'Track' })).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'Colour by' })).not.toBeInTheDocument()
  })

  describe('value profile', () => {
    const rows = [
      { name: 'a', depth_m: '10', temp: '4' },
      { name: 'b', depth_m: '20', temp: '5' },
    ]

    it('plots the first numeric property, and follows the one that sizes the points', async () => {
      mockApi({
        '/api/v1/imports/job-1': () => json({ import_job: job({}) }),
        '/api/v1/map-layers/layer-1': () =>
          json(layerWithProperties(rows, ['depth_m', 'name', 'temp'])),
      })
      const user = userEvent.setup()
      renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)

      expect(await screen.findByText('depth_m along the file order')).toBeInTheDocument()

      await user.selectOptions(screen.getByLabelText('Size by'), 'temp')

      expect(screen.getByText('temp along the file order')).toBeInTheDocument()
    })

    it('lets the user pick the property to plot, whatever sizes the points', async () => {
      mockApi({
        '/api/v1/imports/job-1': () => json({ import_job: job({}) }),
        '/api/v1/map-layers/layer-1': () =>
          json(layerWithProperties(rows, ['depth_m', 'name', 'temp'])),
      })
      const user = userEvent.setup()
      renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)
      await screen.findByText('depth_m along the file order')

      await user.selectOptions(screen.getByLabelText('Profile of'), 'temp')

      expect(screen.getByText('temp along the file order')).toBeInTheDocument()
    })

    it('prefers the property that sizes the points, then the one that colours them', async () => {
      mockApi({
        '/api/v1/imports/job-1': () => json({ import_job: job({}) }),
        '/api/v1/map-layers/layer-1': () =>
          json(layerWithProperties(rows, ['depth_m', 'name', 'temp'])),
      })
      const user = userEvent.setup()
      renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)
      await screen.findByText('depth_m along the file order')

      await user.click(
        within(screen.getByRole('radiogroup', { name: 'Colour by' })).getByRole('radio', {
          name: 'temp',
        }),
      )
      expect(screen.getByText('temp along the file order')).toBeInTheDocument()

      await user.selectOptions(screen.getByLabelText('Size by'), 'depth_m')
      expect(screen.getByText('depth_m along the file order')).toBeInTheDocument()
    })

    it('has nothing to plot when no property is a number', async () => {
      mockApi({
        '/api/v1/imports/job-1': () => json({ import_job: job({}) }),
        '/api/v1/map-layers/layer-1': () =>
          json(layerWithProperties([{ type: 'buoy' }, { type: 'mooring' }], ['type'])),
      })
      renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)
      await screen.findByRole('radiogroup', { name: 'Colour by' })

      await vi.waitFor(() => {
        expect(screen.getByRole('radio', { name: 'None' })).toBeEnabled()
      })
      expect(screen.queryByText(/along the file order/)).not.toBeInTheDocument()
    })
  })

  describe('story callouts', () => {
    it('marks the start and end points on the map, at their own coordinates', async () => {
      mockApi({
        '/api/v1/imports/job-1': () => json({ import_job: job({}) }),
        '/api/v1/map-layers/layer-1': () => json(layer([4.9, 52.37, 4.95, 52.4])),
      })
      renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)

      const callouts = await screen.findAllByTestId('map-callout')

      expect(callouts.map((el) => el.textContent)).toEqual(
        expect.arrayContaining([expect.stringContaining('Start'), expect.stringContaining('End')]),
      )
      const coordinates = callouts.map(
        (el) => JSON.parse(el.getAttribute('data-lnglat') ?? '[]') as number[],
      )
      expect(coordinates).toContainEqual([4.9, 52.37])
      expect(coordinates).toContainEqual([4.95, 52.4])
    })

    it('draws no callout for a single-point layer, whose overview has none', async () => {
      mockApi({
        '/api/v1/imports/job-1': () => json({ import_job: job({}) }),
        '/api/v1/map-layers/layer-1': () => json(layer([4.9, 52.37, 4.9, 52.37], ['name'], true)),
      })
      renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)

      await screen.findByText('good · 2 points')

      expect(screen.queryByTestId('map-callout')).not.toBeInTheDocument()
    })

    it('drops a callout whose point a filter has hidden, rather than floating over nothing', async () => {
      const rows = [
        { name: 'S1', group: 'A' },
        { name: 'S2', group: 'A' },
        { name: 'S3', group: 'B' },
        { name: 'S4', group: 'B' },
      ]
      const whole = layerWithProperties(rows, ['group', 'name'])
      mockApi({
        '/api/v1/imports/job-1': () => json({ import_job: job({}) }),
        '/api/v1/map-layers/layer-1': () => json(whole),
        '/api/v1/map-layers/layer-1?property=group&value=B': () =>
          json({
            ...whole,
            features: { ...whole.features, features: whole.features.features.slice(2) },
          }),
      })
      renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)
      await screen.findByText('good · 4 points')
      expect(await screen.findAllByTestId('map-callout')).toHaveLength(2)

      act(() => {
        useImportSession.getState().setFilter({ property: 'group', value: 'B' })
      })
      await screen.findByText('good · showing 2 of 4 points')

      // S1 (the Start callout) is gone from this view; S4 (the End callout) is still shown.
      const callouts = screen.getAllByTestId('map-callout')
      expect(callouts.map((el) => el.textContent)).not.toContain('Start · S1')
      expect(callouts.map((el) => el.textContent)).toEqual(expect.arrayContaining(['End · S4']))
    })

    it('drops a callout once the reader recolours, resizes or re-charts what it was about', async () => {
      mockApi({
        '/api/v1/imports/job-1': () => json({ import_job: job({}) }),
        '/api/v1/map-layers/layer-1': () =>
          json(
            layerWithProperties(
              [
                { name: 'a', depth: '1' },
                { name: 'b', depth: '2' },
                { name: 'c', depth: '9' },
              ],
              ['depth', 'name'],
            ),
          ),
      })
      const user = userEvent.setup()
      renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)
      const story = await screen.findByRole('region', { name: /what you are looking at/i })
      await user.click(within(story).getByRole('button', { name: 'Next' }))
      expect(await screen.findAllByTestId('map-callout')).toHaveLength(2)

      await user.click(
        within(screen.getByRole('radiogroup', { name: 'Colour by' })).getByRole('radio', {
          name: 'None',
        }),
      )

      expect(screen.queryByTestId('map-callout')).not.toBeInTheDocument()
    })
  })

  describe('story', () => {
    const rows = [
      { name: 'a', kind: 'x', d: '1' },
      { name: 'b', kind: 'x', d: '2' },
      { name: 'c', kind: 'x', d: '4' },
      { name: 'd', kind: 'y', d: '9' },
      { name: 'e', kind: 'y', d: '12' },
      { name: 'f', kind: 'y', d: '20' },
    ]

    it('tells what the layer shows and sets the map to show it', async () => {
      mockApi({
        '/api/v1/imports/job-1': () => json({ import_job: job({}) }),
        '/api/v1/map-layers/layer-1': () => json(layerWithProperties(rows, ['d', 'kind', 'name'])),
      })
      const user = userEvent.setup()
      renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)

      const story = await screen.findByRole('region', { name: /what you are looking at/i })
      expect(within(story).getByText('6 points in file order')).toBeInTheDocument()

      await user.click(within(story).getByRole('button', { name: 'Next' }))

      // The chapter is open, so the map is coloured by its property and the control agrees.
      const colourBy = screen.getByRole('radiogroup', { name: 'Colour by' })
      expect(within(colourBy).getByRole('radio', { name: 'kind' })).toBeChecked()
      expect(screen.getByRole('group', { name: 'Legend for kind' })).toBeInTheDocument()
    })

    it('keeps the map as it is set when a filter narrows the points', async () => {
      mockApi({
        '/api/v1/imports/job-1': () => json({ import_job: job({}) }),
        '/api/v1/map-layers/layer-1': () => json(layerWithProperties(rows, ['d', 'kind', 'name'])),
        '/api/v1/map-layers/layer-1?property=kind&value=x': () => {
          const whole = layerWithProperties(rows, ['d', 'kind', 'name'])
          return json({
            ...whole,
            features: { ...whole.features, features: whole.features.features.slice(0, 3) },
          })
        },
      })
      const user = userEvent.setup()
      renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)
      const story = await screen.findByRole('region', { name: /what you are looking at/i })
      await user.click(within(story).getByRole('button', { name: 'Next' }))
      const colourBy = screen.getByRole('radiogroup', { name: 'Colour by' })
      expect(within(colourBy).getByRole('radio', { name: 'kind' })).toBeChecked()
      // The reader changes the map after the chapter set it; a filter must not undo that.
      await user.click(within(colourBy).getByRole('radio', { name: 'name' }))
      await user.click(screen.getByRole('button', { name: 'Track' }))

      await user.selectOptions(screen.getByLabelText('Property'), 'kind')
      await user.type(screen.getByLabelText('Equals'), 'x')
      await user.click(screen.getByRole('button', { name: 'Apply filter' }))
      await screen.findByText('good · showing 3 of 6 points')

      expect(
        within(screen.getByRole('radiogroup', { name: 'Colour by' })).getByRole('radio', {
          name: 'name',
        }),
      ).toBeChecked()
      expect(screen.getByRole('button', { name: 'Track' })).toHaveAttribute('aria-pressed', 'false')
      expect(
        within(screen.getByRole('region', { name: /what you are looking at/i })).getByText('2 / 3'),
      ).toBeInTheDocument()
    })

    it('says the same things while a filter narrows the points', async () => {
      useImportSession.setState({ filter: { property: 'kind', value: 'x' } })
      mockApi({
        '/api/v1/imports/job-1': () => json({ import_job: job({}) }),
        '/api/v1/map-layers/layer-1': () => json(layerWithProperties(rows, ['d', 'kind', 'name'])),
        '/api/v1/map-layers/layer-1?property=kind&value=x': () => {
          const whole = layerWithProperties(rows, ['d', 'kind', 'name'])
          return json({
            ...whole,
            features: { ...whole.features, features: whole.features.features.slice(0, 3) },
          })
        },
      })
      renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)

      const story = await screen.findByRole('region', { name: /what you are looking at/i })

      expect(within(story).getByText('6 points in file order')).toBeInTheDocument()
    })
  })

  it('offers no track for a single point', async () => {
    mockApi({
      '/api/v1/imports/job-1': () => json({ import_job: job({}) }),
      '/api/v1/map-layers/layer-1': () => json(layer([4.9, 52.37, 4.9, 52.37], ['name'], true)),
    })
    renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)

    await screen.findByText('good · 2 points')

    expect(screen.queryByRole('button', { name: 'Track' })).not.toBeInTheDocument()
  })

  it('falls back to a world view when the layer has no bounding box', async () => {
    mockApi({
      '/api/v1/imports/job-1': () => json({ import_job: job({}) }),
      '/api/v1/map-layers/layer-1': () => json(layer(null)),
    })

    renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)

    await screen.findByTestId('map')
    const view = JSON.parse(screen.getByTestId('map').getAttribute('data-view') ?? '{}') as object
    expect(view).not.toHaveProperty('bounds')
    expect(view).toHaveProperty('zoom')
  })

  it('shows the error when the layer cannot be loaded', async () => {
    mockApi({
      '/api/v1/imports/job-1': () => json({ import_job: job({}) }),
    })

    renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)

    expect(await screen.findByText(/could not load the map layer: nope/i)).toBeInTheDocument()
    expect(screen.queryByTestId('map')).not.toBeInTheDocument()
  })

  it('filters the layer by a property and shows how many points match', async () => {
    const fetchMock = mockApi({
      '/api/v1/imports/job-1': () => json({ import_job: job({}) }),
      '/api/v1/map-layers/layer-1': () => json(layer([4.9, 52.37, 4.95, 52.4])),
      '/api/v1/map-layers/layer-1?property=name&value=A%26B+%3F': () =>
        json(layer([4.9, 52.37, 4.95, 52.4], ['name'], true)),
    })
    const user = userEvent.setup()
    renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)
    await screen.findByText('good · 2 points')

    await user.type(screen.getByLabelText('Equals'), 'A&B ?')
    await user.click(screen.getByRole('button', { name: 'Apply filter' }))

    expect(await screen.findByText('good · showing 1 of 2 points')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/map-layers/layer-1?property=name&value=A%26B+%3F',
      undefined,
    )
    expect(useImportSession.getState().filter).toEqual({ property: 'name', value: 'A&B ?' })
  })

  it('clears the filter and shows every point again', async () => {
    mockApi({
      '/api/v1/imports/job-1': () => json({ import_job: job({}) }),
      '/api/v1/map-layers/layer-1': () => json(layer([4.9, 52.37, 4.95, 52.4])),
      '/api/v1/map-layers/layer-1?property=name&value=A': () =>
        json(layer([4.9, 52.37, 4.95, 52.4], ['name'], true)),
    })
    const user = userEvent.setup()
    renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)
    await screen.findByText('good · 2 points')
    await user.type(screen.getByLabelText('Equals'), 'A')
    await user.click(screen.getByRole('button', { name: 'Apply filter' }))
    await screen.findByText('good · showing 1 of 2 points')

    await user.click(screen.getByRole('button', { name: 'Clear' }))

    expect(await screen.findByText('good · 2 points')).toBeInTheDocument()
    expect(useImportSession.getState().filter).toBeNull()
  })

  it('will not apply an empty filter value', async () => {
    mockApi({
      '/api/v1/imports/job-1': () => json({ import_job: job({}) }),
      '/api/v1/map-layers/layer-1': () => json(layer([4.9, 52.37, 4.95, 52.4])),
    })
    renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)

    await screen.findByText('good · 2 points')

    expect(screen.getByRole('button', { name: 'Apply filter' })).toBeDisabled()
  })

  it('explains when a layer has no properties to filter on', async () => {
    mockApi({
      '/api/v1/imports/job-1': () => json({ import_job: job({}) }),
      '/api/v1/map-layers/layer-1': () => json(layer([4.9, 52.37, 4.95, 52.4], [])),
    })
    renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)

    expect(await screen.findByText(/no properties to filter/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Apply filter' })).not.toBeInTheDocument()
  })

  it('lets the user clear a filter whose request failed', async () => {
    mockApi({
      '/api/v1/imports/job-1': () => json({ import_job: job({}) }),
      '/api/v1/map-layers/layer-1': () => json(layer([4.9, 52.37, 4.95, 52.4])),
      '/api/v1/map-layers/layer-1?property=name&value=A': () =>
        json({ error: { code: 'validation_failed', message: 'Too long.', details: [] } }, 400),
    })
    const user = userEvent.setup()
    renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)
    await screen.findByText('good · 2 points')
    await user.type(screen.getByLabelText('Equals'), 'A')
    await user.click(screen.getByRole('button', { name: 'Apply filter' }))
    expect(await screen.findByText(/could not load the map layer: too long/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear filter' }))

    expect(await screen.findByText('good · 2 points')).toBeInTheDocument()
    expect(useImportSession.getState().filter).toBeNull()
  })

  it("never shows another layer's points while a newly selected layer loads", async () => {
    let releaseSecond: (response: Response) => void = () => undefined
    const secondLayer = new Promise<Response>((resolve) => {
      releaseSecond = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/v1/imports/job-1') return Promise.resolve(json({ import_job: job({}) }))
        if (url === '/api/v1/imports/job-2')
          return Promise.resolve(
            json({ import_job: job({ id: 'job-2', map_layer_id: 'layer-2' }) }),
          )
        if (url === '/api/v1/map-layers/layer-1')
          return Promise.resolve(json(layer([4.9, 52.37, 4.95, 52.4])))
        return secondLayer
      }),
    )
    renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)
    await screen.findByText('good · 2 points')

    act(() => {
      useMapInspection.getState().setPinned({
        data: { type: 'FeatureCollection', features: [] },
        index: 0,
        coordinates: [4.9, 52.37],
        properties: { name: 'from the first layer' },
      })
      useImportSession.getState().setJobId('job-2')
    })

    expect(await screen.findByText('Loading map layer…')).toBeInTheDocument()
    expect(screen.queryByText('good · 2 points')).not.toBeInTheDocument()
    expect(useMapInspection.getState().pinned).toBeNull()
    expect(screen.queryByTestId('map')).not.toBeInTheDocument()

    releaseSecond(
      json({
        ...layer([1, 1, 2, 2]),
        map_layer: { ...layer(null).map_layer, id: 'layer-2', name: 'second', feature_count: 1 },
      }),
    )
    expect(await screen.findByText('second · 1 points')).toBeInTheDocument()
  })

  it('limits the filter value to what the API accepts', async () => {
    mockApi({
      '/api/v1/imports/job-1': () => json({ import_job: job({}) }),
      '/api/v1/map-layers/layer-1': () => json(layer([4.9, 52.37, 4.95, 52.4])),
    })
    renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)

    await screen.findByText('good · 2 points')

    expect(screen.getByLabelText('Equals')).toHaveAttribute('maxLength', '500')
  })

  it('sends the filter value exactly as typed, spaces included', async () => {
    const fetchMock = mockApi({
      '/api/v1/imports/job-1': () => json({ import_job: job({}) }),
      '/api/v1/map-layers/layer-1': () => json(layer([4.9, 52.37, 4.95, 52.4])),
      '/api/v1/map-layers/layer-1?property=name&value=+A': () =>
        json(layer([4.9, 52.37, 4.95, 52.4], ['name'], true)),
    })
    const user = userEvent.setup()
    renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)
    await screen.findByText('good · 2 points')

    await user.type(screen.getByLabelText('Equals'), ' A')
    await user.click(screen.getByRole('button', { name: 'Apply filter' }))

    expect(await screen.findByText('good · showing 1 of 2 points')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/map-layers/layer-1?property=name&value=+A',
      undefined,
    )
  })

  describe('colour by property', () => {
    const rows = [
      { type: 'buoy', depth_m: '8.6' },
      { type: 'mooring', depth_m: '12' },
      { type: 'buoy' },
    ]

    it('draws points in one colour until a property is chosen, then shows a legend', async () => {
      mockApi({
        '/api/v1/imports/job-1': () => json({ import_job: job({}) }),
        '/api/v1/map-layers/layer-1': () => json(layerWithProperties(rows, ['type', 'depth_m'])),
      })
      const user = userEvent.setup()
      renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)
      const colorBy = await screen.findByRole('radiogroup', { name: 'Colour by' })
      await vi.waitFor(() => {
        expect(within(colorBy).getByRole('radio', { name: 'None' })).toBeEnabled()
      })
      expect(screen.getByTestId('layer').getAttribute('data-color')).toBe('"#4f46e5"')
      expect(screen.queryByRole('group', { name: /legend/i })).not.toBeInTheDocument()

      await user.click(within(colorBy).getByRole('radio', { name: 'depth_m' }))

      const legend = screen.getByRole('group', { name: 'Legend for depth_m' })
      expect(legend).toHaveTextContent('8.6')
      expect(legend).toHaveTextContent('12')
      expect(legend).toHaveTextContent('No value')
      expect(screen.getByTestId('layer').getAttribute('data-color')).toContain('interpolate')

      await user.click(within(colorBy).getByRole('radio', { name: 'type' }))

      const categories = screen.getByRole('group', { name: 'Legend for type' })
      expect(categories).toHaveTextContent('buoy')
      expect(categories).toHaveTextContent('mooring')

      await user.click(within(colorBy).getByRole('radio', { name: 'None' }))

      expect(screen.queryByRole('group', { name: /legend/i })).not.toBeInTheDocument()
      expect(screen.getByTestId('layer').getAttribute('data-color')).toBe('"#4f46e5"')
    })

    it('dims the points of a legend value when it is clicked, and restores them on a second click', async () => {
      mockApi({
        '/api/v1/imports/job-1': () => json({ import_job: job({}) }),
        '/api/v1/map-layers/layer-1': () => json(layerWithProperties(rows, ['type', 'depth_m'])),
      })
      const user = userEvent.setup()
      renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)
      const colorBy = await screen.findByRole('radiogroup', { name: 'Colour by' })
      await vi.waitFor(() => {
        expect(within(colorBy).getByRole('radio', { name: 'None' })).toBeEnabled()
      })
      await user.click(within(colorBy).getByRole('radio', { name: 'type' }))
      expect(screen.getByTestId('layer').getAttribute('data-opacity')).toBe('1')

      await user.click(screen.getByRole('button', { name: /buoy/ }))

      expect(screen.getByRole('button', { name: /buoy/ })).toHaveAttribute('aria-pressed', 'false')
      expect(screen.getByTestId('layer').getAttribute('data-opacity')).toContain('"buoy"')

      await user.click(screen.getByRole('button', { name: /buoy/ }))

      expect(screen.getByTestId('layer').getAttribute('data-opacity')).toBe('1')
    })

    it('shows every point again when another property is chosen', async () => {
      mockApi({
        '/api/v1/imports/job-1': () => json({ import_job: job({}) }),
        '/api/v1/map-layers/layer-1': () => json(layerWithProperties(rows, ['type', 'depth_m'])),
      })
      const user = userEvent.setup()
      renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)
      const colorBy = await screen.findByRole('radiogroup', { name: 'Colour by' })
      await vi.waitFor(() => {
        expect(within(colorBy).getByRole('radio', { name: 'None' })).toBeEnabled()
      })
      await user.click(within(colorBy).getByRole('radio', { name: 'type' }))
      await user.click(screen.getByRole('button', { name: /buoy/ }))

      await user.click(within(colorBy).getByRole('radio', { name: 'depth_m' }))
      await user.click(within(colorBy).getByRole('radio', { name: 'type' }))

      expect(screen.getByRole('button', { name: /buoy/ })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByTestId('layer').getAttribute('data-opacity')).toBe('1')
    })

    it('keeps the legend of the whole layer while a filter shows only some points', async () => {
      useImportSession.setState({ filter: { property: 'type', value: 'buoy' } })
      mockApi({
        '/api/v1/imports/job-1': () => json({ import_job: job({}) }),
        '/api/v1/map-layers/layer-1': () => json(layerWithProperties(rows, ['type', 'depth_m'])),
        '/api/v1/map-layers/layer-1?property=type&value=buoy': () => {
          const whole = layerWithProperties(rows, ['type', 'depth_m'])
          return json({
            ...whole,
            features: { ...whole.features, features: whole.features.features.slice(0, 1) },
          })
        },
      })
      const user = userEvent.setup()
      renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)
      await screen.findByText('good · showing 1 of 3 points')
      const colorBy = screen.getByRole('radiogroup', { name: 'Colour by' })
      await vi.waitFor(() => {
        expect(within(colorBy).getByRole('radio', { name: 'None' })).toBeEnabled()
      })

      await user.click(within(colorBy).getByRole('radio', { name: 'type' }))

      expect(screen.getByTestId('source')).toHaveAttribute('data-count', '1')
      expect(screen.getByRole('group', { name: 'Legend for type' })).toHaveTextContent('mooring')
    })

    it('says so when no point has a value for the chosen property', async () => {
      mockApi({
        '/api/v1/imports/job-1': () => json({ import_job: job({}) }),
        '/api/v1/map-layers/layer-1': () => json(layerWithProperties([{ a: '1' }], ['a', 'b'])),
      })
      const user = userEvent.setup()
      renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)
      const colorBy = await screen.findByRole('radiogroup', { name: 'Colour by' })
      await vi.waitFor(() => {
        expect(within(colorBy).getByRole('radio', { name: 'None' })).toBeEnabled()
      })

      await user.click(within(colorBy).getByRole('radio', { name: 'b' }))

      expect(screen.getByText('No points have a value for b.')).toBeInTheDocument()
    })

    it('explains that a column with too many distinct values cannot be coloured', async () => {
      const unique = Array.from({ length: 8 }, (_, i) => ({ name: `S-${String(i)}` }))
      mockApi({
        '/api/v1/imports/job-1': () => json({ import_job: job({}) }),
        '/api/v1/map-layers/layer-1': () => json(layerWithProperties(unique, ['name'])),
      })
      const user = userEvent.setup()
      renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)
      const colorBy = await screen.findByRole('radiogroup', { name: 'Colour by' })
      await vi.waitFor(() => {
        expect(within(colorBy).getByRole('radio', { name: 'None' })).toBeEnabled()
      })

      await user.click(within(colorBy).getByRole('radio', { name: 'name' }))

      expect(screen.getByText(/8 different values, too many to colour/)).toBeInTheDocument()
      expect(screen.queryByRole('group', { name: /legend/i })).not.toBeInTheDocument()
      expect(screen.getByTestId('layer').getAttribute('data-color')).toBe('"#4f46e5"')
    })
  })

  describe('size and labels', () => {
    const rows = [
      { name: 'S-1', type: 'buoy', depth_m: '8' },
      { name: 'S-2', type: 'mooring', depth_m: '40' },
    ]
    const stub = () =>
      mockApi({
        '/api/v1/imports/job-1': () => json({ import_job: job({}) }),
        '/api/v1/map-layers/layer-1': () =>
          json(layerWithProperties(rows, ['name', 'type', 'depth_m'])),
      })

    it('offers only numeric columns for size and scales the points by the choice', async () => {
      stub()
      const user = userEvent.setup()
      renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)
      const sizeBy = await screen.findByLabelText('Size by')

      expect(
        within(sizeBy)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['None', 'depth_m'])
      expect(screen.getByTestId('layer').getAttribute('data-radius')).toBe('7')

      await user.selectOptions(sizeBy, 'depth_m')

      expect(screen.getByTestId('layer').getAttribute('data-radius')).toContain('interpolate')
      const legend = screen.getByRole('group', { name: 'Size legend for depth_m' })
      expect(legend).toHaveTextContent('8')
      expect(legend).toHaveTextContent('40')

      await user.selectOptions(sizeBy, '')

      expect(screen.getByTestId('layer').getAttribute('data-radius')).toBe('7')
      expect(screen.queryByRole('group', { name: /size legend/i })).not.toBeInTheDocument()
    })

    it('hides the size control when no column is numeric', async () => {
      mockApi({
        '/api/v1/imports/job-1': () => json({ import_job: job({}) }),
        '/api/v1/map-layers/layer-1': () => json(layerWithProperties([{ type: 'buoy' }], ['type'])),
      })
      renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)
      await screen.findByRole('radiogroup', { name: 'Colour by' })
      await vi.waitFor(() => {
        expect(screen.getByRole('radio', { name: 'None' })).toBeEnabled()
      })

      expect(screen.queryByLabelText('Size by')).not.toBeInTheDocument()
    })

    it('still uses buttons at exactly the largest number of properties that fit', async () => {
      mockApi({
        '/api/v1/imports/job-1': () => json({ import_job: job({}) }),
        '/api/v1/map-layers/layer-1': () =>
          json(layerWithProperties([{ a: '1' }], ['a', 'b', 'c', 'd', 'e'])),
      })
      renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)

      expect(await screen.findByRole('radiogroup', { name: 'Colour by' })).toBeInTheDocument()
    })

    it('switches the colour control to a menu when there are too many properties for buttons', async () => {
      const keys = ['a', 'b', 'c', 'd', 'e', 'f']
      mockApi({
        '/api/v1/imports/job-1': () => json({ import_job: job({}) }),
        '/api/v1/map-layers/layer-1': () => json(layerWithProperties([{ a: '1', b: 'x' }], keys)),
      })
      const user = userEvent.setup()
      renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)
      const colorBy = await screen.findByLabelText('Colour by')
      await vi.waitFor(() => {
        expect(colorBy).toBeEnabled()
      })

      expect(screen.queryByRole('radiogroup', { name: 'Colour by' })).not.toBeInTheDocument()

      await user.selectOptions(colorBy, 'b')

      expect(screen.getByRole('group', { name: 'Legend for b' })).toBeInTheDocument()
    })

    it('adds a label layer for the chosen property and removes it again', async () => {
      stub()
      const user = userEvent.setup()
      renderWithClient(<MapPanel pollIntervalMs={POLL_MS} />)
      const labelBy = await screen.findByLabelText('Label by')
      expect(screen.queryByTestId('layer-labels')).not.toBeInTheDocument()

      await user.selectOptions(labelBy, 'name')

      expect(screen.getByTestId('layer-labels').getAttribute('data-label')).toContain('name')

      await user.selectOptions(labelBy, '')

      expect(screen.queryByTestId('layer-labels')).not.toBeInTheDocument()
    })
  })
})
