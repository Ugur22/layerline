import { beforeEach, describe, expect, it } from 'vitest'
import { useMapView } from '@/features/map/mapView'
import { useImportSession } from './importSession'

beforeEach(() => {
  useImportSession.setState({ jobId: null, filter: null })
  useMapView.getState().reset()
})

describe('useImportSession', () => {
  it('clears the filter when another import is opened, since a filter belongs to one layer', () => {
    useImportSession.setState({ jobId: 'a', filter: { property: 'p', value: 'v' } })

    useImportSession.getState().setJobId('b')

    expect(useImportSession.getState()).toMatchObject({ jobId: 'b', filter: null })
  })

  it('starts the map view afresh for another import, before its layer is drawn', () => {
    useMapView
      .getState()
      .apply({ colorKey: 'campaign', sizeKey: 'depth', profileKey: 'depth', track: true })
    useMapView.getState().setLabelKey('name')

    useImportSession.getState().setJobId('b')

    expect(useMapView.getState()).toMatchObject({
      colorKey: '',
      sizeKey: '',
      labelKey: '',
      profileKey: '',
      showTrack: false,
      hidden: [],
    })
  })
})
