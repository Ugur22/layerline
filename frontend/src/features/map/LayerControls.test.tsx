import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SegmentedControl, SelectControl } from './LayerControls'

describe('SegmentedControl', () => {
  it('offers None and every key as one group, with the current choice selected', () => {
    render(
      <SegmentedControl
        label="Colour by"
        value="type"
        keys={['type', 'depth_m']}
        disabled={false}
        onChange={() => undefined}
      />,
    )

    const group = screen.getByRole('radiogroup', { name: 'Colour by' })
    expect(group).toBeInTheDocument()
    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('value'))).toEqual([
      '',
      'type',
      'depth_m',
    ])
    expect(screen.getByRole('radio', { name: 'type' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'None' })).not.toBeChecked()
  })

  it('reports the chosen key, and the empty string for None', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <SegmentedControl
        label="Colour by"
        value="type"
        keys={['type', 'depth_m']}
        disabled={false}
        onChange={onChange}
      />,
    )

    await user.click(screen.getByRole('radio', { name: 'depth_m' }))
    await user.click(screen.getByRole('radio', { name: 'None' }))

    expect(onChange.mock.calls).toEqual([['depth_m'], ['']])
  })

  it('cannot be used while disabled', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <SegmentedControl label="Colour by" value="" keys={['type']} disabled onChange={onChange} />,
    )

    await user.click(screen.getByText('type'))

    expect(screen.getByRole('radio', { name: 'type' })).toBeDisabled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('moves between options with the arrow keys, like any radio group', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <SegmentedControl
        label="Colour by"
        value=""
        keys={['type']}
        disabled={false}
        onChange={onChange}
      />,
    )

    screen.getByRole('radio', { name: 'None' }).focus()
    await user.keyboard('{ArrowRight}')

    expect(onChange).toHaveBeenCalledWith('type')
  })
})

it('ignores a property with an empty name, which would clash with None', () => {
  render(
    <SegmentedControl
      label="Colour by"
      value=""
      keys={['', 'type']}
      disabled={false}
      onChange={() => undefined}
    />,
  )

  expect(screen.getAllByRole('radio')).toHaveLength(2)
})

describe('SelectControl', () => {
  it('lists None and every key and reports the choice', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <SelectControl
        label="Size by"
        value=""
        keys={['depth_m']}
        disabled={false}
        onChange={onChange}
      />,
    )

    await user.selectOptions(screen.getByLabelText('Size by'), 'depth_m')

    expect(onChange).toHaveBeenCalledWith('depth_m')
    expect(screen.getByRole('option', { name: 'None' })).toBeInTheDocument()
  })
})
