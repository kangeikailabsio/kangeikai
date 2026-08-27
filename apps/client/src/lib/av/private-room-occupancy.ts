import type { PrivateZone } from '$lib/game/map/private-zones'
import type { AvatarPosition } from './proximity-audio-controller'
import { privateZoneAt } from '$lib/game/map/private-zones'

export interface PrivateZoneOccupancy {
  /** The private zone the local avatar is currently in, or `null` if it's in none. */
  zoneId: number | null
  /** Remote session IDs sharing that zone right now — excludes the local avatar itself. */
  occupantSessionIds: readonly string[]
}

/**
 * Determines which private zone (if any) the local avatar is in, and which remote avatars
 * (by session ID) are inside that same zone right now. Busy identities are isolated: a busy
 * local never occupies a zone (even while standing in one), and a busy remote is never an
 * occupant. Geometry is otherwise unchanged for `available` avatars — no LiveKit/network
 * concerns, so `PrivateRoomController` can stay simple.
 */
export function resolvePrivateZoneOccupancy(
  zones: readonly PrivateZone[],
  localPosition: AvatarPosition,
  remotePositions: ReadonlyMap<string, AvatarPosition>,
): PrivateZoneOccupancy {
  if (localPosition.presence === 'busy') {
    return { zoneId: null, occupantSessionIds: [] }
  }

  const zone = privateZoneAt(zones, localPosition.x, localPosition.y)
  if (!zone) {
    return { zoneId: null, occupantSessionIds: [] }
  }

  const occupantSessionIds = [...remotePositions.entries()]
    .filter(([, position]) => position.presence !== 'busy')
    .filter(([, position]) => privateZoneAt(zones, position.x, position.y)?.id === zone.id)
    .map(([sessionId]) => sessionId)

  return { zoneId: zone.id, occupantSessionIds }
}
