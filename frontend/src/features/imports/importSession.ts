import { create } from 'zustand'

// UI state only: which job the user is looking at. The job itself lives in TanStack Query.
interface ImportSession {
  jobId: string | null
  setJobId: (jobId: string | null) => void
}

export const useImportSession = create<ImportSession>((set) => ({
  jobId: null,
  setJobId: (jobId) => {
    set({ jobId })
  },
}))
