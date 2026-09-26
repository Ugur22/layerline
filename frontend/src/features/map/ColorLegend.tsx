import {
  MAX_RADIUS,
  MIN_RADIUS,
  MISSING_COLOR,
  NUMERIC_RAMP,
  type DrawableColorScheme,
  type SizeScale,
} from './layerStyle'

function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block size-3 shrink-0 rounded-full border border-white shadow-[0_0_0_1px_rgb(0_0_0/0.25)]"
      style={{ backgroundColor: color }}
    />
  )
}

// Ticks like 8.6 or 1200, not 8.600000000000001.
function formatNumber(value: number) {
  return String(Number(value.toPrecision(4)))
}

export function ColorLegend({ scheme }: { scheme: DrawableColorScheme }) {
  return (
    <div
      role="group"
      aria-label={`Legend for ${scheme.key}`}
      className="flex max-w-56 flex-col gap-1 rounded-lg bg-background/95 p-2 text-xs shadow-sm ring-1 ring-border"
    >
      <span className="font-medium">{scheme.key}</span>
      {scheme.kind === 'numeric' ? (
        scheme.min === scheme.max ? (
          <span className="flex items-center gap-2">
            <Swatch color={NUMERIC_RAMP[1]} />
            {formatNumber(scheme.min)}
          </span>
        ) : (
          <div className="flex flex-col gap-0.5">
            <div
              aria-hidden
              className="h-2.5 w-40 rounded-sm"
              style={{ backgroundImage: `linear-gradient(to right, ${NUMERIC_RAMP.join(', ')})` }}
            />
            <div className="flex justify-between">
              <span>{formatNumber(scheme.min)}</span>
              <span>{formatNumber(scheme.max)}</span>
            </div>
          </div>
        )
      ) : (
        <>
          {scheme.entries.map((entry) => (
            <span key={entry.value} className="flex items-center gap-2">
              <Swatch color={entry.color} />
              <span className="truncate">{entry.value}</span>
            </span>
          ))}
        </>
      )}
      {scheme.hasMissing && (
        <span className="flex items-center gap-2 text-muted-foreground">
          <Swatch color={MISSING_COLOR} />
          No value
        </span>
      )}
    </div>
  )
}

function SizeDot({ radius }: { radius: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full border border-foreground/60"
      style={{ width: radius * 2, height: radius * 2 }}
    />
  )
}

export function SizeLegend({ scale }: { scale: SizeScale }) {
  return (
    <div
      role="group"
      aria-label={`Size legend for ${scale.key}`}
      className="flex max-w-56 flex-col gap-1 rounded-lg bg-background/95 p-2 text-xs shadow-sm ring-1 ring-border"
    >
      <span className="font-medium">Size: {scale.key}</span>
      {scale.min === scale.max ? (
        <span>{formatNumber(scale.min)}</span>
      ) : (
        <div className="flex items-end gap-3">
          <span className="flex items-center gap-1.5">
            <SizeDot radius={MIN_RADIUS} />
            {formatNumber(scale.min)}
          </span>
          <span className="flex items-center gap-1.5">
            <SizeDot radius={MAX_RADIUS} />
            {formatNumber(scale.max)}
          </span>
        </div>
      )}
      {scale.hasMissing && (
        <span className="flex items-center gap-2 text-muted-foreground">
          <SizeDot radius={MIN_RADIUS} />
          No value
        </span>
      )}
    </div>
  )
}
