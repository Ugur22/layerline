import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { match } from 'ts-pattern'
import { clearImports } from '@/api/imports'
import type { ImportJob } from '@/api/types'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DEV_DATASET_ID } from '@/config'
import { useImportSession } from './importSession'
import { useImportList } from './useImportList'

function StatusBadge({ status }: { status: ImportJob['status'] }) {
  return match(status)
    .with('succeeded', () => <Badge>Succeeded</Badge>)
    .with('failed', () => <Badge variant="destructive">Failed</Badge>)
    .with('queued', () => <Badge variant="secondary">Queued</Badge>)
    .with('processing', () => <Badge variant="secondary">Processing</Badge>)
    .exhaustive(() => <Badge variant="secondary">Unknown</Badge>)
}

export function ImportsList({ pollIntervalMs = 1000 }: { pollIntervalMs?: number }) {
  const { jobId, setJobId } = useImportSession()
  const list = useImportList(DEV_DATASET_ID, pollIntervalMs)
  const jobs = useMemo(
    () => list.data?.pages.flatMap((page) => page.import_jobs) ?? [],
    [list.data],
  )
  const queryClient = useQueryClient()

  // Land on the most recent usable map rather than a blank map panel — including the case where
  // the only imports so far are still processing, once one of them succeeds. Fires at most once:
  // a null jobId after that (e.g. from "Clear imports") means there is nothing to select, not
  // "pick again", so it must not fight a deliberate clear.
  const autoSelected = useRef(false)
  useEffect(() => {
    if (autoSelected.current || jobId !== null || !list.isSuccess) return
    const mostRecent = jobs.find((candidate) => candidate.status === 'succeeded')
    if (mostRecent) {
      autoSelected.current = true
      setJobId(mostRecent.id)
    }
  }, [jobId, jobs, list.isSuccess, setJobId])

  const [confirming, setConfirming] = useState(false)
  const clear = useMutation({
    mutationFn: () => clearImports(DEV_DATASET_ID),
    onSuccess: async () => {
      // The selected import may be gone, and a request for it would only 404. Mark this null as
      // deliberate before the list refetches: while it's still in flight, `jobs` is briefly the
      // stale pre-delete list, and auto-select would otherwise re-select from it before the
      // response arrives.
      autoSelected.current = true
      setJobId(null)
      setConfirming(false)
      await queryClient.invalidateQueries({ queryKey: ['imports', DEV_DATASET_ID] })
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Imports</CardTitle>
        {jobs.length > 0 && !confirming && (
          <CardAction>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                clear.reset()
                setConfirming(true)
              }}
            >
              Clear imports
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {confirming && (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-col items-start gap-2">
              Permanently delete all finished imports and their map layers? This cannot be undone.
              Imports that are still processing are kept.
              <span className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={clear.isPending}
                  onClick={() => {
                    clear.mutate()
                  }}
                >
                  {clear.isPending ? 'Deleting…' : 'Delete'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={clear.isPending}
                  onClick={() => {
                    setConfirming(false)
                  }}
                >
                  Cancel
                </Button>
              </span>
            </AlertDescription>
          </Alert>
        )}
        {clear.isError && (
          <Alert variant="destructive">
            <AlertDescription>{clear.error.message}</AlertDescription>
          </Alert>
        )}
        {list.isPending && <p className="text-sm text-muted-foreground">Loading imports…</p>}
        {list.isError && (
          <Alert variant="destructive">
            <AlertDescription>Could not load imports: {list.error.message}</AlertDescription>
          </Alert>
        )}
        {list.isSuccess && jobs.length === 0 && (
          <p className="text-sm text-muted-foreground">No imports yet. Upload a file to start.</p>
        )}
        <ul className="flex flex-col gap-1">
          {jobs.map((job) => (
            <li key={job.id}>
              <button
                type="button"
                aria-pressed={job.id === jobId}
                onClick={() => {
                  setJobId(job.id)
                }}
                className="flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted aria-pressed:border-primary"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{job.original_filename}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(job.created_at).toLocaleString()}
                    {job.feature_count !== null && ` · ${String(job.feature_count)} points`}
                  </span>
                </span>
                <StatusBadge status={job.status} />
              </button>
            </li>
          ))}
        </ul>
        {list.hasNextPage && (
          <Button
            variant="outline"
            disabled={list.isFetchingNextPage}
            onClick={() => {
              void list.fetchNextPage()
            }}
          >
            {list.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
