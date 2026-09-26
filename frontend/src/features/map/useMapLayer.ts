import { useQuery } from '@tanstack/react-query'
import { getMapLayer } from '@/api/imports'
import type { LayerFilter } from '@/api/types'

export function useMapLayer(mapLayerId: string | null | undefined, filter: LayerFilter | null) {
  return useQuery({
    queryKey: ['map-layer', mapLayerId, filter?.property ?? null, filter?.value ?? null],
    queryFn: () => getMapLayer(mapLayerId as string, filter),
    enabled: Boolean(mapLayerId),
    // Keep the old points on screen while a new filter loads, but never another layer's points.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === mapLayerId ? previous : undefined,
  })
}
