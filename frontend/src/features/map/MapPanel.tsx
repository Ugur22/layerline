import { lazy, Suspense } from 'react'
import { match } from 'ts-pattern'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useImportSession } from '@/features/imports/importSession'
import { useImportJob } from '@/features/imports/useImportJob'
import { FilterBar } from './FilterBar'
import { PointInspector } from './PointInspector'
import { StoryPanel } from './StoryPanel'
import { useMapLayer } from './useMapLayer'

// MapLibre is large and only needed after an import succeeds, so it stays out of the first load.
const LayerMap = lazy(() => import('./LayerMap').then((m) => ({ default: m.LayerMap })))

export function MapPanel({ pollIntervalMs = 1000 }: { pollIntervalMs?: number }) {
  const { jobId, filter, setFilter } = useImportSession()
  const job = useImportJob(jobId, pollIntervalMs)
  const layerId = job.data?.map_layer_id
  const layer = useMapLayer(layerId, filter)
  // Same query as `layer` while no filter is set; otherwise one extra fetch so colours stay stable.
  const fullLayer = useMapLayer(layerId, null)

  // The map only exists once an import has produced a layer; guide toward one instead of a blank
  // panel. ImportsList auto-selects the most recent succeeded import, so landing here with nothing
  // selected means there genuinely isn't one yet (no imports, or none has finished processing).
  if (!layerId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Map</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="flex min-h-96 items-center justify-center p-8 text-center text-sm text-muted-foreground">
            {match(job.data?.status)
              .with(
                'queued',
                'processing',
                () => 'Importing your file — its map will appear here once it finishes.',
              )
              .with(
                'failed',
                () =>
                  'This import failed. Choose another import on the left, or fix and re-upload the file.',
              )
              .otherwise(
                () =>
                  'Select an import on the left to view its map, or upload a survey file to get started.',
              )}
          </p>
        </CardContent>
      </Card>
    )
  }

  const total = layer.data?.map_layer.feature_count
  const shown = layer.data?.features.features.length
  const title = layer.data
    ? filter
      ? `${layer.data.map_layer.name} · showing ${String(shown)} of ${String(total)} points`
      : `${layer.data.map_layer.name} · ${String(total)} points`
    : 'Map'

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
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
              <Suspense
                fallback={<p className="min-h-96 rounded-lg border p-4 text-sm">Loading map…</p>}
              >
                {/* A new layer must refit the view and reset readiness, so it remounts the map. */}
                <LayerMap
                  key={layer.data.map_layer.id}
                  layer={layer.data}
                  styleFeatures={fullLayer.data?.features.features}
                />
              </Suspense>
            </>
          )}
        </CardContent>
      </Card>
      {layer.data && (
        <div className="flex flex-col gap-4">
          {fullLayer.data && (
            <StoryPanel
              key={layer.data.map_layer.id}
              features={fullLayer.data.features.features}
              propertyKeys={fullLayer.data.map_layer.property_keys}
            />
          )}
          <PointInspector features={layer.data.features} />
        </div>
      )}
    </div>
  )
}
