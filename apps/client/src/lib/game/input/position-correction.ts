export interface CorrectableAvatar {
  x: number
  y: number
}

/**
 * Obeys the server's `correctPosition` (issue #255): the avatar goes back to the point it names
 * and any walk to a clicked point stops, because it was heading from a place the server refused.
 */
export function applyPositionCorrection(avatar: CorrectableAvatar, autoWalk: { cancel: () => void }, position: { x: number, y: number }): void {
  autoWalk.cancel()
  avatar.x = position.x
  avatar.y = position.y
}
