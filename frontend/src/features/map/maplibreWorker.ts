import { setWorkerUrl } from 'maplibre-gl'
// MapLibre 6 looks for its worker as a sibling file of its own module. Vite relocates the library
// into a bundled chunk, so that lookup fails ("Worker failed to load"). Bundling the worker as its
// own asset and passing the URL explicitly works in both dev and production builds.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

setWorkerUrl(workerUrl)
