import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, UploadCloud, X } from 'lucide-react'
import { useRef, useState, type DragEvent } from 'react'
import { uploadImport } from '@/api/imports'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DEV_DATASET_ID } from '@/config'
import { cn } from 'cn'
import { ImportResult } from './ImportResult'
import { useImportSession } from './importSession'
import { useImportJob } from './useImportJob'

const ACCEPTED_EXTENSIONS = ['.geojson', '.json', '.csv']

// The server stays the authority on file type; this only spares a round trip for an obvious mistake.
function hasAcceptedExtension(name: string) {
  const lower = name.toLowerCase()
  return ACCEPTED_EXTENSIONS.some((extension) => lower.endsWith(extension))
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${String(bytes)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function UploadPanel({ pollIntervalMs = 1000 }: { pollIntervalMs?: number }) {
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [rejection, setRejection] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
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

  function selectFile(candidate: File) {
    if (!hasAcceptedExtension(candidate.name)) {
      setRejection(`${candidate.name} is not supported. Upload a GeoJSON or CSV file.`)
      return
    }
    setRejection(null)
    setFile(candidate)
  }

  function clearFile() {
    setFile(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault()
    setDragging(true)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload survey data</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <label
          data-testid="dropzone"
          data-dragging={dragging}
          onDragEnter={handleDragOver}
          onDragOver={handleDragOver}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null))
              setDragging(false)
          }}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            const dropped = event.dataTransfer.files[0]
            if (dropped) selectFile(dropped)
          }}
          className={cn(
            'flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm transition-colors',
            'hover:bg-muted has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50',
            dragging ? 'border-primary bg-muted' : 'border-border',
          )}
        >
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            aria-label="Survey data file (GeoJSON or CSV)"
            accept={ACCEPTED_EXTENSIONS.join(',')}
            onChange={(event) => {
              const chosen = event.target.files?.[0]
              if (chosen) selectFile(chosen)
            }}
          />
          <UploadCloud aria-hidden className="size-6 text-muted-foreground" />
          <span>
            Drag a file here or <span className="font-medium text-primary underline">browse</span>
          </span>
          <span className="text-xs text-muted-foreground">GeoJSON or CSV</span>
        </label>
        {rejection && (
          <Alert variant="destructive">
            <AlertDescription>{rejection}</AlertDescription>
          </Alert>
        )}
        {file && (
          <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            <FileText aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{file.name}</span>
            <span className="text-xs text-muted-foreground">{formatSize(file.size)}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Remove selected file"
              onClick={clearFile}
            >
              <X aria-hidden />
            </Button>
          </div>
        )}
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
