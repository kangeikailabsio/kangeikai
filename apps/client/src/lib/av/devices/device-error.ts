/** Why a microphone or camera could not be started (issue #245): what a person can do about it differs for each. */
export type MediaFailureKind = 'blocked' | 'not-found' | 'in-use' | 'unknown'

/**
 * Maps what `getUserMedia` (through LiveKit) throws to a reason. Until now every failure was
 * the same "unavailable". `OverconstrainedError` is a chosen device that is no longer there.
 * Anything that is not a device problem (a publish cancelled by a room switch, a non-error) is
 * `unknown`, never `in-use`: nothing is wrong with the device and the caller can try again.
 */
export function classifyMediaError(error: unknown): MediaFailureKind {
  const name = typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : ''
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
    case 'PermissionDeniedError':
      return 'blocked'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'not-found'
    case 'NotReadableError':
    case 'TrackStartError':
      return 'in-use'
    default:
      return 'unknown'
  }
}
