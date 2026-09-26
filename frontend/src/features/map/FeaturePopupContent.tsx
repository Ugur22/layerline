import { propertyText } from './layerStyle'

export function FeaturePopupContent({ properties }: { properties: Record<string, unknown> }) {
  const entries = Object.entries(properties)
  if (entries.length === 0) return <p className="text-xs">This point has no properties.</p>

  return (
    <dl className="grid max-w-64 grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-muted-foreground">{key}</dt>
          <dd className="break-words font-medium">{propertyText(value)}</dd>
        </div>
      ))}
    </dl>
  )
}
