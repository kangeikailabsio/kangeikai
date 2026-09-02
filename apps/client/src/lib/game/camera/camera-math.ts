/**
 * Camera scroll for one axis, in world units. When the (zoom-adjusted) viewport is smaller than
 * the map, follows the avatar centered, clamped so the camera never shows area outside the map
 * (FR-006). When the viewport is *larger* than the map along this axis (e.g. a wide monitor and
 * a smaller-than-typical map, or the map fully fitted via `fitToMapZoom`), the whole map already
 * fits — statically center it rather than panning within the slack space, which would otherwise
 * bias the map toward whichever edge the avatar is nearest (not what "keep the avatar in view"
 * should look like when the avatar, and everything else, is already always in view).
 */
export function clampedCameraScroll(avatarPos: number, viewportSize: number, mapSize: number): number {
  if (mapSize <= viewportSize) {
    return (mapSize - viewportSize) / 2
  }
  const desired = avatarPos - viewportSize / 2
  return Math.min(Math.max(desired, 0), mapSize - viewportSize)
}

/**
 * The zoom level at which the entire map fits within the viewport (contain-fit): scales up to
 * the largest value that still shows the whole map on both axes, so whichever axis is more
 * constrained (narrower relative to the map) determines it — the other axis ends up with
 * letterboxed slack, centered by `clampedCameraScroll`.
 */
export function fitToMapZoom(viewportWidth: number, viewportHeight: number, mapWidthPx: number, mapHeightPx: number): number {
  return Math.min(viewportWidth / mapWidthPx, viewportHeight / mapHeightPx)
}

export function clampZoom(zoom: number, minZoom: number, maxZoom: number): number {
  return Math.min(Math.max(zoom, minZoom), maxZoom)
}
