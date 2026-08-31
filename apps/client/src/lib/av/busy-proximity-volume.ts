import type { AvatarPresence } from '@kangeikai/shared'
import { proximityVolume } from '$lib/av/proximity-volume'

/**
 * Ambient proximity volume with busy isolation: if either side is `busy`, volume
 * is 0 regardless of distance. Otherwise this is the same linear falloff as
 * `proximityVolume`. Named-zone / `sharedZone` boosts are not part of this
 * function — isolated conversations live in `private-*` rooms instead.
 */
export function busyProximityVolume(
  distance: number,
  hearingRangePx: number,
  localPresence: AvatarPresence,
  remotePresence: AvatarPresence,
): number {
  if (localPresence === 'busy' || remotePresence === 'busy') {
    return 0
  }

  return proximityVolume(distance, hearingRangePx)
}
