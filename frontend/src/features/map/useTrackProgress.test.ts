import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TRACK_DRAW_MS, useTrackProgress } from './useTrackProgress'

function reducedMotion(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
  reducedMotion(false)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useTrackProgress', () => {
  it('stays at zero while the track is off', () => {
    const { result } = renderHook(() => useTrackProgress(false))

    expect(result.current).toBe(0)
  })

  it('draws the line in over time and finishes at one', () => {
    const { result } = renderHook(() => useTrackProgress(true))

    act(() => {
      vi.advanceTimersByTime(TRACK_DRAW_MS / 2)
    })
    expect(result.current).toBeGreaterThan(0)
    expect(result.current).toBeLessThan(1)

    act(() => {
      vi.advanceTimersByTime(TRACK_DRAW_MS)
    })
    expect(result.current).toBe(1)
  })

  it('draws again from the start when switched off and on', () => {
    const { result, rerender } = renderHook(({ on }) => useTrackProgress(on), {
      initialProps: { on: true },
    })
    act(() => {
      vi.advanceTimersByTime(TRACK_DRAW_MS * 2)
    })
    expect(result.current).toBe(1)

    rerender({ on: false })
    expect(result.current).toBe(0)

    rerender({ on: true })
    // Before any frame has run, not a flash of the finished line from the previous time.
    expect(result.current).toBe(0)
    act(() => {
      vi.advanceTimersByTime(16)
    })
    expect(result.current).toBeLessThan(1)
  })

  it('shows the whole line at once for people who prefer reduced motion', () => {
    reducedMotion(true)

    const { result } = renderHook(() => useTrackProgress(true))

    expect(result.current).toBe(1)
  })
})
