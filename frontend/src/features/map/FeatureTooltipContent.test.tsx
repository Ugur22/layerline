import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FeaturePopupContent } from './FeaturePopupContent'

describe('FeaturePopupContent', () => {
  it('lists every property as a name and its value', () => {
    render(<FeaturePopupContent properties={{ name: 'S-001', depth_m: 8.6, active: false }} />)

    expect(screen.getByText('name').nextSibling).toHaveTextContent('S-001')
    expect(screen.getByText('depth_m').nextSibling).toHaveTextContent('8.6')
    expect(screen.getByText('active').nextSibling).toHaveTextContent('false')
  })

  it('shows nested values as JSON instead of [object Object]', () => {
    render(<FeaturePopupContent properties={{ tags: { a: 1 } }} />)

    expect(screen.getByText('{"a":1}')).toBeInTheDocument()
  })

  it('says when a point has no properties', () => {
    render(<FeaturePopupContent properties={{}} />)

    expect(screen.getByText('This point has no properties.')).toBeInTheDocument()
  })
})
