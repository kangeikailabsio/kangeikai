import type { ShareStats } from '$lib/av/screen-share-stats'

/**
 * Latest stats per screen-share tile (#208), keyed by `sessionId`. Kept apart from
 * `screenShareGridState` on purpose: `OfficeScene` rebuilds the tile objects every frame, so a
 * field set on a tile would be lost on the next tick.
 */
function createScreenShareStatsState() {
  let bySession = $state<Record<string, ShareStats>>({})

  return {
    get(sessionId: string): ShareStats | undefined {
      return bySession[sessionId]
    },
    set(value: Record<string, ShareStats>): void {
      bySession = value
    },
  }
}

export const screenShareStatsState = createScreenShareStatsState()
