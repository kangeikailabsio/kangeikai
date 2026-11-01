import type { RawSample, ShareStats } from '$lib/av/screen-share-stats'
import type { LocalVideoTrack, RemoteVideoTrack } from 'livekit-client'
import { createStatsTracker, parseReceiverReport, parseSenderReport } from '$lib/av/screen-share-stats'

export const STATS_POLL_INTERVAL_MS = 2000

export interface PollableTile {
  sessionId: string
  isLocal: boolean
  videoTrack: LocalVideoTrack | RemoteVideoTrack | undefined
}

type Tracker = ReturnType<typeof createStatsTracker>

async function readSample(tile: PollableTile): Promise<RawSample | undefined> {
  const track = tile.videoTrack
  if (!track) {
    return undefined
  }
  // Re-resolved on every sample: the sender is replaced when the share is handed off to another
  // room (#116), so it must never be cached.
  const source = tile.isLocal ? (track as LocalVideoTrack).sender : (track as RemoteVideoTrack).receiver
  if (!source) {
    return undefined
  }
  const report = await source.getStats()
  const now = performance.now()
  return tile.isLocal ? parseSenderReport(report, now) : parseReceiverReport(report, now)
}

/**
 * Polls `getStats()` for every tile `getTiles()` returns, once per `intervalMs`, and hands the
 * full `sessionId → stats` map to `publish`. Tiles that disappeared (or whose track changed)
 * lose their tracker. Returns a function that stops the polling.
 */
export function startScreenShareStatsPolling(
  getTiles: () => PollableTile[],
  publish: (stats: Record<string, ShareStats>) => void,
  intervalMs = STATS_POLL_INTERVAL_MS,
): () => void {
  const trackers = new Map<string, { track: unknown, tracker: Tracker }>()
  let stopped = false
  let polling = false

  async function tick(): Promise<void> {
    if (polling) {
      return
    }
    polling = true
    try {
      const tiles = getTiles()
      const alive = new Set(tiles.map(tile => tile.sessionId))
      for (const id of trackers.keys()) {
        if (!alive.has(id)) {
          trackers.delete(id)
        }
      }

      const next: Record<string, ShareStats> = {}
      await Promise.all(tiles.map(async (tile) => {
        try {
          const sample = await readSample(tile)
          if (!sample) {
            return
          }
          let entry = trackers.get(tile.sessionId)
          if (!entry || entry.track !== tile.videoTrack) {
            entry = { track: tile.videoTrack, tracker: createStatsTracker() }
            trackers.set(tile.sessionId, entry)
          }
          next[tile.sessionId] = entry.tracker.push(sample)
        }
        catch {
          // A failed sample just leaves this tile without fresh numbers until the next tick.
        }
      }))
      if (!stopped) {
        publish(next)
      }
    }
    finally {
      polling = false
    }
  }

  void tick()
  const timer = setInterval(() => void tick(), intervalMs)
  return () => {
    stopped = true
    clearInterval(timer)
  }
}
