const EARTH_RADIUS_KM = 6371

// Great-circle distance between two [longitude, latitude] positions.
export function haversineKm(
  [lonA, latA]: readonly [number, number],
  [lonB, latB]: readonly [number, number],
): number {
  const rad = Math.PI / 180
  const dLat = (latB - latA) * rad
  const dLon = (lonB - lonA) * rad
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(latA * rad) * Math.cos(latB * rad) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

export interface Trend {
  up: number
  down: number
  flat: number
  steps: number
}

// Steps between neighbouring values; a gap is stepped across, comparing the values either side.
export function trendOf(values: readonly (number | null)[]): Trend {
  const trend: Trend = { up: 0, down: 0, flat: 0, steps: 0 }
  let previous: number | null = null
  for (const value of values) {
    if (value === null) continue
    if (previous !== null) {
      trend.steps += 1
      if (value > previous) trend.up += 1
      else if (value < previous) trend.down += 1
      else trend.flat += 1
    }
    previous = value
  }
  return trend
}

export interface Extreme {
  value: number
  index: number
}

// Where each extreme first occurs.
export function extremesOf(
  values: readonly (number | null)[],
): { min: Extreme; max: Extreme } | null {
  let min: Extreme | null = null
  let max: Extreme | null = null
  for (const [index, value] of values.entries()) {
    if (value === null) continue
    if (min === null || value < min.value) min = { value, index }
    if (max === null || value > max.value) max = { value, index }
  }
  return min && max ? { min, max } : null
}

// The values of a sequence that repeats in a fixed order, if it does: at least two full turns,
// every value once per turn, the last turn allowed to stop early. A turn has to hold every value
// there is, so its length is known up front and one pass decides.
export function cycleOf(labels: readonly string[]): string[] | null {
  const period = new Set(labels).size
  if (period < 2 || period * 2 > labels.length) return null
  const turn = labels.slice(0, period)
  return labels.every((label, index) => label === turn[index % period]) ? turn : null
}

// Values that step by the same amount each time: an index, a row number, a regular timestamp.
export function isSequence(values: readonly (number | null)[]): boolean {
  let previous: number | null = null
  let step: number | null = null
  let steps = 0
  for (const value of values) {
    if (value === null) return false
    if (previous !== null) {
      const delta = value - previous
      if (delta === 0) return false
      if (step === null) step = delta
      else if (Math.abs(delta - step) > Math.abs(step) * 1e-9) return false
      steps += 1
    }
    previous = value
  }
  return steps >= 2
}

export interface GroupRange {
  label: string
  min: number
  max: number
}

// Groups whose value ranges do not overlap at all, lowest first, or null if any two do.
export function separationOf(groups: ReadonlyMap<string, readonly number[]>): GroupRange[] | null {
  if (groups.size < 2) return null
  const ranges: GroupRange[] = []
  for (const [label, values] of groups) {
    if (values.length === 0) return null
    let min = Infinity
    let max = -Infinity
    for (const value of values) {
      if (value < min) min = value
      if (value > max) max = value
    }
    ranges.push({ label, min, max })
  }
  ranges.sort((a, b) => a.min - b.min)
  for (let index = 1; index < ranges.length; index += 1) {
    if ((ranges[index - 1]?.max ?? Infinity) >= (ranges[index]?.min ?? -Infinity)) return null
  }
  return ranges
}
