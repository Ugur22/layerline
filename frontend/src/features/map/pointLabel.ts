import type { PointFeature } from '@/api/types'

// How a point is named for people: its `name` if it has one, else its number in the file.
export function pointLabel(feature: PointFeature, index: number): string {
  const name = feature.properties.name
  return typeof name === 'string' && name !== '' ? name : `#${String(index + 1)}`
}
