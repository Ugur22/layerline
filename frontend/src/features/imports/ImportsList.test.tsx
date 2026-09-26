import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImportJob, ImportJobList } from '@/api/types'
import { renderWithClient } from '@/test/render'
import { ImportsList } from './ImportsList'
import { useImportSession } from './importSession'

const POLL_MS = 10
const LIST_URL = '/api/v1/datasets/00000000-0000-4000-8000-000000000003/imports'

function job(id: string, overrides: Partial<ImportJob> = {}): ImportJob {
  return {
    id,
    dataset_id: 'dataset-1',
    original_filename: `${id}.geojson`,
    status: 'succeeded',
    created_at: '2026-01-01T00:00:00Z',
    finished_at: null,
    feature_count: 2,
    map_layer_id: `layer-${id}`,
    errors: [],
    errors_truncated: false,
    ...overrides,
  }
}

function page(jobs: ImportJob[], nextCursor: string | null = null): ImportJobList {
  return { import_jobs: jobs, next_cursor: nextCursor }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Answers each successive call to the list URL (the last answer repeats), keyed by full URL.
function mockList(answers: Record<string, (Response | (() => Response))[]>) {
  const calls: Record<string, number> = {}
  const fetchMock = vi.fn((url: string) => {
    const queue = answers[url]
    if (!queue)
      return Promise.resolve(
        json({ error: { code: 'not_found', message: 'nope', details: [] } }, 404),
      )
    const index = Math.min(calls[url] ?? 0, queue.length - 1)
    calls[url] = (calls[url] ?? 0) + 1
    const answer = queue[index]
    return Promise.resolve(typeof answer === 'function' ? answer() : answer?.clone())
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('ImportsList', () => {
  beforeEach(() => {
    useImportSession.setState({ jobId: null, filter: null })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists imports with their status and selects one when clicked', async () => {
    mockList({
      [LIST_URL]: [json(page([job('a'), job('b', { status: 'failed', feature_count: null })]))],
    })
    renderWithClient(<ImportsList pollIntervalMs={POLL_MS} />)

    const first = await screen.findByRole('button', { name: /a\.geojson/ })
    expect(first).toHaveTextContent('Succeeded')
    expect(first).toHaveTextContent('2 points')
    expect(screen.getByRole('button', { name: /b\.geojson/ })).toHaveTextContent('Failed')

    await userEvent.click(first)

    expect(useImportSession.getState().jobId).toBe('a')
    expect(first).toHaveAttribute('aria-pressed', 'true')
  })

  it('clears the map filter when another import is selected', async () => {
    useImportSession.setState({ filter: { property: 'name', value: 'A' } })
    mockList({ [LIST_URL]: [json(page([job('a')]))] })
    renderWithClient(<ImportsList pollIntervalMs={POLL_MS} />)

    await userEvent.click(await screen.findByRole('button', { name: /a\.geojson/ }))

    expect(useImportSession.getState().filter).toBeNull()
  })

  it('loads the next page with the cursor from the previous one', async () => {
    const fetchMock = mockList({
      [LIST_URL]: [json(page([job('a')], 'cursor-1'))],
      [`${LIST_URL}?cursor=cursor-1`]: [json(page([job('b')]))],
    })
    renderWithClient(<ImportsList pollIntervalMs={POLL_MS} />)
    await screen.findByRole('button', { name: /a\.geojson/ })

    await userEvent.click(screen.getByRole('button', { name: 'Load more' }))

    expect(await screen.findByRole('button', { name: /b\.geojson/ })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(`${LIST_URL}?cursor=cursor-1`, undefined)
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('refreshes while a job is unfinished and then stops', async () => {
    const fetchMock = mockList({
      [LIST_URL]: [
        json(page([job('a', { status: 'processing', map_layer_id: null, feature_count: null })])),
        json(page([job('a')])),
      ],
    })
    renderWithClient(<ImportsList pollIntervalMs={POLL_MS} />)

    expect(await screen.findByText('Processing')).toBeInTheDocument()
    expect(await screen.findByText('Succeeded')).toBeInTheDocument()
    const callsWhenDone = fetchMock.mock.calls.length
    await new Promise((resolve) => setTimeout(resolve, POLL_MS * 6))
    expect(fetchMock.mock.calls.length).toBe(callsWhenDone)
  })

  it('shows an empty state and an error state', async () => {
    mockList({ [LIST_URL]: [json(page([]))] })
    const { unmount } = renderWithClient(<ImportsList pollIntervalMs={POLL_MS} />)
    expect(await screen.findByText(/no imports yet/i)).toBeInTheDocument()
    unmount()

    mockList({
      [LIST_URL]: [
        json({ error: { code: 'not_found', message: 'Dataset not found.', details: [] } }, 404),
      ],
    })
    renderWithClient(<ImportsList pollIntervalMs={POLL_MS} />)
    expect(
      await screen.findByText(/could not load imports: dataset not found/i),
    ).toBeInTheDocument()
  })

  describe('clearing imports', () => {
    // Serves the list until a DELETE succeeds, then an empty one, like the real API would.
    function mockClearable(deleteResponse: () => Response) {
      let cleared = false
      const fetchMock = vi.fn((url: string, init?: RequestInit) => {
        if (url === LIST_URL && init?.method === 'DELETE') {
          const response = deleteResponse()
          cleared = response.ok
          return Promise.resolve(response)
        }
        return Promise.resolve(json(page(cleared ? [] : [job('a'), job('b')])))
      })
      vi.stubGlobal('fetch', fetchMock)
      return fetchMock
    }
    const deletes = (fetchMock: ReturnType<typeof mockClearable>) =>
      fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')

    it('offers no clear button when there is nothing to clear', async () => {
      mockList({ [LIST_URL]: [json(page([]))] })
      renderWithClient(<ImportsList pollIntervalMs={POLL_MS} />)

      await screen.findByText(/no imports yet/i)

      expect(screen.queryByRole('button', { name: /clear imports/i })).not.toBeInTheDocument()
    })

    it('asks for confirmation and deletes nothing until it is given', async () => {
      const fetchMock = mockClearable(() => json({ deleted: 2 }))
      const user = userEvent.setup()
      renderWithClient(<ImportsList pollIntervalMs={POLL_MS} />)
      await screen.findByRole('button', { name: /a\.geojson/ })

      await user.click(screen.getByRole('button', { name: /clear imports/i }))

      expect(screen.getByText(/permanently delete/i)).toBeInTheDocument()
      expect(deletes(fetchMock)).toHaveLength(0)

      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(screen.queryByText(/permanently delete/i)).not.toBeInTheDocument()
      expect(deletes(fetchMock)).toHaveLength(0)
      expect(screen.getByRole('button', { name: /a\.geojson/ })).toBeInTheDocument()
    })

    it('deletes on confirmation, empties the list and drops the selected import', async () => {
      useImportSession.setState({ jobId: 'a', filter: { property: 'name', value: 'A' } })
      const fetchMock = mockClearable(() => json({ deleted: 2 }))
      const user = userEvent.setup()
      renderWithClient(<ImportsList pollIntervalMs={POLL_MS} />)
      await screen.findByRole('button', { name: /a\.geojson/ })

      await user.click(screen.getByRole('button', { name: /clear imports/i }))
      await user.click(screen.getByRole('button', { name: 'Delete' }))

      expect(await screen.findByText(/no imports yet/i)).toBeInTheDocument()
      expect(deletes(fetchMock)).toHaveLength(1)
      expect(useImportSession.getState()).toMatchObject({ jobId: null, filter: null })
      expect(screen.queryByText(/permanently delete/i)).not.toBeInTheDocument()
    })

    it('keeps the list and the selection when the delete fails, and allows retrying', async () => {
      useImportSession.setState({ jobId: 'a' })
      mockClearable(() =>
        json({ error: { code: 'internal', message: 'Database is busy.', details: [] } }, 500),
      )
      const user = userEvent.setup()
      renderWithClient(<ImportsList pollIntervalMs={POLL_MS} />)
      await screen.findByRole('button', { name: /a\.geojson/ })

      await user.click(screen.getByRole('button', { name: /clear imports/i }))
      await user.click(screen.getByRole('button', { name: 'Delete' }))

      expect(await screen.findByText('Database is busy.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /a\.geojson/ })).toBeInTheDocument()
      expect(useImportSession.getState().jobId).toBe('a')
      expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()
    })
  })
})
