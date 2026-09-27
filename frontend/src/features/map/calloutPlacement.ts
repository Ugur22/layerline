import type { LngLatBounds } from './bounds'

// Near the top of the layer, a callout offset above its point can land under the toolbar that
// floats there (FIT_PADDING leaves room for points, not for a label above them too). Judged by
// the data's own extent, not a live projection: reading the map's current pixel position during
// render is not available here (the project() call would need a ref read outside an effect), so
// this holds for the initial fitted view and is a known approximation after a pan or zoom, or for
// a very wide, flat layer the map fits by width rather than height.
const TOP_BAND = 0.15

export type CalloutPlacement = 'above' | 'below'

export function calloutPlacement(latitude: number, bounds: LngLatBounds | null): CalloutPlacement {
  if (!bounds) return 'above'
  const [, south] = bounds[0]
  const [, north] = bounds[1]
  const span = north - south
  if (span <= 0) return 'above'
  return latitude >= north - span * TOP_BAND ? 'below' : 'above'
}
