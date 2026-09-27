import { describe, expect, it } from 'vitest'
import type { LngLatBounds } from './bounds'
import { calloutPlacement } from './calloutPlacement'

const bounds: LngLatBounds = [
  [3, 52],
  [5, 54],
]

describe('calloutPlacement', () => {
  it('places a callout above its point away from the top edge', () => {
    expect(calloutPlacement(52.5, bounds)).toBe('above')
  })

  it('places a callout below its point near the top edge, clear of the toolbar there', () => {
    expect(calloutPlacement(53.9, bounds)).toBe('below')
  })

  it('places a callout above when there are no bounds to compare against', () => {
    expect(calloutPlacement(52.5, null)).toBe('above')
  })

  it('places a callout above when every point sits at the same latitude', () => {
    expect(
      calloutPlacement(52, [
        [3, 52],
        [5, 52],
      ]),
    ).toBe('above')
  })
})
