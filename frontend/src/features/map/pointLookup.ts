import type { PointFeature, PointFeatureCollection } from '@/api/types'
import type { InspectedPoint } from './mapInspection'

// The map reports a point's position rounded to its tiles and its properties flattened, so a hit is
// matched back to the layer's own feature. The index is also the point's place in the file.
export function nearestFeatureIndex(
  features: PointFeatureCollection,
  [lon, lat]: readonly number[],
): number {
  let best = -1
  let bestDistance = Infinity
  features.features.forEach((feature, index) => {
    const [x = 0, y = 0] = feature.geometry.coordinates
    const distance = (x - (lon ?? 0)) ** 2 + (y - (lat ?? 0)) ** 2
    if (distance < bestDistance) {
      best = index
      bestDistance = distance
    }
  })
  return best
}

export function inspectedPointAt(
  features: PointFeatureCollection,
  index: number,
): InspectedPoint | null {
  const feature = features.features[index]
  if (!feature) return null
  const [lon = 0, lat = 0] = feature.geometry.coordinates
  return { data: features, index, coordinates: [lon, lat], properties: { ...feature.properties } }
}

export interface ResolvedCallout {
  index: number
  coordinates: [number, number]
  text: string
}

// A story chapter's callouts name a point by its id, so they still find it whichever list of
// features it is looked up in: the whole layer, or the fewer points a filter shows.
export function resolveCallouts(
  features: readonly PointFeature[],
  callouts: readonly { id: string; text: string }[],
): ResolvedCallout[] {
  const byId = new Map(features.map((feature, index) => [feature.id, index]))
  const resolved: ResolvedCallout[] = []
  for (const callout of callouts) {
    const index = byId.get(callout.id)
    if (index === undefined) continue
    const feature = features[index]
    if (!feature) continue
    const [lon = 0, lat = 0] = feature.geometry.coordinates
    resolved.push({ index, coordinates: [lon, lat], text: callout.text })
  }
  return resolved
}
