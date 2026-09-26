import { useEffect, useState } from 'react'

export const TRACK_DRAW_MS = 1600

export function prefersReducedMotion() {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false
}

// 0 to 1 while the track is drawn in, restarting each time it is switched on.
export function useTrackProgress(active: boolean): number {
  const [progress, setProgress] = useState(0)
  const reduced = prefersReducedMotion()

  useEffect(() => {
    if (!active || reduced) return
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / TRACK_DRAW_MS)
      setProgress(1 - (1 - t) ** 3)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      // Back to the start, so switching the track on again draws it from the beginning.
      setProgress(0)
    }
  }, [active, reduced])

  if (!active) return 0
  return reduced ? 1 : progress
}
