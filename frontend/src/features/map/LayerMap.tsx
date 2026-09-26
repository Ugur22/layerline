import { useState } from 'react'
import Map, { Layer, Source } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import './maplibreWorker'
import type { MapLayerResponse } from '@/api/types'
import { BASEMAP_STYLE_URL } from '@/config'
import { boundsFor } from './bounds'

export function LayerMap({ layer }: { layer: MapLayerResponse }) {
  const bounds = boundsFor(layer.map_layer)
  const [ready, setReady] = useState(false)

  return (
    // `idle` fires only once every source is loaded and rendered, which needs the map's worker. The
    // attribute lets end-to-end tests wait for a map that really works, not just one that mounted.
    <div className="h-full w-full" data-map-ready={ready}>
      <Map
        initialViewState={
          bounds
            ? { bounds, fitBoundsOptions: { padding: 48, maxZoom: 15 } }
            : { longitude: 0, latitude: 20, zoom: 1 }
        }
        mapStyle={BASEMAP_STYLE_URL}
        style={{ width: '100%', height: '100%' }}
        onIdle={() => {
          setReady(true)
        }}
      >
        <Source id="layer" type="geojson" data={layer.features}>
          <Layer
            id="layer-points"
            type="circle"
            paint={{
              'circle-radius': 7,
              'circle-color': '#4f46e5',
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 2,
            }}
          />
        </Source>
      </Map>
    </div>
  )
}
