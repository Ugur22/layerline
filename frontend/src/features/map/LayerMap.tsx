import { useEffect, useMemo, useRef, useState } from 'react'
import Map, {
  Layer,
  Popup,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import './maplibreWorker'
import type { ExpressionSpecification } from 'maplibre-gl'
import type { MapLayerResponse, PointFeature } from '@/api/types'
import { BASEMAP_STYLE_URL } from '@/config'
import { boundsFor } from './bounds'
import { FIT_PADDING } from './fitPadding'
import { ColorLegend, SizeLegend } from './ColorLegend'
import { FeatureTooltipContent } from './FeatureTooltipContent'
import { MAX_SEGMENTED_KEYS, SegmentedControl, SelectControl, ToggleControl } from './LayerControls'
import {
  activeHidden,
  buildColorScheme,
  buildSizeScale,
  colorExpression,
  DEFAULT_COLOR,
  DEFAULT_RADIUS,
  isHiddenPoint,
  opacityExpression,
  radiusExpression,
  visibleFilter,
} from './layerStyle'
import { useMapInspection, type InspectedPoint } from './mapInspection'
import { inspectedPointAt, nearestFeatureIndex } from './pointLookup'
import { trackGradient, trackLine, type TrackLine } from './track'
import { prefersReducedMotion, useTrackProgress } from './useTrackProgress'
import { isWithinInset } from './viewport'

const POINTS_LAYER_ID = 'layer-points'
const LABELS_LAYER_ID = 'layer-labels'
const TRACK_LAYER_ID = 'layer-track'
const HOVER_RING = 3
const PINNED_RING = 5
// Clears the largest point (see MAX_RADIUS) plus its ring, so the tooltip never covers the point.
const HOVER_OFFSET = 22
// Must exist in the basemap's glyph set (ADR 0009 allows any style); this is the default style's.
// Collision handling hides overlapping labels, so no zoom threshold is needed.
const LABEL_FONT = 'Noto Sans Regular'

const NOTE_CLASS =
  'max-w-56 rounded-lg bg-background/95 px-2 py-1 text-xs shadow-sm ring-1 ring-border'

// Its own component so the draw-in animation re-renders only the line, not the whole map.
function TrackLayer({ track }: { track: TrackLine }) {
  const progress = useTrackProgress(true)
  return (
    // Placed before the points, so the line runs underneath them.
    <Source id="track" type="geojson" data={track} lineMetrics>
      <Layer
        id={TRACK_LAYER_ID}
        type="line"
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{ 'line-width': 1.75, 'line-gradient': trackGradient(progress) }}
      />
    </Source>
  )
}

// A ring drawn around one point, sized from the point's own radius so it follows size-by-property.
function PointRing({
  id,
  point,
  radius,
  grow,
}: {
  id: string
  point: InspectedPoint
  radius: ExpressionSpecification | number
  grow: number
}) {
  // A new object each render would make the map re-send the data to its worker every time.
  const data = useMemo<Omit<PointFeature, 'id'>>(
    () => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: point.coordinates },
      properties: point.properties,
    }),
    [point],
  )
  return (
    <Source id={id} type="geojson" data={data}>
      <Layer
        id={`layer-${id}`}
        type="circle"
        paint={{
          'circle-radius': ['+', radius, grow],
          'circle-color': 'rgba(0, 0, 0, 0)',
          'circle-stroke-color': '#111827',
          'circle-stroke-width': 2.5,
        }}
      />
    </Source>
  )
}

interface LayerMapProps {
  layer: MapLayerResponse
  // The whole layer, not the filtered view: colours must not shift when a filter narrows the points.
  // Undefined while it is still loading.
  styleFeatures: PointFeature[] | undefined
}

export function LayerMap({ layer, styleFeatures }: LayerMapProps) {
  const bounds = boundsFor(layer.map_layer)
  const propertyKeys = layer.map_layer.property_keys
  const [ready, setReady] = useState(false)
  const mapRef = useRef<MapRef>(null)
  const [colorKey, setColorKey] = useState('')
  const [sizeKey, setSizeKey] = useState('')
  const [labelKey, setLabelKey] = useState('')
  const [hidden, setHidden] = useState<string[]>([])
  const [showTrack, setShowTrack] = useState(false)
  const hover = useMapInspection((state) => state.hover)
  const pinned = useMapInspection((state) => state.pinned)
  const { setHover, setPinned, setHiddenIndexes, clear } = useMapInspection.getState()

  // The map is remounted per layer; what was inspected on the old one must not linger in the panel.
  useEffect(() => clear, [clear])

  const scheme = useMemo(
    () => (colorKey && styleFeatures ? buildColorScheme(styleFeatures, colorKey) : null),
    [colorKey, styleFeatures],
  )
  const sizeScale = useMemo(
    () => (sizeKey && styleFeatures ? buildSizeScale(styleFeatures, sizeKey) : null),
    [sizeKey, styleFeatures],
  )
  const sizeKeys = useMemo(
    () =>
      styleFeatures
        ? layer.map_layer.property_keys.filter((key) => buildSizeScale(styleFeatures, key))
        : [],
    [layer.map_layer.property_keys, styleFeatures],
  )
  const colourProps = {
    label: 'Colour by',
    value: colorKey,
    keys: propertyKeys,
    disabled: !styleFeatures,
    onChange: (value: string) => {
      setColorKey(value)
      // Hidden values belong to one property's legend and mean nothing under another.
      setHidden([])
    },
  }
  const track = useMemo(() => trackLine(layer.features.features), [layer.features])
  const drawableScheme = scheme && scheme.kind !== 'too-many' ? scheme : null
  const shownHidden = useMemo(() => activeHidden(drawableScheme, hidden), [drawableScheme, hidden])
  const opacity = drawableScheme ? opacityExpression(drawableScheme, shownHidden) : 1
  const hiddenKey = drawableScheme?.kind === 'categorical' ? drawableScheme.key : ''
  const activeHover = hover?.data === layer.features ? hover : null
  const activePinned = pinned?.data === layer.features ? pinned : null
  // Resting on the pinned point would stack two rings on it.
  const hoverIsPinned = activeHover !== null && activeHover.index === activePinned?.index
  const pointRadius = sizeScale ? radiusExpression(sizeScale) : DEFAULT_RADIUS

  // Tell the inspector which points are dimmed, so stepping can skip them.
  useEffect(() => {
    const indexes = new Set<number>()
    if (hiddenKey !== '') {
      layer.features.features.forEach((feature, index) => {
        if (isHiddenPoint(feature.properties, hiddenKey, shownHidden)) indexes.add(index)
      })
    }
    setHiddenIndexes(indexes)
  }, [layer.features, hiddenKey, shownHidden, setHiddenIndexes])

  // Stepping through the points can pin one that is off screen; bring it into view.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !activePinned) return
    const [lon, lat] = activePinned.coordinates
    const container = map.getContainer()
    const size = { width: container.clientWidth, height: container.clientHeight }
    // The bar and legend float over the edges, so a point under them counts as out of view.
    if (!isWithinInset(map.project([lon, lat]), size, FIT_PADDING)) {
      map.easeTo({ center: [lon, lat], duration: prefersReducedMotion() ? 0 : 500 })
    }
  }, [activePinned])

  function pointAt(event: MapLayerMouseEvent): InspectedPoint | null {
    // Typed by hand: the library's feature type depends on GeoJSON typings the linter cannot resolve.
    const hits = (event.features ?? []) as {
      id?: number | string
      geometry: { type: string; coordinates: [number, number] }
      properties: Record<string, unknown>
    }[]
    // A dimmed point on top must not shadow a visible one underneath it.
    const hit = hits.find(
      (candidate) =>
        candidate.geometry.type === 'Point' &&
        !isHiddenPoint(candidate.properties, hiddenKey, shownHidden),
    )
    if (!hit) return null
    // `generateId` numbers the source's features by their place in the layer, which tells apart
    // points at the same spot; matching by position is only the fallback.
    const index =
      typeof hit.id === 'number' && layer.features.features[hit.id]
        ? hit.id
        : nearestFeatureIndex(layer.features, hit.geometry.coordinates)
    return inspectedPointAt(layer.features, index)
  }

  function toggleHidden(value: string) {
    setHidden((current) =>
      current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
    )
    // A point that was just dimmed must not keep its ring, tooltip or place in the inspector.
    setHover(null)
    setPinned(null)
  }

  function handleClick(event: MapLayerMouseEvent) {
    setPinned(pointAt(event))
  }

  function handleMouseMove(event: MapLayerMouseEvent) {
    setHover(pointAt(event))
  }

  return (
    // `idle` fires only once every source is loaded and rendered, which needs the map's worker. The
    // attribute lets end-to-end tests wait for a map that really works, not just one that mounted.
    <div className="flex h-full w-full flex-col" data-map-ready={ready}>
      <div className="relative min-h-0 flex-1">
        <Map
          ref={mapRef}
          initialViewState={
            bounds
              ? {
                  bounds,
                  fitBoundsOptions: {
                    padding: FIT_PADDING,
                    maxZoom: 15,
                  },
                }
              : { longitude: 0, latitude: 20, zoom: 1 }
          }
          mapStyle={BASEMAP_STYLE_URL}
          style={{ width: '100%', height: '100%' }}
          interactiveLayerIds={[POINTS_LAYER_ID]}
          cursor={activeHover ? 'pointer' : ''}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => {
            setHover(null)
          }}
          onClick={handleClick}
          onIdle={() => {
            setReady(true)
          }}
        >
          {showTrack && track && <TrackLayer track={track} />}
          <Source id="layer" type="geojson" data={layer.features} generateId>
            <Layer
              id={POINTS_LAYER_ID}
              type="circle"
              paint={{
                'circle-radius': pointRadius,
                'circle-color': drawableScheme ? colorExpression(drawableScheme) : DEFAULT_COLOR,
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': 2,
                'circle-opacity': opacity,
                'circle-stroke-opacity': opacity,
              }}
            />
            {labelKey && (
              <Layer
                id={LABELS_LAYER_ID}
                type="symbol"
                filter={visibleFilter(drawableScheme, shownHidden)}
                layout={{
                  'text-field': ['to-string', ['get', labelKey]],
                  'text-font': [LABEL_FONT],
                  'text-size': 12,
                  'text-anchor': 'top',
                  'text-offset': [0, 1.5],
                }}
                paint={{
                  'text-color': '#111827',
                  'text-halo-color': '#ffffff',
                  'text-halo-width': 1.5,
                }}
              />
            )}
          </Source>
          {activePinned && (
            <PointRing id="pinned" point={activePinned} radius={pointRadius} grow={PINNED_RING} />
          )}
          {activeHover && !hoverIsPinned && (
            <PointRing id="hover" point={activeHover} radius={pointRadius} grow={HOVER_RING} />
          )}
          {activeHover && (
            <Popup
              className="layer-tooltip"
              longitude={activeHover.coordinates[0]}
              latitude={activeHover.coordinates[1]}
              offset={HOVER_OFFSET}
              closeButton={false}
              closeOnClick={false}
              focusAfterOpen={false}
            >
              <FeatureTooltipContent properties={activeHover.properties} />
            </Popup>
          )}
        </Map>

        {(propertyKeys.length > 0 || track) && (
          <div className="absolute top-2 left-2 z-10 flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg bg-background/95 px-2 py-1.5 shadow-sm ring-1 ring-border">
            {propertyKeys.length > 0 && (
              <>
                {propertyKeys.length <= MAX_SEGMENTED_KEYS ? (
                  <SegmentedControl {...colourProps} />
                ) : (
                  <SelectControl {...colourProps} />
                )}
                {sizeKeys.length > 0 && (
                  <SelectControl
                    label="Size by"
                    value={sizeKey}
                    keys={sizeKeys}
                    disabled={!styleFeatures}
                    onChange={setSizeKey}
                  />
                )}
                <SelectControl
                  label="Label by"
                  value={labelKey}
                  keys={propertyKeys}
                  disabled={false}
                  onChange={setLabelKey}
                />
              </>
            )}
            {track && <ToggleControl label="Track" pressed={showTrack} onChange={setShowTrack} />}
          </div>
        )}

        <div className="pointer-events-none absolute bottom-6 left-2 flex flex-col items-start gap-2">
          {colorKey && !scheme && styleFeatures && (
            <p className={NOTE_CLASS}>No points have a value for {colorKey}.</p>
          )}
          {scheme?.kind === 'too-many' && (
            <p className={NOTE_CLASS}>
              {scheme.key} has {scheme.distinct} different values, too many to colour.
            </p>
          )}
          {drawableScheme && (
            <ColorLegend scheme={drawableScheme} hidden={shownHidden} onToggle={toggleHidden} />
          )}
          {sizeKey && !sizeScale && styleFeatures && (
            <p className={NOTE_CLASS}>No points have a number for {sizeKey}.</p>
          )}
          {sizeScale && <SizeLegend scale={sizeScale} />}
        </div>
      </div>
    </div>
  )
}
