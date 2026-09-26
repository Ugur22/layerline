import { describe, expect, it } from 'vitest'
import type { PointFeature } from '@/api/types'
import { buildStory } from './buildStory'

function features(
  rows: Record<string, unknown>[],
  coordinates = (i: number) => [4 + i / 10, 52],
): PointFeature[] {
  return rows.map((properties, index) => ({
    type: 'Feature' as const,
    id: String(index),
    geometry: { type: 'Point' as const, coordinates: coordinates(index) },
    properties,
  }))
}

// samples/north-sea-survey.csv, the file the design was drawn from: the story has to say the true
// things about it.
const SAMPLE_CSV = `name,lat,lon,type,depth_m,campaign
S-001,52.4494,4.3651,buoy,8.6,A
S-002,52.4626,4.3703,mooring,8.4,A
S-003,52.4899,4.3341,sensor,8.1,A
S-004,52.5406,4.257,drifter,9.3,A
S-005,52.5683,4.2994,buoy,10.4,A
S-006,52.5844,4.2461,mooring,14.7,A
S-007,52.6339,4.1897,sensor,15.8,A
S-008,52.6302,4.2025,drifter,14.0,A
S-009,52.6643,4.0951,buoy,15.0,A
S-010,52.7328,4.0681,mooring,17.1,A
S-011,52.7504,4.0539,sensor,17.9,A
S-012,52.744,3.9893,drifter,17.5,A
S-013,52.8093,3.9928,buoy,18.9,A
S-014,52.8318,3.962,mooring,19.9,A
S-015,52.8725,3.9532,sensor,20.6,A
S-016,52.8875,3.9025,drifter,24.1,A
S-017,52.925,3.8455,buoy,25.5,A
S-018,52.9166,3.8251,mooring,25.6,A
S-019,52.9468,3.7989,sensor,23.7,A
S-020,53.006,3.7931,drifter,26.8,A
S-021,53.0466,3.7147,buoy,28.3,A
S-022,53.058,3.708,mooring,28.3,A
S-023,53.1009,3.7111,sensor,29.3,B
S-024,53.1186,3.5894,drifter,31.2,B
S-025,53.1458,3.6493,buoy,32.7,B
S-026,53.1522,3.5552,mooring,33.0,B
S-027,53.1647,3.5295,sensor,32.0,B
S-028,53.1986,3.4559,drifter,35.4,B
S-029,53.2275,3.4414,buoy,34.8,B
S-030,53.3002,3.3914,mooring,36.1,B
S-031,53.3091,3.4383,sensor,38.5,B
S-032,53.3562,3.3445,drifter,37.9,B
S-033,53.3541,3.3718,buoy,41.0,B
S-034,53.3698,3.2676,mooring,39.1,B
S-035,53.403,3.2652,sensor,41.5,B
S-036,53.4329,3.1837,drifter,41.8,B
S-037,53.4675,3.2066,buoy,44.9,B
S-038,53.515,3.1682,mooring,44.5,B
S-039,53.5424,3.0887,sensor,46.6,B
S-040,53.5768,3.1375,drifter,47.2,B`

function sample(): { features: PointFeature[]; keys: string[] } {
  const [header = '', ...lines] = SAMPLE_CSV.split('\n')
  const columns = header.split(',')
  const rows = lines.map((line) => {
    const cells = line.split(',')
    return Object.fromEntries(columns.map((column, index) => [column, cells[index] ?? '']))
  })
  const list = features(
    rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).filter(([column]) => column !== 'lat' && column !== 'lon'),
      ),
    ),
    (i) => [Number(rows[i]?.lon), Number(rows[i]?.lat)],
  )
  return { features: list, keys: ['campaign', 'depth_m', 'name', 'type'] }
}

const chapter = (chapters: ReturnType<typeof buildStory>, id: string) => {
  const found = chapters.find((item) => item.id === id)
  if (!found) throw new Error(`no chapter ${id}`)
  return found
}

describe('buildStory on the north sea sample', () => {
  const { features: list, keys } = sample()
  const story = buildStory(list, keys)

  it('tells the overview, then what each informative property shows', () => {
    expect(story.map((item) => item.id)).toEqual(['overview', 'campaign', 'depth_m', 'type'])
  })

  it('describes the layer as a whole', () => {
    const overview = chapter(story, 'overview')

    expect(overview.title).toBe('40 points in file order')
    expect(overview.body).toContain('S-001')
    expect(overview.body).toContain('S-040')
    expect(overview.body).toContain('about 150 km')
    expect(overview.stats).toEqual([
      { value: '40', label: 'points' },
      { value: '≈150 km', label: 'first to last, straight line' },
      { value: '4', label: 'properties' },
    ])
    expect(overview.callouts).toEqual([
      { index: 0, text: 'Start · S-001' },
      { index: 39, text: 'End · S-040' },
    ])
    expect(overview.style).toEqual({ colorKey: '', sizeKey: '', profileKey: '', track: true })
  })

  it('says where depth is lowest and highest and how steadily it rises', () => {
    const depth = chapter(story, 'depth_m')

    expect(depth.title).toBe('depth_m: 8.1 to 47.2')
    expect(depth.body).toContain('8.1 (S-003)')
    expect(depth.body).toContain('47.2 (S-040)')
    expect(depth.body).toContain('range of 39.1')
    expect(depth.body).toContain('mostly rises')
    expect(depth.body).toContain('28 of 39 steps go up')
    expect(depth.callouts).toEqual([
      { index: 2, text: 'Lowest · 8.1' },
      { index: 39, text: 'Highest · 47.2' },
    ])
    expect(depth.style).toEqual({
      colorKey: 'depth_m',
      sizeKey: 'depth_m',
      profileKey: 'depth_m',
      track: true,
    })
  })

  it('finds that campaigns A and B are one stretch each, separated cleanly by depth', () => {
    const campaign = chapter(story, 'campaign')

    expect(campaign.body).toContain('A (points 1–22)')
    expect(campaign.body).toContain('B (points 23–40)')
    expect(campaign.body).toContain('depth_m separates them cleanly')
    expect(campaign.body).toContain('A 8.1–28.3')
    expect(campaign.body).toContain('B 29.3–47.2')
    expect(campaign.stats).toEqual([
      { value: '22', label: 'A' },
      { value: '18', label: 'B' },
    ])
    expect(campaign.callouts).toEqual([{ index: 22, text: 'A ends · B begins' }])
    expect(campaign.style).toEqual({
      colorKey: 'campaign',
      sizeKey: '',
      profileKey: 'depth_m',
      track: true,
    })
  })

  it('finds the instrument types repeating in a fixed order', () => {
    const type = chapter(story, 'type')

    expect(type.body).toContain(
      'repeat in a fixed order along the file: buoy, mooring, sensor, drifter',
    )
    expect(type.stats).toHaveLength(4)
    expect(type.stats.every((stat) => stat.value === '10')).toBe(true)
  })

  it('does not make a chapter of the name, which is different for every point', () => {
    expect(story.some((item) => item.id === 'name')).toBe(false)
  })
})

describe('buildStory in general', () => {
  it('has no story for an empty layer', () => {
    expect(buildStory([], ['a'])).toEqual([])
  })

  it('has only an overview for one point, and does not invent a span', () => {
    const story = buildStory(features([{ name: 'S-1', d: '5' }]), ['d', 'name'])

    expect(story.map((item) => item.id)).toEqual(['overview'])
    expect(story[0]?.title).toBe('1 point')
    expect(story[0]?.body).not.toContain('km')
    expect(story[0]?.callouts).toEqual([])
    expect(story[0]?.style.track).toBe(false)
  })

  it('has only an overview when there are no properties to look at', () => {
    const story = buildStory(features([{}, {}, {}]), [])

    expect(story.map((item) => item.id)).toEqual(['overview'])
  })

  it('labels a point without a name by its number', () => {
    const story = buildStory(features([{ d: '1' }, { d: '2' }, { d: '3' }]), ['d'])

    expect(story[0]?.body).toContain('#1')
    expect(story[0]?.body).toContain('#3')
  })

  it('reports a number that goes up and down as exactly that', () => {
    const story = buildStory(
      features([{ d: '1' }, { d: '5' }, { d: '2' }, { d: '6' }, { d: '3' }]),
      ['d'],
    )

    const body = chapter(story, 'd').body
    expect(body).toContain('goes up and down')
    expect(body).toContain('2 steps up, 2 down')
    expect(body).not.toContain('mostly')
  })

  it('says when values are missing, and steps across the gaps', () => {
    const story = buildStory(features([{ d: '1' }, {}, { d: '3' }, { d: '4' }]), ['d'])

    expect(chapter(story, 'd').body).toContain('1 point has no value')
  })

  it('reports a number that mostly falls', () => {
    const story = buildStory(
      features([{ d: '9' }, { d: '7' }, { d: '5' }, { d: '6' }, { d: '2' }]),
      ['d'],
    )

    expect(chapter(story, 'd').body).toContain('mostly falls')
    expect(chapter(story, 'd').body).toContain('3 of 4 steps go down')
  })

  it('leaves out a number that never changes', () => {
    const story = buildStory(features([{ d: '5' }, { d: '5' }, { d: '5' }]), ['d'])

    expect(story.map((item) => item.id)).toEqual(['overview'])
  })

  it('leaves out a category with too many values to be a group, and one with a single value', () => {
    const many = features(
      Array.from({ length: 30 }, (_, i) => ({ c: `v${String(i % 12)}`, one: 'same' })),
    )

    expect(buildStory(many, ['c', 'one']).map((item) => item.id)).toEqual(['overview'])
  })

  it('does not claim an order for values that are mixed along the file', () => {
    const story = buildStory(features(['a', 'b', 'b', 'a', 'a', 'b', 'a'].map((c) => ({ c }))), [
      'c',
    ])

    const body = chapter(story, 'c').body
    expect(body).not.toContain('one stretch')
    expect(body).not.toContain('fixed order')
  })

  it('chooses the most telling chapters, in order, when there are more than fit', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      a: String(i * 2),
      b: String(i * i),
      c: String(30 - i * i),
      d: String((i * 7) % 5),
      e: i < 6 ? 'x' : 'y',
    }))

    expect(buildStory(features(rows), ['a', 'b', 'c', 'd', 'e']).map((item) => item.id)).toEqual([
      'overview',
      'e',
      'b',
      'c',
    ])
  })

  it('keeps the story short: the overview and at most three more chapters', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      a: String(i),
      b: String(i * i),
      c: String(12 - i),
      d: String((i * 7) % 5),
      e: i < 6 ? 'x' : 'y',
    }))

    const story = buildStory(features(rows), ['a', 'b', 'c', 'd', 'e'])

    expect(story).toHaveLength(4)
    expect(story[0]?.id).toBe('overview')
  })

  it('only claims a clean separation when no two groups overlap', () => {
    const rows = [
      { g: 'A', n: '1' },
      { g: 'A', n: '9' },
      { g: 'B', n: '5' },
      { g: 'B', n: '12' },
    ]

    expect(chapter(buildStory(features(rows), ['g', 'n']), 'g').body).not.toContain('separates')
  })

  it('does not call a chapter a stretch when a value comes back later', () => {
    const rows = ['A', 'A', 'B', 'B', 'A'].map((g) => ({ g }))

    expect(chapter(buildStory(features(rows), ['g']), 'g').body).not.toContain('one stretch')
  })

  it('writes south and west coordinates as such for a single point', () => {
    const story = buildStory(
      features([{}], () => [-3.5, -10.25]),
      [],
    )

    expect(story[0]?.body).toContain('10.25° S, 3.5° W')
  })

  describe('what it will not claim', () => {
    it('makes no statement about the trend of a handful of points', () => {
      const body = chapter(buildStory(features([{ d: '1' }, { d: '9' }]), ['d']), 'd').body

      expect(body).not.toContain('mostly')
      expect(body).not.toContain('goes up and down')
    })

    it('says a number rises at every step when it does, not that it mostly does', () => {
      const body = chapter(
        buildStory(features([1, 2, 4, 7, 11].map((d) => ({ d: String(d) }))), ['d']),
        'd',
      ).body

      expect(body).toContain('rises at every step')
      expect(body).not.toContain('mostly')
    })

    it('says a nearly constant number barely changes, not that it goes up and down', () => {
      const body = chapter(
        buildStory(features([5.2, 5.2, 5.2, 5.2, 5.3].map((d) => ({ d: String(d) }))), ['d']),
        'd',
      ).body

      expect(body).toContain('barely changes')
      expect(body).not.toContain('goes up and down')
    })

    it('does not describe a number that only ever rises or stays flat as going up and down', () => {
      const body = chapter(
        buildStory(features([1, 1, 2, 2, 3, 3].map((d) => ({ d: String(d) }))), ['d']),
        'd',
      ).body

      expect(body).not.toContain('goes up and down')
    })

    it('names a shared lowest or highest value as shared, not as one point', () => {
      const rows = [5, 5, 9, 9, 7].map((d) => ({ d: String(d) }))

      const body = chapter(buildStory(features(rows), ['d']), 'd').body

      expect(body).toContain('5 (#1 and 1 more)')
      expect(body).toContain('9 (#3 and 1 more)')
    })

    it('does not make a chapter of a number that just counts along, like an id or a row number', () => {
      const rows = Array.from({ length: 10 }, (_, i) => ({
        id: String(i + 1),
        d: String((i * 7) % 5),
      }))

      expect(buildStory(features(rows), ['id', 'd']).map((item) => item.id)).not.toContain('id')
    })

    it('treats codes with leading zeros as categories, keeping the zeros', () => {
      const rows = Array.from({ length: 12 }, (_, i) => ({ code: i < 6 ? '007' : '012' }))

      const body = chapter(buildStory(features(rows), ['code']), 'code').body

      expect(body).toContain('007 (6 points)')
      expect(body).toContain('012 (6 points)')
    })

    it('treats a few whole-number values that repeat, like ratings, as categories', () => {
      const rows = Array.from({ length: 20 }, (_, i) => ({ rating: String((i % 5) + 1) }))

      const ids = buildStory(features(rows), ['rating']).map((item) => item.id)
      const chapterRating = chapter(buildStory(features(rows), ['rating']), 'rating')

      expect(ids).toContain('rating')
      expect(chapterRating.kicker).toBe('Category · rating')
      expect(chapterRating.body).toContain('There are 5 values')
    })

    it('does not call a separation clean when each group is a single value', () => {
      const rows = [
        { g: 'A', n: '1' },
        { g: 'A' },
        { g: 'B', n: '3' },
        { g: 'B' },
        { g: 'C', n: '5' },
        { g: 'C' },
      ]

      expect(chapter(buildStory(features(rows), ['g', 'n']), 'g').body).not.toContain('separates')
    })

    it('says how many points a separation leaves out for lack of a number', () => {
      const rows = [
        { g: 'A', n: '1' },
        { g: 'A', n: '2' },
        { g: 'A' },
        { g: 'B', n: '8' },
        { g: 'B', n: '9' },
        { g: 'B' },
      ]

      const body = chapter(buildStory(features(rows), ['g', 'n']), 'g').body

      expect(body).toContain('n separates them cleanly: A 1–2, then B 8–9')
      expect(body).toContain('2 points have no value for n')
    })

    it('does not treat the property used to name points as a group', () => {
      const rows = ['x', 'y', 'x', 'y', 'x', 'y'].map((name) => ({ name }))

      expect(buildStory(features(rows), ['name']).map((item) => item.id)).toEqual(['overview'])
    })

    it('says two points at the same place are less than a kilometre apart', () => {
      const story = buildStory(
        features([{}, {}], () => [4.5, 52.4]),
        [],
      )

      expect(story[0]?.body).toContain('less than 1 km apart')
      expect(story[0]?.body).not.toContain('about 0 km')
    })

    it('keeps the story about the data, not about what the screen will show', () => {
      const body =
        buildStory(
          features([{}, {}], (i) => [4 + i, 52]),
          [],
        )[0]?.body ?? ''

      expect(body).not.toContain('track')
    })

    it('does not invent a place for a point without coordinates', () => {
      const lone: PointFeature[] = [
        { type: 'Feature', id: '0', geometry: { type: 'Point', coordinates: [] }, properties: {} },
      ]

      expect(buildStory(lone, [])[0]?.body).not.toContain('0°')
    })

    it('counts singular and plural properly', () => {
      const story = buildStory(features([{ d: '1' }, {}, { d: '3' }, { d: '4' }, { d: '9' }]), [
        'd',
      ])

      expect(chapter(story, 'd').body).toContain('1 point has no value')
      expect(story[0]?.stats.at(-1)).toEqual({ value: '1', label: 'property' })
    })
  })

  it('builds the story of a large layer without stalling', () => {
    const rows = Array.from({ length: 100_000 }, (_, i) => ({
      group: i < 50_000 ? 'g0' : 'g1',
      kind: `k${String(i % 4)}`,
      depth: String(i / 100 + (i % 7)),
      other: String((i * 31) % 997),
    }))
    const started = performance.now()

    const story = buildStory(features(rows), ['group', 'kind', 'depth', 'other'])

    expect(story.length).toBeGreaterThan(1)
    expect(performance.now() - started).toBeLessThan(2000)
  })
})
