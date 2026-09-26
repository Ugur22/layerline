import { propertyText } from './layerStyle'

const TOOLTIP_ROWS = 3

// Short on purpose: it follows the pointer, so the full list stays in the inspector.
export function FeatureTooltipContent({ properties }: { properties: Record<string, unknown> }) {
  const title =
    typeof properties.name === 'string' && properties.name !== '' ? properties.name : null
  const rows = Object.entries(properties)
    .filter(([key]) => !(title !== null && key === 'name'))
    .slice(0, TOOLTIP_ROWS)
  if (title === null && rows.length === 0) {
    return <p className="text-xs">This point has no properties.</p>
  }

  return (
    <div className="flex max-w-56 flex-col gap-1 text-xs">
      {title !== null && <p className="font-semibold">{title}</p>}
      {rows.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          {rows.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-muted-foreground">{key}</dt>
              <dd className="break-words font-medium">{propertyText(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
