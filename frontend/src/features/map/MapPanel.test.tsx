import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImportJob, MapLayerResponse } from '@/api/types'
import { useImportSession } from '@/features/imports/importSession'
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
    Source: (props: { data: { features: unknown[] }; children: unknown }) =>
      React.createElement(
        'div',
        { 'data-testid': 'source', 'data-count': props.data.features.length },
        props.children as never,
      ),
    Layer: () => React.createElement('div', { 'data-testid': 'layer' }),
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
    }
    expect(view.bounds).toEqual([
      [4.9, 52.37],
      [4.95, 52.4],
    ])
    expect(screen.getByTestId('map').getAttribute('data-style')).toMatch(/^https:\/\//)
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
})
