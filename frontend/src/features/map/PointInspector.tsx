import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { PointFeatureCollection } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { propertyText } from './layerStyle'
import { useMapInspection } from './mapInspection'
import { inspectedPointAt } from './pointLookup'

export function PointInspector({ features }: { features: PointFeatureCollection }) {
  const hover = useMapInspection((state) => state.hover)
  const pinned = useMapInspection((state) => state.pinned)
  const shownPinned = pinned?.data === features ? pinned : null
  // Pointing at the pinned point itself is not a preview of some other point.
  const shownHover = hover?.data === features && hover.index !== shownPinned?.index ? hover : null
  // Hovering previews another point without losing the pinned one, which returns afterwards.
  const point = shownHover ?? shownPinned

  const name =
    point && typeof point.properties.name === 'string' && point.properties.name !== ''
      ? point.properties.name
      : null
  const count = features.features.length
  const hiddenIndexes = useMapInspection((state) => state.hiddenIndexes)
  const setPinned = useMapInspection((state) => state.setPinned)
  // From nothing pinned, Next starts at the first point and Previous at the last. Points the
  // legend has dimmed are skipped, as they cannot be pointed at on the map either.
  const from = shownPinned?.index ?? null
  function target(direction: 1 | -1): number | null {
    let index = from === null ? (direction === 1 ? 0 : count - 1) : from + direction
    while (index >= 0 && index < count) {
      if (!hiddenIndexes.has(index)) return index
      index += direction
    }
    return null
  }
  const previous = target(-1)
  const next = target(1)
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
              <dt className="text-muted-foreground">Position</dt>
              <dd className="font-medium tabular-nums">
                {point.index + 1} of {count}
              </dd>
              <dt className="text-muted-foreground">Coordinates</dt>
              <dd className="font-medium tabular-nums">
                {point.coordinates[1].toFixed(5)}, {point.coordinates[0].toFixed(5)}
              </dd>
            </dl>
          </div>
        )}
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          {/* aria-disabled, not disabled: pressing Next at the end must not drop keyboard focus. */}
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous point"
            aria-disabled={previous === null}
            className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
            onClick={() => {
              if (previous !== null) setPinned(inspectedPointAt(features, previous))
            }}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next point"
            aria-disabled={next === null}
            className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
            onClick={() => {
              if (next !== null) setPinned(inspectedPointAt(features, next))
            }}
          >
            <ChevronRight />
          </Button>
          Step in file order
        </div>
      </CardContent>
    </Card>
  )
}
