import { lazy, Suspense } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useImportSession } from '@/features/imports/importSession'
import { useImportJob } from '@/features/imports/useImportJob'
import { FilterBar } from './FilterBar'
import { useMapLayer } from './useMapLayer'

// MapLibre is large and only needed after an import succeeds, so it stays out of the first load.
const LayerMap = lazy(() => import('./LayerMap').then((m) => ({ default: m.LayerMap })))

export function MapPanel({ pollIntervalMs = 1000 }: { pollIntervalMs?: number }) {
  const { jobId, filter, setFilter } = useImportSession()
  const layerId = useImportJob(jobId, pollIntervalMs).data?.map_layer_id
  const layer = useMapLayer(layerId, filter)

  // The map only exists once an import has produced a layer.
  if (!layerId) return null

  const total = layer.data?.map_layer.feature_count
  const shown = layer.data?.features.features.length
  const title = layer.data
    ? filter
      ? `${layer.data.map_layer.name} · showing ${String(shown)} of ${String(total)} points`
      : `${layer.data.map_layer.name} · ${String(total)} points`
    : 'Map'

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {layer.isPending && <p className="text-sm text-muted-foreground">Loading map layer…</p>}
        {layer.isError && (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-col items-start gap-2">
              Could not load the map layer: {layer.error.message}
              {/* Without data there is no filter bar, so a failing filter needs its own way out. */}
              {filter && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setFilter(null)
                  }}
                >
                  Clear filter
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
        {layer.data && (
          <>
            <FilterBar
              key={layer.data.map_layer.id}
              propertyKeys={layer.data.map_layer.property_keys}
            />
            <div className="h-[min(70vh,48rem)] min-h-96 overflow-hidden rounded-lg border">
              <Suspense fallback={<p className="p-4 text-sm">Loading map…</p>}>
                {/* A new layer must refit the view and reset readiness, so it remounts the map. */}
                <LayerMap key={layer.data.map_layer.id} layer={layer.data} />
              </Suspense>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
