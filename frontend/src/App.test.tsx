import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'
import { renderWithClient } from './test/render'

describe('App', () => {
  it('shows the product name and the upload form', () => {
    renderWithClient(<App />)

    expect(screen.getByRole('heading', { name: 'Layerline' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled()
  })
})
