import { beforeEach, describe, expect, it } from 'vitest'
import { useMapView } from './mapView'

beforeEach(() => {
  useMapView.getState().reset()
})

describe('useMapView', () => {
  it('starts with nothing coloured, sized, labelled, tracked or hidden', () => {
    expect(useMapView.getState()).toMatchObject({
      colorKey: '',
      sizeKey: '',
      labelKey: '',
      profileKey: '',
      showTrack: false,
      hidden: [],
    })
  })

  it('sets each setting on its own', () => {
    const view = useMapView.getState()

    view.setSizeKey('depth')
    view.setLabelKey('name')
    view.setProfileKey('temp')
    view.setShowTrack(true)

    expect(useMapView.getState()).toMatchObject({
      sizeKey: 'depth',
      labelKey: 'name',
      profileKey: 'temp',
      showTrack: true,
    })
  })

  it('forgets the hidden values when the colouring changes, since they belong to one legend', () => {
    useMapView.getState().setColorKey('type')
    useMapView.getState().toggleHidden('buoy')

    useMapView.getState().setColorKey('campaign')

    expect(useMapView.getState().hidden).toEqual([])
  })

  it('hides a value and shows it again', () => {
    useMapView.getState().toggleHidden('buoy')
    useMapView.getState().toggleHidden('mooring')
    expect(useMapView.getState().hidden).toEqual(['buoy', 'mooring'])

    useMapView.getState().toggleHidden('buoy')

    expect(useMapView.getState().hidden).toEqual(['mooring'])
  })

  it('applies a whole chapter style at once, leaving the label alone, and clears the hidden values', () => {
    useMapView.getState().setLabelKey('name')
    useMapView.getState().toggleHidden('buoy')

    useMapView
      .getState()
      .apply({ colorKey: 'campaign', sizeKey: '', profileKey: 'depth', track: true })

    expect(useMapView.getState()).toMatchObject({
      colorKey: 'campaign',
      sizeKey: '',
      profileKey: 'depth',
      showTrack: true,
      labelKey: 'name',
      hidden: [],
    })
  })

  it('starts with no callouts, applies them with a chapter style, and clears them on reset', () => {
    expect(useMapView.getState().callouts).toEqual([])

    useMapView
      .getState()
      .apply({ colorKey: 'campaign', sizeKey: '', profileKey: 'depth', track: true }, [
        { id: 'a', text: 'Start' },
      ])
    expect(useMapView.getState().callouts).toEqual([{ id: 'a', text: 'Start' }])

    useMapView.getState().reset()

    expect(useMapView.getState().callouts).toEqual([])
  })

  it('drops the callouts once the reader changes what they were about', () => {
    const callouts = [{ id: 'a', text: 'Lowest · 1' }]

    useMapView
      .getState()
      .apply({ colorKey: 'd', sizeKey: 'd', profileKey: 'd', track: true }, callouts)
    useMapView.getState().setColorKey('other')
    expect(useMapView.getState().callouts).toEqual([])

    useMapView
      .getState()
      .apply({ colorKey: 'd', sizeKey: 'd', profileKey: 'd', track: true }, callouts)
    useMapView.getState().setSizeKey('other')
    expect(useMapView.getState().callouts).toEqual([])

    useMapView
      .getState()
      .apply({ colorKey: 'd', sizeKey: 'd', profileKey: 'd', track: true }, callouts)
    useMapView.getState().setProfileKey('other')
    expect(useMapView.getState().callouts).toEqual([])
  })

  it('keeps the callouts when only the label changes, since they are not about it', () => {
    const callouts = [{ id: 'a', text: 'Lowest · 1' }]
    useMapView
      .getState()
      .apply({ colorKey: 'd', sizeKey: '', profileKey: 'd', track: true }, callouts)

    useMapView.getState().setLabelKey('name')

    expect(useMapView.getState().callouts).toEqual(callouts)
  })

  it('goes back to the start on reset', () => {
    useMapView.getState().apply({ colorKey: 'a', sizeKey: 'b', profileKey: 'c', track: true })
    useMapView.getState().setLabelKey('name')

    useMapView.getState().reset()

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
