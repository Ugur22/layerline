import { lazy, Suspense } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useImportSession } from '@/features/imports/importSession'
import { useImportJob } from '@/features/imports/useImportJob'
import { useMapLayer } from './useMapLayer'

// MapLibre is large and only needed after an import succeeds, so it stays out of the first load.
const LayerMap = lazy(() => import('./LayerMap').then((m) => ({ default: m.LayerMap })))

export function MapPanel({ pollIntervalMs = 1000 }: { pollIntervalMs?: number }) {
  const jobId = useImportSession((state) => state.jobId)
  const layerId = useImportJob(jobId, pollIntervalMs).data?.map_layer_id
  const layer = useMapLayer(layerId)

  // The map only exists once an import has produced a layer.
  if (!layerId) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {layer.data
            ? `${layer.data.map_layer.name} · ${String(layer.data.map_layer.feature_count)} points`
            : 'Map'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {layer.isPending && <p className="text-sm text-muted-foreground">Loading map layer…</p>}
        {layer.isError && (
          <Alert variant="destructive">
            <AlertDescription>Could not load the map layer: {layer.error.message}</AlertDescription>
          </Alert>
        )}
        {layer.data && (
          <div className="h-96 overflow-hidden rounded-lg border">
            <Suspense fallback={<p className="p-4 text-sm">Loading map…</p>}>
              <LayerMap layer={layer.data} />
            </Suspense>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
