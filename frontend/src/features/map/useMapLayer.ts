import { useQuery } from '@tanstack/react-query'
import { getMapLayer } from '@/api/imports'

export function useMapLayer(mapLayerId: string | null | undefined) {
  return useQuery({
    queryKey: ['map-layer', mapLayerId],
    queryFn: () => getMapLayer(mapLayerId as string),
    enabled: Boolean(mapLayerId),
  })
}
