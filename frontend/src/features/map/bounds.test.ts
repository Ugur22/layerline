import { describe, expect, it } from 'vitest'
import { boundsFor } from './bounds'

const layer = { id: 'l', dataset_id: 'd', name: 'n', geometry_type: 'Point', feature_count: 2 }

describe('boundsFor', () => {
  it('converts [w, s, e, n] into MapLibre corner pairs', () => {
    expect(boundsFor({ ...layer, bbox: [4.9, 52.37, 4.95, 52.4] })).toEqual([
      [4.9, 52.37],
      [4.95, 52.4],
    ])
  })

  it('returns null for a layer without features', () => {
    expect(boundsFor({ ...layer, bbox: null })).toBeNull()
  })
})
