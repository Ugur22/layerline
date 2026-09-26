import { useMemo, useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceArea,
  ReferenceLine,
  usePlotArea,
  XAxis,
  YAxis,
} from 'recharts'
import type { PointFeatureCollection } from '@/api/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'
import { ToggleControl } from './LayerControls'
import { type DrawableColorScheme } from './layerStyle'
import { useMapInspection } from './mapInspection'
import { inspectedPointAt } from './pointLookup'
import { indexAtX } from './profile'
import { PROFILE_MARGIN, PROFILE_Y_AXIS_WIDTH } from './profileLayout'
import { buildProfile } from './profileModel'

// Beyond this the dots would overlap into a smear, and the line says enough.
const MAX_DOTS = 120
const MIN_BAND_LABEL_WIDTH = 40
const Y_AXIS_WIDTH = PROFILE_Y_AXIS_WIDTH
const MARGIN = PROFILE_MARGIN
const CHART_CONFIG = { value: { color: 'var(--foreground)' } } satisfies ChartConfig

// Axis ticks are rounded to keep them short; a reading is shown as it is.
function formatTick(value: number): string {
  return String(Number(value.toPrecision(4)))
}

function formatReading(value: number | null): string {
  return value === null ? '—' : String(value)
}

interface ValueProfileProps {
  features: PointFeatureCollection
  // The numeric properties there are to choose from.
  keys: string[]
  valueKey: string
  onKeyChange: (key: string) => void
  // Colours the dots as the map colours its points; a categorical one also shades its stretches.
  scheme: DrawableColorScheme | null
}

// Where the label's shape is; Recharts hands it over as a union that also covers polar charts.
function boxOf(viewBox: unknown): { x: number; y: number; width: number } {
  const box = (viewBox ?? {}) as { x?: number; y?: number; width?: number }
  return { x: box.x ?? 0, y: box.y ?? 0, width: box.width ?? 0 }
}

// The chip that names the point at the cursor, kept inside the plot at either end.
function CursorChip({ viewBox, text }: { viewBox?: unknown; text: string }) {
  const plot = usePlotArea()
  const { x, y } = boxOf(viewBox)
  const width = text.length * 6.2 + 14
  const centred = x - width / 2
  const left = plot ? Math.min(Math.max(centred, plot.x), plot.x + plot.width - width) : centred
  return (
    <g data-testid="profile-cursor" pointerEvents="none">
      <rect x={left} y={y - 24} width={width} height={20} rx={6} className="fill-primary" />
      <text
        x={left + width / 2}
        y={y - 10}
        textAnchor="middle"
        className="fill-primary-foreground text-[11px] font-medium"
      >
        {text}
      </text>
    </g>
  )
}

// The first and last labels sit on the edges of the plot, so a long name runs inwards instead of
// being centred on its point and cut off.
function EdgeTick({
  x,
  y,
  payload,
  labels,
}: {
  x?: number
  y?: number
  payload?: { value: number }
  labels: string[]
}) {
  const plot = usePlotArea()
  const index = payload?.value ?? 0
  const atStart = index === 0
  const edge = plot ? (atStart ? plot.x : plot.x + plot.width) : (x ?? 0)
  return (
    <text
      data-testid="profile-tick"
      x={edge}
      y={(y ?? 0) + 12}
      textAnchor={atStart ? 'start' : 'end'}
      className="fill-muted-foreground text-[11px]"
    >
      {labels[index] ?? ''}
    </text>
  )
}

interface DotProps {
  cx?: number
  cy?: number
  index?: number
}

// A value along the file order, linked to the map through the shared hover and pinned point.
export function ValueProfile({ features, keys, valueKey, onKeyChange, scheme }: ValueProfileProps) {
  const hover = useMapInspection((state) => state.hover)
  const pinned = useMapInspection((state) => state.pinned)
  const hiddenIndexes = useMapInspection((state) => state.hiddenIndexes)
  const setHover = useMapInspection((state) => state.setHover)
  const setPinned = useMapInspection((state) => state.setPinned)
  const [flip, setFlip] = useState<{ key: string; inverted: boolean } | null>(null)

  const count = features.features.length
  // Only the data and the settings feed this, so pointing around does not redo it.
  const model = useMemo(
    () =>
      buildProfile(
        features.features,
        valueKey,
        scheme,
        flip?.key === valueKey ? flip.inverted : null,
      ),
    [features, valueKey, scheme, flip],
  )
  const { rows, domain, ticks, extent, inverted } = model

  // A category whose every point the legend has hidden has nothing left to shade.
  const bands = model.bands.filter((band) => {
    for (let index = band.start; index <= band.end; index += 1) {
      if (!hiddenIndexes.has(index)) return true
    }
    return false
  })

  const shownHover = hover?.data === features ? hover : null
  const shownPinned = pinned?.data === features ? pinned : null
  const activeIndex = shownHover?.index ?? shownPinned?.index ?? null
  const activeRow = activeIndex === null ? undefined : rows[activeIndex]
  const chipText = activeRow ? `${activeRow.label} · ${formatReading(activeRow.value)}` : ''

  // Worked out here from the pointer, not read from the chart: the chart reports its pointer a frame
  // late, and a click right after moving (or a tap) would land on the previous point.
  // A point the legend has dimmed cannot be pointed at, on the chart any more than on the map.
  function indexUnder(event: React.MouseEvent<HTMLElement>): number | null {
    const box = event.currentTarget.getBoundingClientRect()
    const index = indexAtX(event.clientX - box.left, {
      left: Y_AXIS_WIDTH + MARGIN.left,
      width: box.width - Y_AXIS_WIDTH - MARGIN.left - MARGIN.right,
      count,
    })
    return index !== null && !hiddenIndexes.has(index) ? index : null
  }

  const summary =
    extent === null
      ? `${valueKey} along the file order, with no numbers`
      : `${valueKey} along the file order, from ${formatReading(extent[0])} to ${formatReading(extent[1])}`

  return (
    <Card size="sm">
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>{valueKey} along the file order</CardTitle>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs whitespace-nowrap">
            Profile of
            <select
              className="h-7 rounded-md border bg-background px-1 text-xs"
              value={valueKey}
              onChange={(event) => {
                onKeyChange(event.target.value)
              }}
            >
              {keys.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </label>
          <ToggleControl
            label="Invert axis"
            pressed={inverted}
            onChange={(next) => {
              setFlip({ key: valueKey, inverted: next })
            }}
          />
        </div>
      </CardHeader>
      <CardContent>
        {/* Pointing is mouse-only; the inspector's Previous and Next buttons are the keyboard route. */}
        <div
          className="cursor-pointer"
          onMouseMove={(event) => {
            const index = indexUnder(event)
            setHover(index === null ? null : inspectedPointAt(features, index))
          }}
          onMouseLeave={() => {
            setHover(null)
          }}
          onClick={(event) => {
            const index = indexUnder(event)
            if (index !== null) setPinned(inspectedPointAt(features, index))
          }}
        >
          <ChartContainer
            config={CHART_CONFIG}
            className="aspect-auto h-44 w-full justify-start"
            role="img"
            aria-label={summary}
          >
            <ComposedChart data={rows} margin={MARGIN} accessibilityLayer={false}>
              {bands.map((band) => (
                <ReferenceArea
                  key={`${String(band.start)}-${band.label}`}
                  x1={band.start - 0.5}
                  x2={band.end + 0.5}
                  fill={band.color}
                  fillOpacity={0.12}
                  stroke="none"
                  ifOverflow="visible"
                  label={{
                    content: ({ viewBox }: { viewBox?: unknown }) =>
                      boxOf(viewBox).width >= MIN_BAND_LABEL_WIDTH ? (
                        <text
                          data-testid="profile-band-label"
                          x={boxOf(viewBox).x + 5}
                          y={boxOf(viewBox).y + 12}
                          fill={band.color}
                          className="text-[11px] font-medium"
                        >
                          {band.label}
                        </text>
                      ) : null,
                  }}
                />
              ))}
              <XAxis
                type="number"
                dataKey="index"
                domain={[-0.5, count - 0.5]}
                ticks={count > 1 ? [0, count - 1] : [0]}
                tick={<EdgeTick labels={rows.map((row) => row.label)} />}
                tickLine={false}
                axisLine={false}
                interval={0}
                padding={{ left: 0, right: 0 }}
              />
              <YAxis
                width={Y_AXIS_WIDTH}
                reversed={inverted}
                domain={domain}
                ticks={ticks}
                tickFormatter={formatTick}
                tickLine={false}
                axisLine={false}
              />
              <CartesianGrid vertical={false} />
              <Area
                dataKey="value"
                type="linear"
                baseValue={domain[0]}
                stroke="var(--color-value)"
                strokeOpacity={0.5}
                strokeWidth={1.5}
                fill="var(--color-value)"
                fillOpacity={0.05}
                connectNulls={false}
                isAnimationActive={false}
                activeDot={false}
                dot={
                  count <= MAX_DOTS
                    ? ({ cx, cy, index }: DotProps) =>
                        typeof cx === 'number' && typeof cy === 'number' && index !== undefined ? (
                          <circle
                            key={index}
                            data-testid="profile-dot"
                            cx={cx}
                            cy={cy}
                            r={index === activeIndex ? 5 : 3.5}
                            fill={rows[index]?.color}
                            stroke={index === activeIndex ? '#111827' : '#ffffff'}
                            strokeWidth={1.5}
                            opacity={hiddenIndexes.has(index) ? 0.15 : 1}
                          />
                        ) : (
                          <g key={index ?? 'none'} />
                        )
                    : false
                }
              />
              {activeIndex !== null && (
                <ReferenceLine
                  x={activeIndex}
                  stroke="var(--color-value)"
                  strokeOpacity={0.35}
                  ifOverflow="visible"
                  label={{
                    content: ({ viewBox }: { viewBox?: unknown }) => (
                      <CursorChip viewBox={viewBox} text={chipText} />
                    ),
                  }}
                />
              )}
            </ComposedChart>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  )
}
