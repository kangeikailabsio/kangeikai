export type HoverTarget = 'local' | string

export interface HoverPosition {
  x: number
  y: number
}

/**
 * Pure lookup: resolves which position the hover ring should follow this frame, given who (if
 * anyone) is currently hovered. Returns `undefined` — clearing the ring — when nothing is
 * hovered, or when a previously-hovered remote person has since left the room and their
 * sessionId no longer exists in `remotePositions`.
 */
export function resolveHoverTargetPosition(
  target: HoverTarget | undefined,
  localPosition: HoverPosition,
  remotePositions: ReadonlyMap<string, HoverPosition>,
): HoverPosition | undefined {
  if (target === undefined) {
    return undefined
  }
  if (target === 'local') {
    return localPosition
  }
  return remotePositions.get(target)
}
