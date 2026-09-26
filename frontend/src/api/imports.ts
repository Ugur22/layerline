import type { ApiErrorBody, ImportJob, MapLayerResponse } from './types'

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as Partial<ApiErrorBody>
    if (body.error) return new ApiError(response.status, body.error.code, body.error.message)
  } catch {
    // Not JSON: a proxy or gateway error page rather than our error shape.
  }
  return new ApiError(
    response.status,
    'unexpected_response',
    'The server returned an unexpected response.',
  )
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init)
  if (!response.ok) throw await toApiError(response)
  return (await response.json()) as T
}

async function request(input: string, init?: RequestInit): Promise<ImportJob> {
  return (await requestJson<{ import_job: ImportJob }>(input, init)).import_job
}

export function uploadImport(datasetId: string, file: File): Promise<ImportJob> {
  const body = new FormData()
  body.append('file', file)
  return request(`/api/v1/datasets/${datasetId}/imports`, { method: 'POST', body })
}

export function getImport(importJobId: string): Promise<ImportJob> {
  return request(`/api/v1/imports/${importJobId}`)
}

export function getMapLayer(mapLayerId: string): Promise<MapLayerResponse> {
  return requestJson<MapLayerResponse>(`/api/v1/map-layers/${mapLayerId}`)
}
