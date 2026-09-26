import { describe, expect, it } from 'vitest'
import type { PointFeature } from '@/api/types'
import { buildColorScheme, DEFAULT_COLOR, type DrawableColorScheme } from './layerStyle'
import { buildProfile } from './profileModel'

function features(rows: Record<string, unknown>[]): PointFeature[] {
  return rows.map((properties, index) => ({
    type: 'Feature' as const,
    id: String(index),
    geometry: { type: 'Point' as const, coordinates: [4, 52] },
    properties,
  }))
}

const rows = [
  { name: 'S-001', depth_m: '8.6', campaign: 'A' },
  { name: 'S-002', depth_m: '20', campaign: 'A' },
  { name: 'S-003', depth_m: '30', campaign: 'B' },
  { name: 'S-004', depth_m: '47.2', campaign: 'B' },
]

function categorical(key: string): Extract<DrawableColorScheme, { kind: 'categorical' }> {
  const scheme = buildColorScheme(features(rows), key)
  if (scheme?.kind !== 'categorical') throw new Error('expected a categorical scheme')
  return scheme
}

describe('buildProfile', () => {
  it('makes one row per point, in order, with its label, value and colour', () => {
    const { rows: built } = buildProfile(features(rows), 'depth_m', null, null)

    expect(built.map((row) => [row.index, row.label, row.value])).toEqual([
      [0, 'S-001', 8.6],
      [1, 'S-002', 20],
      [2, 'S-003', 30],
      [3, 'S-004', 47.2],
    ])
    expect(built.every((row) => row.color === DEFAULT_COLOR)).toBe(true)
  })

  it('labels a point without a name by its number, and a missing value as null', () => {
    const { rows: built } = buildProfile(features([{ depth_m: '5' }, {}]), 'depth_m', null, null)

    expect(built.map((row) => [row.label, row.value])).toEqual([
      ['#1', 5],
      ['#2', null],
    ])
  })

  it('colours each row as the map colours the point', () => {
    const scheme = categorical('campaign')
    const { rows: built } = buildProfile(features(rows), 'depth_m', scheme, null)

    expect(built.map((row) => row.color)).toEqual([
      scheme.entries[0]?.color,
      scheme.entries[0]?.color,
      scheme.entries[1]?.color,
      scheme.entries[1]?.color,
    ])
  })

  it('gives the domain, round ticks and the extent of the values', () => {
    const model = buildProfile(features(rows), 'depth_m', null, null)

    expect(model.domain).toEqual([0, 47.2])
    expect(model.ticks).toEqual([0, 10, 20, 30, 40])
    expect(model.extent).toEqual([8.6, 47.2])
  })

  it('hangs a depth from the surface by default, and other quantities upwards', () => {
    expect(buildProfile(features(rows), 'depth_m', null, null).inverted).toBe(true)
    expect(buildProfile(features([{ temp: '4' }]), 'temp', null, null).inverted).toBe(false)
  })

  it('leaves negative depths alone, since they already run the other way', () => {
    const negative = features([{ depth_m: '-10' }, { depth_m: '-30' }])

    expect(buildProfile(negative, 'depth_m', null, null).inverted).toBe(false)
  })

  it('lets the user override the default either way', () => {
    expect(buildProfile(features(rows), 'depth_m', null, false).inverted).toBe(false)
    expect(buildProfile(features([{ temp: '4' }]), 'temp', null, true).inverted).toBe(true)
  })

  it('shades each run of a categorical property in its colour', () => {
    const scheme = categorical('campaign')
    const { bands } = buildProfile(features(rows), 'depth_m', scheme, null)

    expect(bands).toEqual([
      { start: 0, end: 1, label: 'A', color: scheme.entries[0]?.color },
      { start: 2, end: 3, label: 'B', color: scheme.entries[1]?.color },
    ])
  })

  it('has no bands for a numeric colouring or none at all', () => {
    const numeric = buildColorScheme(features(rows), 'depth_m')
    if (numeric?.kind !== 'numeric') throw new Error('expected a numeric scheme')

    expect(buildProfile(features(rows), 'depth_m', numeric, null).bands).toEqual([])
    expect(buildProfile(features(rows), 'depth_m', null, null).bands).toEqual([])
  })

  it('leaves out points with no value in the property that is coloured', () => {
    const scheme = categorical('campaign')
    const withGap = features([
      { campaign: 'A', depth_m: '1' },
      { depth_m: '2' },
      { campaign: 'A', depth_m: '3' },
    ])

    const { bands } = buildProfile(withGap, 'depth_m', scheme, null)

    expect(bands.map((band) => [band.start, band.end])).toEqual([
      [0, 0],
      [2, 2],
    ])
  })

  it('drops a run too thin to see once a long series is drawn', () => {
    const many = features(
      Array.from({ length: 2000 }, (_, i) => ({
        depth_m: String(i),
        campaign: i === 1000 ? 'B' : 'A',
      })),
    )
    const scheme = buildColorScheme(many, 'campaign')
    if (scheme?.kind !== 'categorical') throw new Error('expected a categorical scheme')

    const { bands } = buildProfile(many, 'depth_m', scheme, null)

    expect(bands.every((band) => band.label === 'A')).toBe(true)
  })

  it('copes with a layer of many points without overflowing the call stack', () => {
    const many = features(Array.from({ length: 300_000 }, (_, i) => ({ depth_m: String(i) })))

    expect(buildProfile(many, 'depth_m', null, null).extent).toEqual([0, 299_999])
  })
})
