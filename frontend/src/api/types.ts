// Mirrors docs/api-contracts.md. Generating these from the OpenAPI schema is still an open decision.

export type ImportStatus = 'queued' | 'processing' | 'succeeded' | 'failed'

export interface ImportIssue {
  code: string
  message: string
  location: { feature_index: number } | null
}

export interface ImportJob {
  id: string
  dataset_id: string
  status: ImportStatus
  created_at: string
  finished_at: string | null
  feature_count: number | null
  map_layer_id: string | null
  errors: ImportIssue[]
  errors_truncated: boolean
}

export interface ApiErrorBody {
  error: { code: string; message: string; details: unknown[] }
}
