import { useQuery } from '@tanstack/react-query'
import { getImport } from '@/api/imports'
import type { ImportStatus } from '@/api/types'

const TERMINAL: readonly ImportStatus[] = ['succeeded', 'failed']

export function useImportJob(jobId: string | null, pollIntervalMs: number) {
  return useQuery({
    queryKey: ['import', jobId],
    queryFn: () => getImport(jobId as string),
    enabled: jobId !== null,
    // Stop polling on a terminal status: those never change (docs/domain.md).
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status && TERMINAL.includes(status) ? false : pollIntervalMs
    },
  })
}
