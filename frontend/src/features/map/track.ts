import type { ExpressionSpecification } from 'maplibre-gl'
import type { PointFeature } from '@/api/types'

export const TRACK_COLOR = 'rgba(17,24,39,0.5)'

export interface TrackLine {
  type: 'Feature'
  geometry: { type: 'LineString'; coordinates: number[][] }
  properties: Record<string, never>
}

// The API returns features in file order, so joining them in the order given is the track.
export function trackLine(features: readonly PointFeature[]): TrackLine | null {
  if (features.length < 2) return null
  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: features.map((feature) => feature.geometry.coordinates),
    },
    properties: {},
  }
}

type TrackGradient = ['step', ['line-progress'], string, number, string]

// Needs the source's `lineMetrics`. Stops must be strictly positive, and the last point sits at
// exactly 1, so a finished line gets a stop just past it.
export function trackGradient(progress: number): TrackGradient & ExpressionSpecification {
  const stop = progress <= 0 ? 0.0001 : progress >= 1 ? 1.0001 : progress
  return ['step', ['line-progress'], TRACK_COLOR, stop, 'rgba(0,0,0,0)'] as TrackGradient &
    ExpressionSpecification
}
