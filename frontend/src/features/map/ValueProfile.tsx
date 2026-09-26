import { useMemo, useRef, useState } from 'react'
import type { PointFeatureCollection } from '@/api/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ToggleControl } from './LayerControls'
import { PROFILE_LAYOUT } from './profileLayout'
import { pointColor, propertyText, type DrawableColorScheme } from './layerStyle'
import { useMapInspection } from './mapInspection'
import { inspectedPointAt } from './pointLookup'
import {
  areaPath,
  extentOf,
  indexAtX,
  linePath,
  niceTicks,
  profileDomain,
  runsOf,
  valuesFor,
} from './profile'

const { viewWidth, viewHeight, left, width, top, height } = PROFILE_LAYOUT

// Beyond this the dots would overlap into a smear, and the line says enough.
const MAX_DOTS = 120
const MIN_BAND_LABEL_WIDTH = 40

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

// A value along the file order, linked to the map through the shared hover and pinned point.
// Pointing is mouse-only; the inspector's Previous and Next buttons are the keyboard route.
export function ValueProfile({ features, keys, valueKey, onKeyChange, scheme }: ValueProfileProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const hover = useMapInspection((state) => state.hover)
  const pinned = useMapInspection((state) => state.pinned)
  const hiddenIndexes = useMapInspection((state) => state.hiddenIndexes)
  const setHover = useMapInspection((state) => state.setHover)
  const setPinned = useMapInspection((state) => state.setPinned)
  const [flip, setFlip] = useState<{ key: string; inverted: boolean } | null>(null)

  const count = features.features.length
  // Everything below depends only on the data and the settings, not on where the pointer is, so
  // pointing around the map or the chart does not redo it.
  const model = useMemo(() => {
    const values = valuesFor(features.features, valueKey)
    const extent = extentOf(values)
    const [low, high] = profileDomain(values)
    // Depth is measured downwards from a surface, so it hangs from the top unless told otherwise.
    // Negative depths already run the other way, so those are left alone.
    const inverted =
      flip?.key === valueKey ? flip.inverted : /depth/i.test(valueKey) && (extent?.[0] ?? 0) >= 0
    const columnWidth = count === 0 ? width : width / count
    const xOf = (index: number) => left + columnWidth * (index + 0.5)
    const yOf = (value: number) => {
      const fraction = (value - low) / (high - low)
      return top + height * (inverted ? fraction : 1 - fraction)
    }
    const points = values.map((value, index): [number, number] | null =>
      value === null ? null : [xOf(index), yOf(value)],
    )
    const bands =
      scheme?.kind === 'categorical'
        ? runsOf(
            features.features.map(
              (feature) => propertyText(feature.properties[scheme.key]) || null,
            ),
          )
            // A run thinner than a unit of the chart is noise, not a stretch.
            .filter((run) => run.label !== null && columnWidth * (run.end - run.start + 1) >= 1)
        : []
    return {
      values,
      extent,
      inverted,
      columnWidth,
      xOf,
      yOf,
      points,
      bands,
      ticks: niceTicks(low, high).map((tick) => ({ tick, y: yOf(tick) })),
      area: areaPath(points, yOf(low)),
      line: linePath(points),
      colors: features.features.map((feature) => pointColor(scheme, feature.properties)),
    }
  }, [features, valueKey, flip, scheme, count])
  const { values, inverted, columnWidth, xOf, points } = model
  // A category whose every point the legend has hidden has nothing left to shade.
  const bands = model.bands.filter((run) => {
    for (let index = run.start; index <= run.end; index += 1) {
      if (!hiddenIndexes.has(index)) return true
    }
    return false
  })

  const shownHover = hover?.data === features ? hover : null
  const shownPinned = pinned?.data === features ? pinned : null
  const activeIndex = shownHover?.index ?? shownPinned?.index ?? null
  const activeFeature = activeIndex === null ? undefined : features.features[activeIndex]

  function indexUnder(clientX: number): number | null {
    const box = svgRef.current?.getBoundingClientRect()
    if (!box || box.width === 0) return null
    const index = indexAtX(((clientX - box.left) * viewWidth) / box.width, {
      left,
      width,
      count,
    })
    return index !== null && !hiddenIndexes.has(index) ? index : null
  }

  const summary =
    model.extent === null
      ? `${valueKey} along the file order, with no numbers`
      : `${valueKey} along the file order, from ${formatReading(model.extent[0])} to ${formatReading(model.extent[1])}`

  const chipText =
    activeFeature === undefined || activeIndex === null
      ? ''
      : `${typeof activeFeature.properties.name === 'string' && activeFeature.properties.name !== '' ? activeFeature.properties.name : `#${String(activeIndex + 1)}`} · ${formatReading(values[activeIndex] ?? null)}`
  const chipWidth = chipText.length * 6.2 + 14
  const chipX =
    activeIndex === null
      ? 0
      : Math.max(
          0,
          Math.min(Math.max(xOf(activeIndex) - chipWidth / 2, left), left + width - chipWidth),
        )

  const firstName = features.features[0]?.properties.name
  const lastName = features.features.at(-1)?.properties.name

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
        <svg
          ref={svgRef}
          viewBox={`0 0 ${String(viewWidth)} ${String(viewHeight)}`}
          role="img"
          aria-label={summary}
          className="w-full text-[11px]"
        >
          {bands.map((run) => {
            const x = left + columnWidth * run.start
            const bandWidth = columnWidth * (run.end - run.start + 1)
            const color = pointColor(scheme, { [scheme?.key ?? '']: run.label })
            return (
              <g key={`${String(run.start)}-${run.label ?? ''}`}>
                <rect
                  data-testid="profile-band"
                  x={x}
                  y={top}
                  width={bandWidth}
                  height={height}
                  fill={color}
                  fillOpacity={0.12}
                />
                {bandWidth >= MIN_BAND_LABEL_WIDTH && (
                  <text x={x + 5} y={top + 12} fill={color} className="font-medium">
                    {run.label}
                  </text>
                )}
              </g>
            )
          })}
          {model.ticks.map(({ tick, y }) => (
            <g key={tick}>
              <line x1={left} x2={left + width} y1={y} y2={y} className="stroke-border" />
              <text
                x={left - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-muted-foreground tabular-nums"
              >
                {formatTick(tick)}
              </text>
            </g>
          ))}
          <path d={model.area} className="fill-foreground/5" />
          <path
            d={model.line}
            fill="none"
            strokeLinejoin="round"
            className="stroke-foreground/50"
            strokeWidth={1.5}
          />
          {count <= MAX_DOTS &&
            points.map((point, index) =>
              point === null ? null : (
                <circle
                  key={features.features[index]?.id ?? index}
                  data-testid="profile-dot"
                  cx={point[0]}
                  cy={point[1]}
                  r={index === activeIndex ? 5 : 3.5}
                  fill={model.colors[index]}
                  stroke={index === activeIndex ? '#111827' : '#ffffff'}
                  strokeWidth={1.5}
                  opacity={hiddenIndexes.has(index) ? 0.15 : 1}
                />
              ),
            )}
          {typeof firstName === 'string' && (
            <text x={left} y={viewHeight - 6} className="fill-muted-foreground">
              {firstName}
            </text>
          )}
          {typeof lastName === 'string' && count > 1 && (
            <text
              x={left + width}
              y={viewHeight - 6}
              textAnchor="end"
              className="fill-muted-foreground"
            >
              {lastName}
            </text>
          )}
          {activeIndex !== null && (
            <g data-testid="profile-cursor" pointerEvents="none">
              <line
                x1={xOf(activeIndex)}
                x2={xOf(activeIndex)}
                y1={top}
                y2={top + height}
                className="stroke-foreground/35"
              />
              <rect x={chipX} y={4} width={chipWidth} height={20} rx={6} className="fill-primary" />
              <text
                x={chipX + chipWidth / 2}
                y={18}
                textAnchor="middle"
                className="fill-primary-foreground font-medium"
              >
                {chipText}
              </text>
            </g>
          )}
          <rect
            data-testid="profile-surface"
            x={left}
            y={top}
            width={width}
            height={height}
            fill="transparent"
            className="cursor-pointer"
            onMouseMove={(event) => {
              const index = indexUnder(event.clientX)
              setHover(index === null ? null : inspectedPointAt(features, index))
            }}
            onMouseLeave={() => {
              setHover(null)
            }}
            onClick={(event) => {
              const index = indexUnder(event.clientX)
              if (index !== null) setPinned(inspectedPointAt(features, index))
            }}
          />
        </svg>
      </CardContent>
    </Card>
  )
}
