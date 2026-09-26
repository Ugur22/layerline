import type { PointFeature } from '@/api/types'
import { MAX_CATEGORIES, propertyText } from '../layerStyle'
import { pointLabel } from '../pointLabel'
import { runsOf, valuesFor } from '../profile'
import { cycleOf, extremesOf, haversineKm, isSequence, separationOf, trendOf } from './stats'

export interface StoryStat {
  value: string
  label: string
}

export interface StoryCallout {
  index: number
  text: string
}

// What the map and chart should show while a chapter is open; '' leaves that setting off.
export interface StoryStyle {
  colorKey: string
  sizeKey: string
  profileKey: string
  track: boolean
}

export interface Chapter {
  id: string
  kicker: string
  title: string
  body: string
  stats: StoryStat[]
  style: StoryStyle
  callouts: StoryCallout[]
}

// Beyond the overview, the chapters that say the most; more would stop being a story.
const MAX_INSIGHT_CHAPTERS = 3
// How much of the steps must go one way to call a trend "mostly" rising, falling or flat.
const CLEAR_TREND = 0.7
// With fewer steps than this a "trend" is two or three coin flips, so none is claimed.
const MIN_TREND_STEPS = 3
// A separation between groups of one or two values is easy to get by chance.
const MIN_GROUP_SIZE = 2
const MAX_STAT_TILES = 4
const MAX_BOUNDARY_CALLOUTS = 3
// The property the app already uses to name points; grouping by it says nothing.
const NAME_KEY = 'name'

interface Candidate {
  chapter: Chapter
  // Higher is more worth telling.
  score: number
}

// One property, looked at once: its text per point, and its numbers if it is a quantity.
interface Column {
  key: string
  texts: string[]
  present: number
  // Set only for a quantity (a number that measures something), not for codes or counters.
  numbers: (number | null)[] | null
}

// Rounds away float noise (39.10000000000001) without touching real digits.
function num(value: number): string {
  return String(Number(value.toPrecision(12)))
}

function count(n: number, one: string, many: string): string {
  return `${String(n)} ${n === 1 ? one : many}`
}

// The distance rounded the way a person would say it, as a number and as a unit.
function roughKm(km: number): { text: string; short: string } {
  if (km < 1) return { text: 'less than 1 km', short: '<1 km' }
  const rounded =
    km >= 100 ? Math.round(km / 10) * 10 : km >= 10 ? Math.round(km) : Number(km.toFixed(1))
  return { text: `about ${String(rounded)} km`, short: `≈${String(rounded)} km` }
}

function placeText(coordinates: readonly number[]): string | null {
  const [lon, lat] = coordinates
  if (lon === undefined || lat === undefined) return null
  const round = (value: number) => String(Number(Math.abs(value).toFixed(5)))
  return `${round(lat)}° ${lat >= 0 ? 'N' : 'S'}, ${round(lon)}° ${lon >= 0 ? 'E' : 'W'}`
}

function missingSentence(missing: number, key: string): string {
  return missing > 0 ? ` ${count(missing, 'point has', 'points have')} no value for ${key}.` : ''
}

// Whole numbers that are really labels: codes with leading zeros, or a few values that keep coming
// back (ratings, classes, a 1 or 2 for a campaign).
function looksLikeCode(texts: readonly string[]): boolean {
  const present = texts.filter((text) => text !== '')
  if (!present.every((text) => /^-?\d+$/.test(text.trim()))) return false
  if (present.some((text) => /^-?0\d/.test(text.trim()))) return true
  const distinct = new Set(present).size
  return distinct <= MAX_CATEGORIES && present.length >= distinct * 2
}

function columnOf(features: readonly PointFeature[], key: string): Column {
  const texts = features.map((feature) => propertyText(feature.properties[key]))
  const present = texts.filter((text) => text !== '').length
  const numbers = valuesFor(features, key)
  const allNumbers = present > 0 && numbers.filter((value) => value !== null).length === present
  const quantity = allNumbers && !looksLikeCode(texts) && !isSequence(numbers)
  return { key, texts, present, numbers: quantity ? numbers : null }
}

function overview(features: readonly PointFeature[], propertyCount: number): Chapter {
  const n = features.length
  const first = features[0]
  const last = features[n - 1]
  const firstLabel = first ? pointLabel(first, 0) : ''
  const properties = {
    value: String(propertyCount),
    label: propertyCount === 1 ? 'property' : 'properties',
  }

  if (n === 1 || !first || !last) {
    const place = placeText(first?.geometry.coordinates ?? [])
    return {
      id: 'overview',
      kicker: 'Overview',
      title: '1 point',
      body: place
        ? `The only point, ${firstLabel}, is at ${place}.`
        : `The only point is ${firstLabel}.`,
      stats: [{ value: '1', label: 'point' }, properties],
      style: { colorKey: '', sizeKey: '', profileKey: '', track: false },
      callouts: [],
    }
  }

  const lastLabel = pointLabel(last, n - 1)
  const [lonA = 0, latA = 0] = first.geometry.coordinates
  const [lonB = 0, latB = 0] = last.geometry.coordinates
  const span = roughKm(haversineKm([lonA, latA], [lonB, latB]))
  return {
    id: 'overview',
    kicker: 'Overview',
    title: `${String(n)} points in file order`,
    body: `The first point is ${firstLabel} and the last is ${lastLabel}, ${span.text} apart in a straight line.`,
    stats: [
      { value: String(n), label: 'points' },
      { value: span.short, label: 'first to last, straight line' },
      properties,
    ],
    style: { colorKey: '', sizeKey: '', profileKey: '', track: true },
    callouts: [
      { index: 0, text: `Start · ${firstLabel}` },
      { index: n - 1, text: `End · ${lastLabel}` },
    ],
  }
}

// What the steps along the file order do, in words that are true of them.
function trendSentence(values: readonly (number | null)[]): { text: string; clear: boolean } {
  const { up, down, flat, steps } = trendOf(values)
  if (steps < MIN_TREND_STEPS) return { text: '', clear: false }
  if (up === steps) return { text: ' It rises at every step along the file order.', clear: true }
  if (down === steps) return { text: ' It falls at every step along the file order.', clear: true }
  if (up / steps >= CLEAR_TREND) {
    return {
      text: ` It mostly rises along the file order: ${String(up)} of ${String(steps)} steps go up.`,
      clear: true,
    }
  }
  if (down / steps >= CLEAR_TREND) {
    return {
      text: ` It mostly falls along the file order: ${String(down)} of ${String(steps)} steps go down.`,
      clear: true,
    }
  }
  if (flat / steps >= CLEAR_TREND) {
    return {
      text: ` It barely changes along the file order: ${String(flat)} of ${String(steps)} steps are flat.`,
      clear: false,
    }
  }
  if (up > 0 && down > 0) {
    const flatPart = flat > 0 ? `, ${String(flat)} flat` : ''
    return {
      text: ` It goes up and down along the file order: ${count(up, 'step', 'steps')} up, ${String(down)} down${flatPart}.`,
      clear: false,
    }
  }
  const parts = [
    up > 0 ? `${count(up, 'step', 'steps')} up` : '',
    down > 0 ? `${count(down, 'step', 'steps')} down` : '',
    flat > 0 ? `${String(flat)} flat` : '',
  ].filter((part) => part !== '')
  return { text: ` Along the file order: ${parts.join(', ')}.`, clear: false }
}

function numericChapter(features: readonly PointFeature[], column: Column): Candidate | null {
  const values = column.numbers
  if (!values) return null
  const extremes = extremesOf(values)
  if (!extremes || extremes.min.value === extremes.max.value) return null
  const { min, max } = extremes
  const labelAt = (index: number) => {
    const feature = features[index]
    return feature ? pointLabel(feature, index) : `#${String(index + 1)}`
  }
  // The first point with the value is named; if others share it, that is said too.
  let sharingMin = 0
  let sharingMax = 0
  for (const value of values) {
    if (value === min.value) sharingMin += 1
    if (value === max.value) sharingMax += 1
  }
  const named = (extreme: { value: number; index: number }, sharing: number) =>
    `${num(extreme.value)} (${labelAt(extreme.index)}${sharing > 1 ? ` and ${String(sharing - 1)} more` : ''})`
  const trend = trendSentence(values)
  const missing = column.texts.length - column.present

  const callouts: StoryCallout[] = [{ index: min.index, text: `Lowest · ${num(min.value)}` }]
  if (max.index !== min.index) {
    callouts.push({ index: max.index, text: `Highest · ${num(max.value)}` })
  }
  const more = (sharing: number) => (sharing > 1 ? ` +${String(sharing - 1)}` : '')

  return {
    score: trend.clear ? 2 : 1,
    chapter: {
      id: column.key,
      kicker: `Number · ${column.key}`,
      title: `${column.key}: ${num(min.value)} to ${num(max.value)}`,
      body: `${column.key} runs from ${named(min, sharingMin)} to ${named(max, sharingMax)}, a range of ${num(max.value - min.value)}.${trend.text}${missingSentence(missing, column.key)}`,
      stats: [
        { value: num(min.value), label: `lowest · ${labelAt(min.index)}${more(sharingMin)}` },
        { value: num(max.value), label: `highest · ${labelAt(max.index)}${more(sharingMax)}` },
        { value: num(max.value - min.value), label: 'range' },
      ],
      style: { colorKey: column.key, sizeKey: column.key, profileKey: column.key, track: true },
      callouts,
    },
  }
}

// The first quantity that keeps the groups of `texts` entirely apart, if there is one.
function separatingQuantity(
  texts: readonly string[],
  groupCount: number,
  quantities: readonly Column[],
) {
  for (const quantity of quantities) {
    const numbers = quantity.numbers
    if (!numbers) continue
    const groups = new Map<string, number[]>()
    let left = 0
    texts.forEach((text, index) => {
      const value = numbers[index]
      if (text === '') return
      if (value === null || value === undefined) {
        left += 1
        return
      }
      const group = groups.get(text)
      if (group) group.push(value)
      else groups.set(text, [value])
    })
    if (groups.size !== groupCount) continue
    if ([...groups.values()].some((values) => values.length < MIN_GROUP_SIZE)) continue
    const ranges = separationOf(groups)
    if (ranges) return { key: quantity.key, ranges, left }
  }
  return null
}

function categoryChapter(column: Column, quantities: readonly Column[]): Candidate | null {
  if (column.numbers || column.key === NAME_KEY) return null
  const { texts, present } = column
  const order = [...new Set(texts.filter((text) => text !== ''))]
  // One value or too many make no groups, and a value different for every point is a name.
  if (order.length < 2 || order.length > MAX_CATEGORIES || order.length === present) return null

  const counts = new Map<string, number>()
  for (const text of texts) if (text !== '') counts.set(text, (counts.get(text) ?? 0) + 1)
  const runs = runsOf(texts.map((text) => (text === '' ? null : text)))
  const oneStretch = runs.every((run) => run.label !== null) && runs.length === order.length
  const cycle = present === texts.length ? cycleOf(texts) : null
  const separating = separatingQuantity(texts, order.length, quantities)

  const listed = order
    .map((value) => `${value} (${count(counts.get(value) ?? 0, 'point', 'points')})`)
    .join(', ')
  const places = (run: { start: number; end: number }) =>
    run.start === run.end
      ? `point ${String(run.start + 1)}`
      : `points ${String(run.start + 1)}–${String(run.end + 1)}`
  const span = (range: { min: number; max: number }) =>
    range.min === range.max ? num(range.min) : `${num(range.min)}–${num(range.max)}`

  let body = `There are ${String(order.length)} values: ${listed}.`
  if (oneStretch) {
    const stretches = runs.map((run) => `${run.label ?? ''} (${places(run)})`).join(', ')
    body += ` Each value forms one stretch of the file: ${stretches}.`
  }
  if (cycle) body += ` The values repeat in a fixed order along the file: ${cycle.join(', ')}.`
  if (separating) {
    const ranges = separating.ranges.map((range) => `${range.label} ${span(range)}`)
    body += ` ${separating.key} separates them cleanly: ${ranges.join(', then ')}.`
    body += missingSentence(separating.left, separating.key)
  }
  body += missingSentence(texts.length - present, column.key)

  const callouts: StoryCallout[] = oneStretch
    ? runs.slice(1, MAX_BOUNDARY_CALLOUTS + 1).map((run, index) => ({
        index: run.start,
        text: `${runs[index]?.label ?? ''} ends · ${run.label ?? ''} begins`,
      }))
    : []

  return {
    score: oneStretch || separating ? 3 : cycle ? 2 : 1,
    chapter: {
      id: column.key,
      kicker: `Category · ${column.key}`,
      title:
        order.length <= MAX_STAT_TILES
          ? `${column.key}: ${order.join(', ')}`
          : `${column.key}: ${String(order.length)} values`,
      body,
      stats: [...counts]
        .sort(
          ([aValue, aCount], [bValue, bCount]) => bCount - aCount || aValue.localeCompare(bValue),
        )
        .slice(0, MAX_STAT_TILES)
        .map(([value, n]) => ({ value: String(n), label: value })),
      style: { colorKey: column.key, sizeKey: '', profileKey: separating?.key ?? '', track: true },
      callouts,
    },
  }
}

// The story of a layer, worked out from its own points and nothing else (ADR 0012): an overview,
// then the properties that say the most, each with the map style that shows it. It says what the
// data does; what the screen will show (the track, the colours) is the chapter's style.
export function buildStory(
  features: readonly PointFeature[],
  propertyKeys: readonly string[],
): Chapter[] {
  if (features.length === 0) return []
  // Each property is read once, however many chapters look at it.
  const columns = propertyKeys.map((key) => columnOf(features, key))
  const quantities = columns.filter((column) => column.numbers)
  const candidates: Candidate[] = []
  for (const column of columns) {
    const candidate = numericChapter(features, column) ?? categoryChapter(column, quantities)
    if (candidate) candidates.push(candidate)
  }
  // A stable sort, so equally telling properties stay in the order the layer lists them.
  const chosen = candidates.sort((a, b) => b.score - a.score).slice(0, MAX_INSIGHT_CHAPTERS)
  return [overview(features, propertyKeys.length), ...chosen.map((candidate) => candidate.chapter)]
}
