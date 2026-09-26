import { match } from 'ts-pattern'
import type { ImportJob } from '@/api/types'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  const jobs = list.data?.pages.flatMap((page) => page.import_jobs) ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle>Imports</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
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
