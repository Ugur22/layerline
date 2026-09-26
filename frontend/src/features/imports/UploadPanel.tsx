import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { uploadImport } from '@/api/imports'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DEV_DATASET_ID } from '@/config'
import { ImportResult } from './ImportResult'
import { useImportSession } from './importSession'
import { useImportJob } from './useImportJob'

export function UploadPanel({ pollIntervalMs = 1000 }: { pollIntervalMs?: number }) {
  const [file, setFile] = useState<File | null>(null)
  const { jobId, setJobId } = useImportSession()
  const queryClient = useQueryClient()
  const job = useImportJob(jobId, pollIntervalMs)
  const upload = useMutation({
    mutationFn: (selected: File) => uploadImport(DEV_DATASET_ID, selected),
    onSuccess: (created) => {
      setJobId(created.id)
      void queryClient.invalidateQueries({ queryKey: ['imports', DEV_DATASET_ID] })
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload survey data</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Survey data file (GeoJSON or CSV)
          <input
            type="file"
            accept=".geojson,.json,.csv"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null)
            }}
          />
        </label>
        <Button
          disabled={file === null || upload.isPending}
          onClick={() => {
            if (file) upload.mutate(file)
          }}
        >
          {upload.isPending ? 'Uploading…' : 'Upload'}
        </Button>

        {upload.isError && (
          <Alert variant="destructive">
            <AlertDescription>{upload.error.message}</AlertDescription>
          </Alert>
        )}
        {job.isError && (
          <Alert variant="destructive">
            <AlertDescription>Could not load the import status. Retrying…</AlertDescription>
          </Alert>
        )}
        {job.data && <ImportResult job={job.data} />}
      </CardContent>
    </Card>
  )
}
