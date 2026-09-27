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
  // A story chapter's callouts, each naming a point by its id (@see resolveCallouts).
  callouts: { id: string; text: string }[]
  setColorKey: (key: string) => void
  setSizeKey: (key: string) => void
  setLabelKey: (key: string) => void
  setProfileKey: (key: string) => void
  setShowTrack: (show: boolean) => void
  toggleHidden: (value: string) => void
  // A story chapter's whole style at once. The label is the reader's own choice, so it stays.
  apply: (
    style: { colorKey: string; sizeKey: string; profileKey: string; track: boolean },
    callouts?: { id: string; text: string }[],
  ) => void
  reset: () => void
}

const INITIAL = {
  colorKey: '',
  sizeKey: '',
  labelKey: '',
  profileKey: '',
  showTrack: false,
  hidden: [] as string[],
  callouts: [] as { id: string; text: string }[],
}

export const useMapView = create<MapViewState>((set) => ({
  ...INITIAL,
  // Hidden values belong to one property's legend and mean nothing under another. A chapter's
  // callouts name points of ITS colouring, size or chart; changing any of those to something the
  // chapter didn't choose leaves them describing a series that is no longer on screen.
  setColorKey: (colorKey) => {
    set({ colorKey, hidden: [], callouts: [] })
  },
  setSizeKey: (sizeKey) => {
    set({ sizeKey, callouts: [] })
  },
  setLabelKey: (labelKey) => {
    set({ labelKey })
  },
  setProfileKey: (profileKey) => {
    set({ profileKey, callouts: [] })
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
  apply: ({ colorKey, sizeKey, profileKey, track }, callouts = []) => {
    set({ colorKey, sizeKey, profileKey, showTrack: track, hidden: [], callouts })
  },
  reset: () => {
    set({ ...INITIAL })
  },
}))
