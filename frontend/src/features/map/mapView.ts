import { create } from 'zustand'

// How the layer on screen is being shown. It lives in a store, not in the map, so the story panel
// can set it as well as the controls over the map. It describes one layer, so it is reset when
// the map goes away.
interface MapViewState {
  colorKey: string
  sizeKey: string
  labelKey: string
  profileKey: string
  showTrack: boolean
  // Values of the coloured property the legend has hidden.
  hidden: string[]
  setColorKey: (key: string) => void
  setSizeKey: (key: string) => void
  setLabelKey: (key: string) => void
  setProfileKey: (key: string) => void
  setShowTrack: (show: boolean) => void
  toggleHidden: (value: string) => void
  // A story chapter's whole style at once. The label is the reader's own choice, so it stays.
  apply: (style: { colorKey: string; sizeKey: string; profileKey: string; track: boolean }) => void
  reset: () => void
}

const INITIAL = {
  colorKey: '',
  sizeKey: '',
  labelKey: '',
  profileKey: '',
  showTrack: false,
  hidden: [] as string[],
}

export const useMapView = create<MapViewState>((set) => ({
  ...INITIAL,
  // Hidden values belong to one property's legend and mean nothing under another.
  setColorKey: (colorKey) => {
    set({ colorKey, hidden: [] })
  },
  setSizeKey: (sizeKey) => {
    set({ sizeKey })
  },
  setLabelKey: (labelKey) => {
    set({ labelKey })
  },
  setProfileKey: (profileKey) => {
    set({ profileKey })
  },
  setShowTrack: (showTrack) => {
    set({ showTrack })
  },
  toggleHidden: (value) => {
    set((state) => ({
      hidden: state.hidden.includes(value)
        ? state.hidden.filter((hidden) => hidden !== value)
        : [...state.hidden, value],
    }))
  },
  apply: ({ colorKey, sizeKey, profileKey, track }) => {
    set({ colorKey, sizeKey, profileKey, showTrack: track, hidden: [] })
  },
  reset: () => {
    set({ ...INITIAL })
  },
}))
