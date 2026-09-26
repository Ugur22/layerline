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

interface ColorLegendProps {
  scheme: DrawableColorScheme
  hidden: readonly string[]
  onToggle: (value: string) => void
}

function LegendRow({
  color,
  label,
  count,
  muted,
  hidden,
  onToggle,
}: {
  color: string
  label: string
  count: number
  muted?: boolean
  hidden: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={!hidden}
      onClick={onToggle}
      className={`flex items-center gap-2 rounded-md px-1 py-0.5 text-left transition-opacity hover:bg-muted ${hidden ? 'opacity-40' : ''} ${muted ? 'text-muted-foreground' : ''}`}
    >
      <Swatch color={color} />
      <span className="flex-1 truncate">{label}</span>
      <span className="tabular-nums text-muted-foreground">{count}</span>
    </button>
  )
}

export function ColorLegend({ scheme, hidden, onToggle }: ColorLegendProps) {
  return (
    <div
      role="group"
      aria-label={`Legend for ${scheme.key}`}
      className={`${scheme.kind === 'categorical' ? 'pointer-events-auto' : ''} flex max-w-56 flex-col gap-1 rounded-lg bg-background/95 p-2 text-xs shadow-sm ring-1 ring-border`}
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{scheme.key}</span>
        {scheme.kind === 'categorical' && (
          <span className="text-muted-foreground">click to hide</span>
        )}
      </span>
      {scheme.kind === 'numeric' ? (
        <>
          {scheme.min === scheme.max ? (
            <span className="flex items-center gap-2">
              <Swatch color={NUMERIC_RAMP[1]} />
              {formatNumber(scheme.min)}
            </span>
          ) : (
            <div className="flex flex-col gap-0.5">
              <div
                aria-hidden
                className="h-2.5 w-40 rounded-sm"
                style={{
                  backgroundImage: `linear-gradient(to right, ${NUMERIC_RAMP.join(', ')})`,
                }}
              />
              <div className="flex justify-between">
                <span>{formatNumber(scheme.min)}</span>
                <span>{formatNumber(scheme.max)}</span>
              </div>
            </div>
          )}
          {scheme.hasMissing && (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Swatch color={MISSING_COLOR} />
              No value
            </span>
          )}
        </>
      ) : (
        <>
          {scheme.entries.map((entry) => (
            <LegendRow
              key={entry.value}
              color={entry.color}
              label={entry.value}
              count={entry.count}
              hidden={hidden.includes(entry.value)}
              onToggle={() => {
                onToggle(entry.value)
              }}
            />
          ))}
          {scheme.hasMissing && (
            <LegendRow
              color={MISSING_COLOR}
              label="No value"
              count={scheme.missingCount}
              muted
              hidden={hidden.includes('')}
              onToggle={() => {
                onToggle('')
              }}
            />
          )}
        </>
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
