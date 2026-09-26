// Mirrors docs/api-contracts.md. Generating these from the OpenAPI schema is still an open decision.

export type ImportStatus = 'queued' | 'processing' | 'succeeded' | 'failed'

export interface ImportIssue {
  code: string
  message: string
  // feature_index: 0-based GeoJSON position; row: 1-based spreadsheet row (header is row 1);
  // null: the whole file. Clients must tolerate shapes they do not know.
  location: { feature_index: number } | { row: number } | null
}

export interface ImportJob {
  id: string
  dataset_id: string
  original_filename: string
  status: ImportStatus
  created_at: string
  finished_at: string | null
  feature_count: number | null
  map_layer_id: string | null
  errors: ImportIssue[]
  errors_truncated: boolean
}

export interface ImportJobList {
  import_jobs: ImportJob[]
  // Null on the last page. Opaque: never build or parse it.
  next_cursor: string | null
}

export interface LayerFilter {
  property: string
  value: string
}

export interface ApiErrorBody {
  error: { code: string; message: string; details: unknown[] }
}

export interface PointFeature {
  type: 'Feature'
  id: string
  geometry: { type: 'Point'; coordinates: number[] }
  properties: Record<string, unknown>
}

export interface PointFeatureCollection {
  type: 'FeatureCollection'
  features: PointFeature[]
}

export interface MapLayerResponse {
  map_layer: {
    id: string
    dataset_id: string
    name: string
    geometry_type: string
    feature_count: number
    // [west, south, east, north]; null when the layer has no features.
    bbox: [number, number, number, number] | null
    property_keys: string[]
  }
  features: PointFeatureCollection
}
