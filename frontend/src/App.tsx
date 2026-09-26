import { UploadPanel } from '@/features/imports/UploadPanel'
import { MapPanel } from '@/features/map/MapPanel'

export default function App() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Layerline</h1>
      <UploadPanel />
      <MapPanel />
    </main>
  )
}
