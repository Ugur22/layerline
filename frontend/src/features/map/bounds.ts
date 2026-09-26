import type { MapLayerResponse } from '@/api/types'

export type LngLatBounds = [[number, number], [number, number]]

export function boundsFor(layer: MapLayerResponse['map_layer']): LngLatBounds | null {
  if (!layer.bbox) return null
  const [west, south, east, north] = layer.bbox
  return [
    [west, south],
    [east, north],
  ]
}
