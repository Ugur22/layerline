import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FeatureTooltipContent } from './FeatureTooltipContent'

describe('FeatureTooltipContent', () => {
  it('uses the name as a title and lists a few other properties', () => {
    render(
      <FeatureTooltipContent
        properties={{ name: 'S-001', depth_m: 8.6, type: 'buoy', campaign: 'A', lat: 52.4 }}
      />,
    )

    expect(screen.getByText('S-001')).toBeInTheDocument()
    expect(screen.getByText('depth_m').nextSibling).toHaveTextContent('8.6')
    expect(screen.getByText('type').nextSibling).toHaveTextContent('buoy')
    expect(screen.getByText('campaign').nextSibling).toHaveTextContent('A')
  })

  it('keeps the tooltip short however many properties a point has', () => {
    render(<FeatureTooltipContent properties={{ name: 'S-001', a: 1, b: 2, c: 3, d: 4, e: 5 }} />)

    expect(screen.getAllByRole('term')).toHaveLength(3)
  })

  it('does not repeat the name as a row', () => {
    render(<FeatureTooltipContent properties={{ name: 'S-001', depth_m: 8.6 }} />)

    expect(screen.queryByText('name')).not.toBeInTheDocument()
  })

  it('lists properties without a title when the point has no name', () => {
    render(<FeatureTooltipContent properties={{ depth_m: 8.6 }} />)

    expect(screen.getByText('depth_m').nextSibling).toHaveTextContent('8.6')
  })

  it('says when a point has no properties', () => {
    render(<FeatureTooltipContent properties={{}} />)

    expect(screen.getByText('This point has no properties.')).toBeInTheDocument()
  })

  it('shows a name that is empty or not text as an ordinary row', () => {
    render(<FeatureTooltipContent properties={{ name: '', code: 7 }} />)

    expect(screen.getByText('name')).toBeInTheDocument()
    expect(screen.getByText('code')).toBeInTheDocument()
  })

  it('shows only the title, with no empty list, when the name is the only property', () => {
    render(<FeatureTooltipContent properties={{ name: 'S-001' }} />)

    expect(screen.getByText('S-001')).toBeInTheDocument()
    expect(screen.queryByRole('term')).not.toBeInTheDocument()
  })
})
