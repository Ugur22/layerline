import { create } from 'zustand'
import type { PointFeatureCollection } from '@/api/types'

export interface InspectedPoint {
  // Tied to the data it came from, so a point a new filter removed stops being shown.
  data: PointFeatureCollection
  // Position in `data`, which is also the point's position in the uploaded file.
  index: number
  coordinates: [number, number]
  properties: Record<string, unknown>
}

// UI state shared by the map and the inspector next to it: the point under the pointer and the
// one the user clicked to keep. Both only describe the layer that is currently on screen.
interface MapInspection {
  hover: InspectedPoint | null
  pinned: InspectedPoint | null
  setHover: (point: InspectedPoint | null) => void
  setPinned: (point: InspectedPoint | null) => void
  clear: () => void
}

function samePoint(a: InspectedPoint | null, b: InspectedPoint | null) {
  return a?.data === b?.data && a?.index === b?.index
}

export const useMapInspection = create<MapInspection>((set, get) => ({
  hover: null,
  pinned: null,
  // Fires on every pixel of pointer movement; keeping the same object avoids re-rendering for nothing.
  setHover: (point) => {
    if (!samePoint(get().hover, point)) set({ hover: point })
  },
  setPinned: (point) => {
    set({ pinned: point })
  },
  clear: () => {
    set({ hover: null, pinned: null })
  },
}))
