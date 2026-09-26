import { useMemo, useState } from 'react'
import Map, { Layer, Popup, Source, type MapLayerMouseEvent } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import './maplibreWorker'
import type { MapLayerResponse, PointFeature, PointFeatureCollection } from '@/api/types'
import { BASEMAP_STYLE_URL } from '@/config'
import { boundsFor } from './bounds'
import { ColorLegend, SizeLegend } from './ColorLegend'
import { FeaturePopupContent } from './FeaturePopupContent'
import {
  buildColorScheme,
  buildSizeScale,
  colorExpression,
  DEFAULT_COLOR,
  DEFAULT_RADIUS,
  radiusExpression,
} from './layerStyle'

const POINTS_LAYER_ID = 'layer-points'
const LABELS_LAYER_ID = 'layer-labels'
// Must exist in the basemap's glyph set (ADR 0009 allows any style); this is the default style's.
// Collision handling hides overlapping labels, so no zoom threshold is needed.
const LABEL_FONT = 'Noto Sans Regular'

const CONTROL_CLASS = 'h-7 rounded-md border bg-background px-1 text-xs'

function SelectControl({
  label,
  value,
  keys,
  disabled,
  onChange,
}: {
  label: string
  value: string
  keys: string[]
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      {label}
      <select
        className={CONTROL_CLASS}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.value)
        }}
      >
        <option value="">None</option>
        {keys.map((key) => (
          <option key={key} value={key}>
            {key}
          </option>
        ))}
      </select>
    </label>
  )
}

const NOTE_CLASS =
  'max-w-56 rounded-lg bg-background/95 px-2 py-1 text-xs shadow-sm ring-1 ring-border'

interface Selection {
  // Tied to the data it came from, so a popup for a point a new filter removed disappears.
  data: PointFeatureCollection
  coordinates: [number, number]
  properties: Record<string, unknown>
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
  const [colorKey, setColorKey] = useState('')
  const [sizeKey, setSizeKey] = useState('')
  const [labelKey, setLabelKey] = useState('')
  const [selection, setSelection] = useState<Selection | null>(null)
  const [hovering, setHovering] = useState(false)

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
  const drawableScheme = scheme && scheme.kind !== 'too-many' ? scheme : null
  const activeSelection = selection?.data === layer.features ? selection : null

  function handleClick(event: MapLayerMouseEvent) {
    // Typed by hand: the library's feature type depends on GeoJSON typings the linter cannot resolve.
    const hit = event.features?.[0] as
      | {
          geometry: { type: string; coordinates: [number, number] }
          properties: Record<string, unknown>
        }
      | undefined
    if (hit?.geometry.type !== 'Point') {
      setSelection(null)
      return
    }
    setSelection({
      data: layer.features,
      coordinates: hit.geometry.coordinates,
      properties: hit.properties,
    })
  }

  return (
    // `idle` fires only once every source is loaded and rendered, which needs the map's worker. The
    // attribute lets end-to-end tests wait for a map that really works, not just one that mounted.
    <div className="flex h-full w-full flex-col" data-map-ready={ready}>
      {propertyKeys.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-background px-2 py-1.5">
          <SelectControl
            label="Colour by"
            value={colorKey}
            keys={propertyKeys}
            disabled={!styleFeatures}
            onChange={setColorKey}
          />
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
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <Map
          initialViewState={
            bounds
              ? {
                  bounds,
                  fitBoundsOptions: {
                    padding: 48,
                    maxZoom: 15,
                  },
                }
              : { longitude: 0, latitude: 20, zoom: 1 }
          }
          mapStyle={BASEMAP_STYLE_URL}
          style={{ width: '100%', height: '100%' }}
          interactiveLayerIds={[POINTS_LAYER_ID]}
          cursor={hovering ? 'pointer' : ''}
          onMouseEnter={() => {
            setHovering(true)
          }}
          onMouseLeave={() => {
            setHovering(false)
          }}
          onClick={handleClick}
          onIdle={() => {
            setReady(true)
          }}
        >
          <Source id="layer" type="geojson" data={layer.features}>
            <Layer
              id={POINTS_LAYER_ID}
              type="circle"
              paint={{
                'circle-radius': sizeScale ? radiusExpression(sizeScale) : DEFAULT_RADIUS,
                'circle-color': drawableScheme ? colorExpression(drawableScheme) : DEFAULT_COLOR,
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': 2,
              }}
            />
            {labelKey && (
              <Layer
                id={LABELS_LAYER_ID}
                type="symbol"
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
          {activeSelection && (
            <Popup
              longitude={activeSelection.coordinates[0]}
              latitude={activeSelection.coordinates[1]}
              offset={12}
              onClose={() => {
                setSelection(null)
              }}
            >
              <FeaturePopupContent properties={activeSelection.properties} />
            </Popup>
          )}
        </Map>

        <div className="pointer-events-none absolute bottom-6 left-2 flex flex-col items-start gap-2">
          {colorKey && !scheme && styleFeatures && (
            <p className={NOTE_CLASS}>No points have a value for {colorKey}.</p>
          )}
          {scheme?.kind === 'too-many' && (
            <p className={NOTE_CLASS}>
              {scheme.key} has {scheme.distinct} different values, too many to colour.
            </p>
          )}
          {drawableScheme && <ColorLegend scheme={drawableScheme} />}
          {sizeKey && !sizeScale && styleFeatures && (
            <p className={NOTE_CLASS}>No points have a number for {sizeKey}.</p>
          )}
          {sizeScale && <SizeLegend scale={sizeScale} />}
        </div>
      </div>
    </div>
  )
}
