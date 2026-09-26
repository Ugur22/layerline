import type { PointFeatureCollection } from '@/api/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { propertyText } from './layerStyle'
import { useMapInspection } from './mapInspection'

export function PointInspector({ features }: { features: PointFeatureCollection }) {
  const hover = useMapInspection((state) => state.hover)
  const pinned = useMapInspection((state) => state.pinned)
  const shownPinned = pinned?.data === features ? pinned : null
  // Pointing at the pinned point itself is not a preview of some other point.
  const shownHover =
    hover?.data === features &&
    !(
      shownPinned?.coordinates[0] === hover.coordinates[0] &&
      shownPinned.coordinates[1] === hover.coordinates[1]
    )
      ? hover
      : null
  // Hovering previews another point without losing the pinned one, which returns afterwards.
  const point = shownHover ?? shownPinned

  const name =
    point && typeof point.properties.name === 'string' && point.properties.name !== ''
      ? point.properties.name
      : null
  const rows = point
    ? Object.entries(point.properties).filter(([key]) => !(name !== null && key === 'name'))
    : []

  return (
    <Card size="sm" role="region" aria-label="Point inspector">
      <CardHeader>
        <CardTitle>{shownHover ? 'Hovering' : shownPinned ? 'Pinned point' : 'Point'}</CardTitle>
      </CardHeader>
      <CardContent>
        {!point ? (
          <p className="text-sm text-muted-foreground">
            Hover a point on the map to inspect it. Click it to pin it here.
          </p>
        ) : (
          <div className="flex flex-col gap-2 text-sm">
            {name !== null && <p className="font-semibold">{name}</p>}
            {Object.keys(point.properties).length === 0 && (
              <p className="text-muted-foreground">This point has no properties.</p>
            )}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {rows.map(([key, value]) => (
                <div key={key} className="contents">
                  <dt className="text-muted-foreground">{key}</dt>
                  <dd className="break-words font-medium">{propertyText(value)}</dd>
                </div>
              ))}
              <dt className="text-muted-foreground">Coordinates</dt>
              <dd className="font-medium tabular-nums">
                {point.coordinates[1].toFixed(5)}, {point.coordinates[0].toFixed(5)}
              </dd>
            </dl>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
