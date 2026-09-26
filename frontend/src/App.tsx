import { ImportsList } from '@/features/imports/ImportsList'
import { UploadPanel } from '@/features/imports/UploadPanel'
import { MapPanel } from '@/features/map/MapPanel'

export default function App() {
  return (
    <main className="mx-auto flex max-w-[90rem] flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Layerline</h1>
      <div className="grid items-start gap-6 lg:grid-cols-[17.5rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <UploadPanel />
          <ImportsList />
        </div>
        <MapPanel />
      </div>
    </main>
  )
}
