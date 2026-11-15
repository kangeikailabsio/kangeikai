import type { AvatarPresence } from '@kangeikai/shared'
import type { RoomSnapshot } from './room-snapshot'
import type { ScreenShareGridTile } from './screen-share-grid-state.svelte'
import type { VideoOverlayEntry } from './video-overlay-state.svelte'
import type { RemoteVideoOverlayCandidate, VideoOverlayParticipant } from './video-overlay-tiles'
import { PendingTileTimeout } from './pending-tile-timeout'
import { buildScreenShareGridTiles } from './screen-share-grid'
import { buildVideoOverlayTiles } from './video-overlay-tiles'

/**
 * How many remote tiles the strip shows: past this the rest collapse into one "+N" tile (still
 * audible, just not drawn). Keeps the tiles legible however many people are nearby.
 */
export const MAX_REMOTE_VIDEO_TILES = 4

/** Someone else on the map, as far as the tiles care. */
export interface CallPerson {
  displayName: string
  presence: AvatarPresence
  /** Map pixels from the local avatar: the strip shows the closest first. */
  distance: number
}

/** Where the person is in a call right now, and what that says about who to show. */
export type CallSituation
  /** In the office: the people close enough to hear, among those connected to the office room. */
  = | { kind: 'office', room: RoomSnapshot, nearby: ReadonlySet<string> }
  /** In a private room: everyone in it, plus the occupants of the zone who have not connected yet. */
    | { kind: 'private', room: RoomSnapshot, occupants: readonly string[] }
  /** The person's own connection to their zone's private room failed, so there is no room to read. */
    | { kind: 'error', occupants: readonly string[], retrying: boolean }

export interface CallTilesInput {
  situation: CallSituation
  localBusy: boolean
  /** The person's own tile when there is no room to read it from (the connection error). */
  localSessionId: string
  localName: string
  /** The microphone and camera of a private room that just connected are still being set up (issue #141). */
  mediaConnecting: boolean
  /** Everyone else on the map: their names, Busy state and distance, whether or not they are in a call. */
  people: ReadonlyMap<string, CallPerson>
  /** Milliseconds, any clock: only its differences matter. */
  now: number
}

export interface CallTilesOutput {
  /** The strip of tiles at the top of the screen. */
  strip: VideoOverlayEntry[]
  /** Every screen share, for the full-screen grid. */
  grid: ScreenShareGridTile[]
}

/**
 * Which video tiles to show (issues #94, #141, #142, #225), from plain data: Busy hides
 * everything, a Busy remote is left out, a person still connecting gets a placeholder that gives
 * up after a while, a failed private-room connection gets an error tile that turns into a spinner
 * on "Try again", and the strip keeps only the closest few remotes. Holds nothing but the clock of
 * the pending placeholders, which is why it is a class.
 */
export class CallTiles {
  constructor(private readonly pendingTimeout: PendingTileTimeout = new PendingTileTimeout()) {}

  /** A private room just connected: placeholders start counting again. */
  reset(): void {
    this.pendingTimeout.clear()
  }

  compute(input: CallTilesInput): CallTilesOutput {
    const { situation } = input
    if (situation.kind === 'error')
      return this.computeError(input, situation)
    if (input.localBusy)
      return { strip: [], grid: [] }
    return situation.kind === 'private' ? this.computePrivate(input, situation) : this.computeOffice(input, situation)
  }

  private computeOffice(input: CallTilesInput, situation: Extract<CallSituation, { kind: 'office' }>): CallTilesOutput {
    return this.build(input, situation.room, situation.nearby, new Set())
  }

  private computePrivate(input: CallTilesInput, situation: Extract<CallSituation, { kind: 'private' }>): CallTilesOutput {
    const { room, occupants } = situation
    // Occupants not (yet) in the LiveKit room are the pending ones; the ones pending for too long
    // are dropped (issue #225): a remote failure cannot be told apart from a slow connect, and a
    // spinner that never resolves misleads. They come back as real tiles if they connect later.
    const pending = this.pendingTimeout.visible(occupants.filter(sessionId => !room.remotes.has(sessionId)), input.now)
    const expected = new Set([...pending, ...room.remotes.keys()])
    return this.build(input, room, expected, pending)
  }

  private computeError(input: CallTilesInput, situation: Extract<CallSituation, { kind: 'error' }>): CallTilesOutput {
    if (input.localBusy)
      return { strip: [], grid: [] }

    const local: VideoOverlayParticipant[] = [situation.retrying
      ? { sessionId: input.localSessionId, name: input.localName, pending: true }
      : { sessionId: input.localSessionId, name: input.localName, error: true }]
    const remotes: RemoteVideoOverlayCandidate[] = situation.occupants
      .filter(sessionId => input.people.get(sessionId)?.presence !== 'busy')
      .map(sessionId => ({
        sessionId,
        name: input.people.get(sessionId)?.displayName ?? sessionId,
        pending: true,
        distance: input.people.get(sessionId)?.distance ?? Infinity,
      }))
    return { strip: buildVideoOverlayTiles(local, remotes, MAX_REMOTE_VIDEO_TILES), grid: [] }
  }

  /**
   * The strip and the grid for a room: the local person first ("You", plus a second tile while
   * sharing the screen), then the closest of `visible` that are connected (a camera tile each, plus
   * a screen tile when they share: a share never replaces the camera tile, #94), or a placeholder
   * for those in `pending`.
   */
  private build(input: CallTilesInput, room: RoomSnapshot, visible: ReadonlySet<string>, pending: ReadonlySet<string>): CallTilesOutput {
    const remotes: RemoteVideoOverlayCandidate[] = []
    for (const sessionId of visible) {
      const person = input.people.get(sessionId)
      if (person?.presence === 'busy')
        continue
      const distance = person?.distance ?? Infinity
      const participant = room.remotes.get(sessionId)
      if (!participant) {
        if (pending.has(sessionId))
          remotes.push({ sessionId, name: person?.displayName ?? sessionId, pending: true, distance })
        continue
      }

      remotes.push({
        sessionId,
        name: participant.name,
        kind: 'camera',
        cameraEnabled: participant.cameraEnabled,
        micEnabled: participant.micEnabled,
        speaking: participant.speaking,
        videoTrack: participant.cameraTrack,
        distance,
      })
      if (participant.screenTrack) {
        remotes.push({
          sessionId,
          name: participant.name,
          kind: 'screen',
          cameraEnabled: participant.cameraEnabled,
          micEnabled: participant.micEnabled,
          speaking: participant.speaking,
          videoTrack: participant.screenTrack,
          distance,
        })
      }
    }

    // While the person's own microphone and camera are still being set up, a real tile would look
    // like a deliberate camera-off choice rather than "still connecting" (issue #141); a share
    // cannot be running yet either.
    const { local: self } = room
    const local: VideoOverlayParticipant[] = input.mediaConnecting
      ? [{ sessionId: self.sessionId, name: self.name, pending: true }]
      : [{ sessionId: self.sessionId, name: self.name, kind: 'camera', cameraEnabled: self.cameraEnabled, micEnabled: self.micEnabled, speaking: self.speaking, videoTrack: self.cameraTrack }]
    if (!input.mediaConnecting && self.screenTrack)
      local.push({ sessionId: self.sessionId, name: self.name, kind: 'screen', cameraEnabled: self.cameraEnabled, micEnabled: self.micEnabled, speaking: self.speaking, videoTrack: self.screenTrack })

    return {
      strip: buildVideoOverlayTiles(local, remotes, MAX_REMOTE_VIDEO_TILES),
      grid: buildScreenShareGridTiles(local, remotes),
    }
  }
}
