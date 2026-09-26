import { describe, expect, it } from 'vitest'
import { isWithinInset } from './viewport'

const size = { width: 800, height: 600 }
const inset = { top: 96, right: 48, bottom: 48, left: 48 }

describe('isWithinInset', () => {
  it('accepts a point in the clear part of the view', () => {
    expect(isWithinInset({ x: 400, y: 300 }, size, inset)).toBe(true)
  })

  it('rejects a point under the control bar at the top', () => {
    expect(isWithinInset({ x: 400, y: 40 }, size, inset)).toBe(false)
  })

  it('rejects a point close to any other edge', () => {
    expect(isWithinInset({ x: 10, y: 300 }, size, inset)).toBe(false)
    expect(isWithinInset({ x: 790, y: 300 }, size, inset)).toBe(false)
    expect(isWithinInset({ x: 400, y: 590 }, size, inset)).toBe(false)
  })

  it('rejects a point outside the view', () => {
    expect(isWithinInset({ x: -50, y: 900 }, size, inset)).toBe(false)
  })
})
