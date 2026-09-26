import { match, P } from 'ts-pattern'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import type { ImportIssue, ImportJob } from '@/api/types'

function issueLabel(location: ImportIssue['location']): string {
  return match(location)
    .with(
      { feature_index: P.number },
      ({ feature_index }) => `Feature ${String(feature_index + 1)}`,
    )
    .with({ row: P.number }, ({ row }) => `Row ${String(row)}`)
    .otherwise(() => 'File')
}

export function ImportResult({ job }: { job: ImportJob }) {
  return (
    match(job.status)
      .with('queued', () => <Badge variant="secondary">Queued</Badge>)
      .with('processing', () => <Badge variant="secondary">Processing…</Badge>)
      .with('succeeded', () => (
        <Alert>
          <AlertTitle>Import succeeded</AlertTitle>
          <AlertDescription>
            {job.feature_count} features imported into map layer {job.map_layer_id}.
          </AlertDescription>
        </Alert>
      ))
      .with('failed', () => (
        <Alert variant="destructive">
          <AlertTitle>Import failed. No features were saved.</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {job.errors.map((issue, i) => (
                <li key={i}>
                  {issueLabel(issue.location)}: {issue.message}{' '}
                  <span className="text-xs opacity-70">({issue.code})</span>
                </li>
              ))}
            </ul>
            {job.errors_truncated && <p className="mt-2">More errors were found than are shown.</p>}
          </AlertDescription>
        </Alert>
      ))
      // The compile-time check catches a missing known status; the fallback keeps the page alive if
      // a newer API sends a status this client has not learned yet.
      .exhaustive(() => <Badge variant="secondary">Unknown status</Badge>)
  )
}
