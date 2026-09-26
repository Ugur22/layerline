import type { PointFeature } from '@/api/types'
import { propertyText } from './layerStyle'

// A value that is not a number is a gap in the profile, not a zero.
export function valuesFor(features: readonly PointFeature[], key: string): (number | null)[] {
  return features.map((feature) => {
    const text = propertyText(feature.properties[key])
    if (text.trim() === '') return null
    const value = Number(text)
    return Number.isFinite(value) ? value : null
  })
}

// A loop, not Math.min(...values): spreading a large layer overflows the call stack.
export function extentOf(values: readonly (number | null)[]): [number, number] | null {
  let min = Infinity
  let max = -Infinity
  for (const value of values) {
    if (value === null) continue
    if (value < min) min = value
    if (value > max) max = value
  }
  return min === Infinity ? null : [min, max]
}

// Positive quantities start from zero so the baseline means something; a constant series gets a
// height of its own so it is still drawn.
export function profileDomain(values: readonly (number | null)[]): [number, number] {
  const extent = extentOf(values)
  if (extent === null) return [0, 1]
  const [min, max] = extent
  const low = min >= 0 ? 0 : min
  // Widened by the value's own size, so it still shows at magnitudes where adding 1 changes nothing.
  return max === low ? [low, low + Math.max(1, Math.abs(low) * 0.1)] : [low, max]
}

// Round tick values (1, 2 or 5 times a power of ten) inside the range.
export function niceTicks(min: number, max: number, target = 4): number[] {
  const rough = (max - min) / target
  if (!(rough > 0) || !Number.isFinite(rough)) return []
  const power = 10 ** Math.floor(Math.log10(rough))
  const fraction = rough / power
  const step = (fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10) * power
  const ticks: number[] = []
  for (let k = Math.ceil(min / step); k * step <= max + step * 1e-9; k += 1) {
    // Twelve significant digits absorb float noise (0.6000000000000001) at any magnitude.
    ticks.push(Number((k * step).toPrecision(12)))
  }
  return ticks
}

export interface Run {
  start: number
  end: number
  label: string | null
}

// Neighbouring points with the same label form one run.
export function runsOf(labels: readonly (string | null)[]): Run[] {
  const runs: Run[] = []
  labels.forEach((label, index) => {
    const last = runs.at(-1)
    if (last && last.label === label) last.end = index
    else runs.push({ start: index, end: index, label })
  })
  return runs
}

// Which of `count` equal columns, spanning `width` from `left`, an x position falls in.
export function indexAtX(
  x: number,
  { left, width, count }: { left: number; width: number; count: number },
): number | null {
  if (count === 0 || width <= 0 || x < left || x > left + width) return null
  return Math.min(count - 1, Math.floor(((x - left) / width) * count))
}
