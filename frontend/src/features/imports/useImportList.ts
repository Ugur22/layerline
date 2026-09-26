import { useInfiniteQuery } from '@tanstack/react-query'
import { listImports } from '@/api/imports'
import type { ImportStatus } from '@/api/types'

const TERMINAL: readonly ImportStatus[] = ['succeeded', 'failed']

export function useImportList(datasetId: string, pollIntervalMs: number) {
  return useInfiniteQuery({
    queryKey: ['imports', datasetId],
    queryFn: ({ pageParam }) => listImports(datasetId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
    // Keep refreshing only while a listed job can still change, so finished imports cost nothing.
    refetchInterval: (query) => {
      const jobs = query.state.data?.pages.flatMap((page) => page.import_jobs) ?? []
      return jobs.some((job) => !TERMINAL.includes(job.status)) ? pollIntervalMs : false
    },
  })
}
