import type { ExpressionSpecification } from 'maplibre-gl'
import type { PointFeature } from '@/api/types'

export const DEFAULT_COLOR = '#4f46e5'
export const MISSING_COLOR = '#9ca3af'
export const DEFAULT_RADIUS = 7
export const MIN_RADIUS = 5
export const MAX_RADIUS = 14
export const HIDDEN_OPACITY = 0.12

// Okabe-Ito, minus black and yellow: distinguishable with common colour-vision deficiencies and
// still visible against the basemap's water and land.
const CATEGORY_COLORS = [
  '#0072b2',
  '#e69f00',
  '#009e73',
  '#d55e00',
  '#cc79a7',
  '#56b4e9',
  '#7b3294',
]
export const MAX_CATEGORIES = CATEGORY_COLORS.length

// Viridis, light to dark: perceptually even and readable in greyscale.
export const NUMERIC_RAMP = ['#fde725', '#21918c', '#440154'] as const

export interface CategoryEntry {
  value: string
  color: string
  count: number
}

export type ColorScheme =
  | {
      kind: 'categorical'
      key: string
      entries: CategoryEntry[]
      hasMissing: boolean
      missingCount: number
    }
  | { kind: 'numeric'; key: string; min: number; max: number; hasMissing: boolean }
  // Colouring an identifier-like column (every point different) would only be noise.
  | { kind: 'too-many'; key: string; distinct: number }

export type DrawableColorScheme = Exclude<ColorScheme, { kind: 'too-many' }>

export interface SizeScale {
  key: string
  min: number
  max: number
  hasMissing: boolean
}

// CSV values arrive as text, so a "numeric" column is one whose every value parses as a number.
export function propertyText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value === undefined || value === null) return ''
  return JSON.stringify(value)
}

function asNumber(text: string): number | null {
  if (text.trim() === '') return null
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

interface ColumnSummary {
  counts: Map<string, number>
  missing: number
  allNumeric: boolean
  min: number
  max: number
}

function summarize(features: PointFeature[], key: string): ColumnSummary {
  const summary: ColumnSummary = {
    counts: new Map(),
    missing: 0,
    allNumeric: true,
    min: Infinity,
    max: -Infinity,
  }
  for (const feature of features) {
    const text = propertyText(feature.properties[key])
    if (text === '') {
      summary.missing += 1
      continue
    }
    summary.counts.set(text, (summary.counts.get(text) ?? 0) + 1)
    const number = asNumber(text)
    if (number === null) summary.allNumeric = false
    else {
      summary.min = Math.min(summary.min, number)
      summary.max = Math.max(summary.max, number)
    }
  }
  return summary
}

export function buildColorScheme(features: PointFeature[], key: string): ColorScheme | null {
  const { counts, missing, allNumeric, min, max } = summarize(features, key)
  if (counts.size === 0) return null
  const hasMissing = missing > 0
  if (allNumeric) return { kind: 'numeric', key, min, max, hasMissing }
  if (counts.size > MAX_CATEGORIES) return { kind: 'too-many', key, distinct: counts.size }

  const ordered = [...counts.entries()].sort(
    ([aValue, aCount], [bValue, bCount]) => bCount - aCount || aValue.localeCompare(bValue),
  )
  return {
    kind: 'categorical',
    key,
    entries: ordered.map(([value, count], index) => ({
      value,
      color: CATEGORY_COLORS[index] as string,
      count,
    })),
    hasMissing,
    missingCount: missing,
  }
}

// Size only makes sense for a quantity, so text columns get no scale.
export function buildSizeScale(features: PointFeature[], key: string): SizeScale | null {
  const { counts, missing, allNumeric, min, max } = summarize(features, key)
  if (counts.size === 0 || !allNumeric) return null
  return { key, min, max, hasMissing: missing > 0 }
}

export function colorExpression(scheme: DrawableColorScheme): ExpressionSpecification {
  const value: ExpressionSpecification = ['get', scheme.key]
  // Absent, null and empty all stringify to '', which is how the scheme counted them as missing.
  const isMissing: ExpressionSpecification = ['==', ['to-string', value], '']

  if (scheme.kind === 'categorical') {
    const match: unknown[] = ['match', ['to-string', value]]
    for (const entry of scheme.entries) match.push(entry.value, entry.color)
    // Every value has an entry, so the fallback only guards against a value the scheme never saw.
    match.push(MISSING_COLOR)
    return ['case', isMissing, MISSING_COLOR, match as ExpressionSpecification]
  }

  const [low, mid, high] = NUMERIC_RAMP
  // Interpolation stops must strictly ascend, so a constant column gets one flat colour.
  const scale: unknown =
    scheme.min === scheme.max
      ? mid
      : [
          'interpolate',
          ['linear'],
          ['to-number', value],
          scheme.min,
          low,
          (scheme.min + scheme.max) / 2,
          mid,
          scheme.max,
          high,
        ]
  return ['case', isMissing, MISSING_COLOR, scale] as ExpressionSpecification
}

export function radiusExpression(scale: SizeScale): ExpressionSpecification {
  const value: ExpressionSpecification = ['get', scale.key]
  const isMissing: ExpressionSpecification = ['==', ['to-string', value], '']
  const radius: unknown =
    scale.min === scale.max
      ? DEFAULT_RADIUS
      : [
          'interpolate',
          ['linear'],
          ['to-number', value],
          scale.min,
          MIN_RADIUS,
          scale.max,
          MAX_RADIUS,
        ]
  return ['case', isMissing, MIN_RADIUS, radius] as ExpressionSpecification
}

// Points without a value are hidden through the empty string, the same text the colours treat as missing.
export function opacityExpression(
  scheme: DrawableColorScheme,
  hidden: readonly string[],
): ExpressionSpecification | number {
  if (scheme.kind !== 'categorical' || hidden.length === 0) return 1
  return [
    'case',
    ['in', ['to-string', ['get', scheme.key]], ['literal', [...hidden]]],
    HIDDEN_OPACITY,
    1,
  ] as ExpressionSpecification
}

// The map still reports dimmed points under the pointer, so interaction has to skip them itself.
export function isHiddenPoint(
  properties: Record<string, unknown>,
  key: string,
  hidden: readonly string[],
): boolean {
  return key !== '' && hidden.includes(propertyText(properties[key]))
}

// Only values the current legend can show again count as hidden: one that dropped out of the data
// would otherwise keep dimming points with no row left to un-hide it.
export function activeHidden(
  scheme: DrawableColorScheme | null,
  hidden: readonly string[],
): string[] {
  if (scheme?.kind !== 'categorical') return []
  return hidden.filter((value) =>
    value === '' ? scheme.hasMissing : scheme.entries.some((entry) => entry.value === value),
  )
}

// Labels of dimmed points are dropped, not faded: a faded label still takes label space from visible ones.
export function visibleFilter(
  scheme: DrawableColorScheme | null,
  hidden: readonly string[],
): ExpressionSpecification | undefined {
  if (scheme?.kind !== 'categorical' || hidden.length === 0) return undefined
  return ['!', ['in', ['to-string', ['get', scheme.key]], ['literal', [...hidden]]]]
}

function channels(hex: string): number[] {
  return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16))
}

// Blend two colours; the same straight-line mix in RGB that the map's `interpolate` uses.
function mixColors(from: string, to: string, t: number): string {
  const a = channels(from)
  const b = channels(to)
  const mixed = a.map((value, index) => Math.round(value + ((b[index] ?? value) - value) * t))
  return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

// The colour the map gives one point, for charts that show the same points as the map.
export function pointColor(
  scheme: DrawableColorScheme | null,
  properties: Record<string, unknown>,
): string {
  if (!scheme) return DEFAULT_COLOR
  const text = propertyText(properties[scheme.key])
  if (text === '') return MISSING_COLOR
  if (scheme.kind === 'categorical') {
    return scheme.entries.find((entry) => entry.value === text)?.color ?? MISSING_COLOR
  }
  const value = asNumber(text)
  if (value === null) return MISSING_COLOR
  const [low, mid, high] = NUMERIC_RAMP
  if (scheme.min === scheme.max) return mid
  const t = (value - scheme.min) / (scheme.max - scheme.min)
  return t <= 0.5 ? mixColors(low, mid, t * 2) : mixColors(mid, high, (t - 0.5) * 2)
}
