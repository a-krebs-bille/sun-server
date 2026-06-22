// Andrew's monotone-chain convex hull. Dependency-free — replaces @turf/convex,
// whose transitive dep (concaveman → rbush) breaks under Next's server bundler
// with "RBush is not a constructor". Points and the returned ring are [x, y]
// pairs; in this app that's [lng, lat]. The returned ring is closed (first point
// repeated at the end) so it can be handed straight to @turf/helpers `polygon()`.
export function convexHull(points: [number, number][]): [number, number][] | null {
  if (points.length < 3) return null

  const pts = points
    .slice()
    .sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]))

  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

  const lower: [number, number][] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }

  const upper: [number, number][] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }

  lower.pop()
  upper.pop()
  const ring = lower.concat(upper)
  if (ring.length < 3) return null

  ring.push(ring[0]) // close the ring
  return ring
}
