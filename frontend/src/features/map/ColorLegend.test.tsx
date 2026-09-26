import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ColorLegend } from './ColorLegend'
import type { DrawableColorScheme } from './layerStyle'

const categorical: DrawableColorScheme = {
  kind: 'categorical',
  key: 'type',
  entries: [
    { value: 'buoy', color: '#0072b2', count: 20 },
    { value: 'mooring', color: '#e69f00', count: 3 },
  ],
  hasMissing: true,
  missingCount: 2,
}

describe('ColorLegend', () => {
  it('lists each category as a button with its point count', () => {
    render(<ColorLegend scheme={categorical} hidden={[]} onToggle={() => undefined} />)

    expect(screen.getByRole('button', { name: /buoy/ })).toHaveTextContent('20')
    expect(screen.getByRole('button', { name: /mooring/ })).toHaveTextContent('3')
    expect(screen.getByRole('button', { name: /No value/ })).toHaveTextContent('2')
  })

  it('reports which value was clicked, using the empty string for "No value"', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()
    render(<ColorLegend scheme={categorical} hidden={[]} onToggle={onToggle} />)

    await user.click(screen.getByRole('button', { name: /mooring/ }))
    await user.click(screen.getByRole('button', { name: /No value/ }))

    expect(onToggle.mock.calls).toEqual([['mooring'], ['']])
  })

  it('marks hidden categories as not pressed', () => {
    render(<ColorLegend scheme={categorical} hidden={['buoy']} onToggle={() => undefined} />)

    expect(screen.getByRole('button', { name: /buoy/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /mooring/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('has nothing to click on a numeric scale', () => {
    render(
      <ColorLegend
        scheme={{ kind: 'numeric', key: 'depth_m', min: 8.1, max: 47.2, hasMissing: false }}
        hidden={[]}
        onToggle={() => undefined}
      />,
    )

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('47.2')).toBeInTheDocument()
  })
})
