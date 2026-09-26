import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImportJob } from '@/api/types'
import { renderWithClient } from '@/test/render'
import { useImportSession } from './importSession'
import { UploadPanel } from './UploadPanel'

const POLL_MS = 10

function job(overrides: Partial<ImportJob>): ImportJob {
  return {
    id: 'job-1',
    dataset_id: 'dataset-1',
    original_filename: 'good.geojson',
    status: 'queued',
    created_at: '2026-01-01T00:00:00Z',
    finished_at: null,
    feature_count: null,
    map_layer_id: null,
    errors: [],
    errors_truncated: false,
    ...overrides,
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Scripts the API: the upload answer, then successive answers to status polls (last one repeats).
function mockApi(upload: Response, polls: ImportJob[]) {
  let pollIndex = 0
  const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return Promise.resolve(upload)
    const next = polls[Math.min(pollIndex, polls.length - 1)]
    pollIndex += 1
    return Promise.resolve(json({ import_job: next }))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function chooseAndUpload(name = 'good.geojson') {
  const user = userEvent.setup()
  await user.upload(screen.getByLabelText(/survey data file/i), new File(['{}'], name))
  await user.click(screen.getByRole('button', { name: 'Upload' }))
}

function pollCount(fetchMock: ReturnType<typeof mockApi>) {
  return fetchMock.mock.calls.filter(([, init]) => init?.method !== 'POST').length
}

describe('UploadPanel', () => {
  beforeEach(() => {
    useImportSession.setState({ jobId: null })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps Upload disabled until a file is chosen', async () => {
    renderWithClient(<UploadPanel pollIntervalMs={POLL_MS} />)
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled()

    await userEvent.upload(
      screen.getByLabelText(/survey data file/i),
      new File(['{}'], 'a.geojson'),
    )

    expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled()
  })

  it('follows a job from queued to succeeded and stops polling', async () => {
    const fetchMock = mockApi(json({ import_job: job({}) }, 202), [
      job({ status: 'processing' }),
      job({ status: 'succeeded', feature_count: 2, map_layer_id: 'layer-9' }),
    ])
    renderWithClient(<UploadPanel pollIntervalMs={POLL_MS} />)

    await chooseAndUpload()

    expect(await screen.findByText('Import succeeded')).toBeInTheDocument()
    expect(screen.getByText(/2 features imported into map layer layer-9/)).toBeInTheDocument()
    const callsAtSuccess = pollCount(fetchMock)
    await new Promise((resolve) => setTimeout(resolve, POLL_MS * 6))
    expect(pollCount(fetchMock)).toBe(callsAtSuccess)
  })

  it('lists each error with its feature number when the import fails', async () => {
    mockApi(json({ import_job: job({}) }, 202), [
      job({
        status: 'failed',
        errors: [
          {
            code: 'invalid_geometry',
            message: 'Coordinates are outside WGS84 range.',
            location: { feature_index: 1 },
          },
          { code: 'invalid_json', message: 'File is not valid UTF-8 JSON.', location: null },
        ],
        errors_truncated: true,
      }),
    ])
    renderWithClient(<UploadPanel pollIntervalMs={POLL_MS} />)

    await chooseAndUpload()

    expect(await screen.findByText(/no features were saved/i)).toBeInTheDocument()
    expect(screen.getByText(/Feature 2: Coordinates are outside WGS84 range/)).toBeInTheDocument()
    expect(screen.getByText(/File: File is not valid UTF-8 JSON/)).toBeInTheDocument()
    expect(screen.getByText(/more errors were found/i)).toBeInTheDocument()
  })

  it('shows the server message when the upload is rejected', async () => {
    mockApi(
      json(
        { error: { code: 'file_too_large', message: 'File exceeds the limit.', details: [] } },
        413,
      ),
      [job({})],
    )
    renderWithClient(<UploadPanel pollIntervalMs={POLL_MS} />)

    await chooseAndUpload()

    expect(await screen.findByText('File exceeds the limit.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled()
  })

  it('shows a generic message when the server does not return our error shape', async () => {
    mockApi(new Response('<html>Bad gateway</html>', { status: 502 }), [job({})])
    renderWithClient(<UploadPanel pollIntervalMs={POLL_MS} />)

    await chooseAndUpload()

    expect(await screen.findByText(/unexpected response/i)).toBeInTheDocument()
  })

  it('does not crash on a status this client does not know', async () => {
    mockApi(json({ import_job: job({}) }, 202), [
      job({ status: 'archived' as ImportJob['status'] }),
    ])
    renderWithClient(<UploadPanel pollIntervalMs={POLL_MS} />)

    await chooseAndUpload()

    await waitFor(() => {
      expect(screen.getByText('Unknown status')).toBeInTheDocument()
    })
  })

  it('accepts CSV files and labels errors with spreadsheet row numbers', async () => {
    mockApi(json({ import_job: job({}) }, 202), [
      job({
        status: 'failed',
        errors: [
          { code: 'invalid_geometry', message: 'Latitude is missing.', location: { row: 4 } },
          { code: 'missing_column', message: 'Missing longitude column.', location: null },
        ],
      }),
    ])
    renderWithClient(<UploadPanel pollIntervalMs={POLL_MS} />)
    expect(screen.getByLabelText(/survey data file/i)).toHaveAttribute(
      'accept',
      expect.stringContaining('.csv'),
    )

    await chooseAndUpload('survey.csv')

    expect(await screen.findByText(/Row 4: Latitude is missing/)).toBeInTheDocument()
    expect(screen.getByText(/File: Missing longitude column/)).toBeInTheDocument()
  })

  it('renders an error location it does not know as a whole-file error', async () => {
    mockApi(json({ import_job: job({}) }, 202), [
      job({
        status: 'failed',
        errors: [
          {
            code: 'future_code',
            message: 'Something new.',
            location: { sheet: 2 } as unknown as { row: number },
          },
        ],
      }),
    ])
    renderWithClient(<UploadPanel pollIntervalMs={POLL_MS} />)

    await chooseAndUpload()

    expect(await screen.findByText(/File: Something new/)).toBeInTheDocument()
  })
})
