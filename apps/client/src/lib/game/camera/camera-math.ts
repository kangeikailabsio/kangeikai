/**
 * The world-space point (one axis) `camera.centerOn` should look at, given the avatar's
 * position, so the camera follows the avatar clamped to the map's edges (FR-006) — or, once the
 * (zoom-adjusted) viewport is at least as big as the map along this axis, statically centers on
 * the map's own center instead of panning within the slack space, which would otherwise bias the
 * map toward whichever edge the avatar is nearest (not what "keep the avatar in view" should
 * look like when the avatar, and everything else, is already always in view).
 *
 * Deliberately not using Phaser's own `camera.setBounds`/`useBounds` clamping for this: its
 * `clampX`/`clampY` pin the map to `bounds.x`/`bounds.y` rather than centering it once the
 * bounds are smaller than the (zoom-adjusted) viewport — exactly the case at the minimum zoom,
 * where the whole map should end up centered, not flush to one corner.
 */
export function clampedCameraCenter(avatarPos: number, viewportSize: number, mapSize: number): number {
  if (mapSize <= viewportSize) {
    return mapSize / 2
  }
  return Math.min(Math.max(avatarPos, viewportSize / 2), mapSize - viewportSize / 2)
}

/**
 * The zoom level at which the entire map fits within the viewport (contain-fit): scales up to
 * the largest value that still shows the whole map on both axes, so whichever axis is more
 * constrained (narrower relative to the map) determines it — the other axis ends up with
 * letterboxed slack, centered by `clampedCameraCenter`.
 */
export function fitToMapZoom(viewportWidth: number, viewportHeight: number, mapWidthPx: number, mapHeightPx: number): number {
  return Math.min(viewportWidth / mapWidthPx, viewportHeight / mapHeightPx)
}

export function clampZoom(zoom: number, minZoom: number, maxZoom: number): number {
  return Math.min(Math.max(zoom, minZoom), maxZoom)
}
