import { create } from 'zustand'
import type { LayerFilter } from '@/api/types'
import { useMapView } from '@/features/map/mapView'

// UI state only: which import the user is looking at and how the map is filtered. The data itself
// lives in TanStack Query.
interface ImportSession {
  jobId: string | null
  filter: LayerFilter | null
  setJobId: (jobId: string | null) => void
  setFilter: (filter: LayerFilter | null) => void
}

export const useImportSession = create<ImportSession>((set) => ({
  jobId: null,
  filter: null,
  // A filter belongs to one layer's properties, so switching import clears it. The way the last
  // layer was drawn (colours, sizes, labels) goes too, so the next one is not drawn once with it.
  setJobId: (jobId) => {
    useMapView.getState().reset()
    set({ jobId, filter: null })
  },
  setFilter: (filter) => {
    set({ filter })
  },
}))
