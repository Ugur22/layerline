import type { PointFeature } from '@/api/types'
import { pointColor, propertyText, type DrawableColorScheme } from './layerStyle'
import { extentOf, niceTicks, profileDomain, runsOf, valuesFor } from './profile'

export interface ProfileRow {
  index: number
  label: string
  value: number | null
  color: string
}

export interface ProfileBand {
  start: number
  end: number
  label: string
  color: string
}

export interface ProfileModel {
  rows: ProfileRow[]
  domain: [number, number]
  ticks: number[]
  extent: [number, number] | null
  inverted: boolean
  bands: ProfileBand[]
}

// The plot is drawn at whatever width its container has; this is a typical one, used only to drop
// runs too thin to see (narrower than about one pixel).
const DRAWN_WIDTH = 660

// Everything the chart shows, worked out from the data and the settings alone.
export function buildProfile(
  features: readonly PointFeature[],
  valueKey: string,
  scheme: DrawableColorScheme | null,
  invertOverride: boolean | null,
): ProfileModel {
  const values = valuesFor(features, valueKey)
  const extent = extentOf(values)
  const [low, high] = profileDomain(values)
  // Depth is measured downwards from a surface, so it hangs from the top unless told otherwise.
  // Negative depths already run the other way, so those are left alone.
  const inverted = invertOverride ?? (/depth/i.test(valueKey) && (extent?.[0] ?? 0) >= 0)

  const rows = features.map((feature, index): ProfileRow => {
    const name = feature.properties.name
    return {
      index,
      label: typeof name === 'string' && name !== '' ? name : `#${String(index + 1)}`,
      value: values[index] ?? null,
      color: pointColor(scheme, feature.properties),
    }
  })

  const bands: ProfileBand[] =
    scheme?.kind === 'categorical'
      ? runsOf(features.map((feature) => propertyText(feature.properties[scheme.key]) || null))
          .filter(
            (run) =>
              run.label !== null && (run.end - run.start + 1) / features.length >= 1 / DRAWN_WIDTH,
          )
          .map((run) => ({
            start: run.start,
            end: run.end,
            label: run.label ?? '',
            color: pointColor(scheme, { [scheme.key]: run.label }),
          }))
      : []

  return { rows, domain: [low, high], ticks: niceTicks(low, high), extent, inverted, bands }
}
