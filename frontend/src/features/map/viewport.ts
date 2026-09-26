interface Inset {
  top: number
  right: number
  bottom: number
  left: number
}

// Whether a screen position is in the part of the map that nothing floats over.
export function isWithinInset(
  point: { x: number; y: number },
  size: { width: number; height: number },
  inset: Inset,
): boolean {
  return (
    point.x >= inset.left &&
    point.x <= size.width - inset.right &&
    point.y >= inset.top &&
    point.y <= size.height - inset.bottom
  )
}
