import type { AvatarPresence, PrivateZone } from '@kangeikai/shared'
import type { ConnectionQuality, Room } from 'livekit-client'
import type { MediaIntent } from './devices/media-intent'
import type { ScreenShareHandoff } from './media-controls'
import type { PrivateRoomConnectError } from './private-room-controller'
import type { AvatarPosition, ProximityAudioControllerOptions } from './proximity-audio-controller'
import type { ScreenShareQualityTier } from './screen-share-quality'
import { MediaControls } from './media-controls'
import { PrivateRoomController } from './private-room-controller'
import { ProximityAudioController } from './proximity-audio-controller'
import { isBusyBlockedByScreenShare } from './screen-share-busy-guard'

/** What the session tells its owner (the scene turns these into its own events and toasts). */
export interface LocalAvSessionEvents {
  /** A room's media was applied: the first time and again after every switch. Same `MediaControls` each time. */
  onMediaReady: (controls: MediaControls) => void
  /** Sent right after `onMediaReady`, with the presence the media was applied under. */
  onPresenceApplied: (presence: AvatarPresence) => void
  /** The local screen-share track ended, for any reason (own toggle, the browser's "Stop sharing"). */
  onScreenShareEnded: () => void
  /** The local connection quality of the active room, reported again on every switch. */
  onConnectionQualityChanged: (quality: ConnectionQuality) => void
  /** A screen share could not be carried into a private room: a genuine failure, unlike a share attempt that is simply retried. */
  onScreenShareHandoffFailed: () => void
  /** A private room just connected (its pending tiles start counting again). */
  onPrivateRoomConnect: () => void
}

export interface LocalAvSessionOptions {
  /** Who this person is for LiveKit, or `undefined` before the realtime session exists (nothing connects then). */
  identity: () => ProximityAudioControllerOptions | undefined
  getPresence: () => AvatarPresence
  /** Sends a throttled position now: MUST happen before a private-room token is requested (issue #134). */
  flushPosition: () => void
  events: LocalAvSessionEvents
  /** The office room and the private rooms; the real ones unless a test hands in its own. */
  office?: ProximityAudioController
  privateRooms?: PrivateRoomController
}

/**
 * The local person's audio and video across LiveKit rooms: which room they are in (the always-on
 * `office`, or a private zone's room), and what their microphone, camera, Busy state and screen
 * share do when that changes (issue #265). The scene reports presence and positions once a frame
 * and reads the state below; the order a switch must happen in lives here and nowhere else.
 *
 * Office → private: the position is flushed before the token is asked for (#134), the screen share
 * is detached from the office before it disconnects (#116), and the intent is recorded before the
 * first publish (#239). Private → office: the private room's `disconnect()` finishes before the
 * office captures the microphone again (#137), and a share does not come along.
 *
 * Switches are not queued: the hand-off into a private room is not awaited, so it can overlap the
 * teardown that follows if the person leaves right away. What keeps that safe is `generation`: a
 * chain that was overtaken gives up after its next `await` without touching the state (issue #269).
 */
export class LocalAvSession {
  private readonly office: ProximityAudioController
  private readonly privateRooms: PrivateRoomController
  private mediaControls: MediaControls | undefined
  private privateRoomInternal: Room | null = null
  private mediaConnectingInternal = false
  private nearby: ReadonlySet<string> = new Set()
  private lastPosition: AvatarPosition | undefined
  /**
   * Bumped whenever a switch starts. A switch is a chain of awaits, and a newer one can start
   * while an older one is still waiting (the person walks out before the screen share finished
   * detaching, say): each chain remembers its number and gives up if it is no longer the latest,
   * so a late one never overwrites what the newer one decided (issue #269).
   */
  private generation = 0
  /**
   * What the person chose on the entry screen, until the session's `MediaControls` exists and takes
   * over as the record of what they want. A private room can connect before the office has applied
   * its first media (someone who joins standing in a zone with a neighbour), and must start from this,
   * not from the defaults (issue #272).
   */
  private entryIntent: MediaIntent | undefined

  constructor(private readonly options: LocalAvSessionOptions) {
    this.office = options.office ?? new ProximityAudioController()
    this.privateRooms = options.privateRooms ?? new PrivateRoomController()
  }

  /** The one `MediaControls` of the session, once the first room's media is up. */
  get media(): MediaControls | undefined {
    return this.mediaControls
  }

  /** The connected private room, or `null` while the person is in the office. Set once the screen share is detached from the office. */
  get privateRoom(): Room | null {
    return this.privateRoomInternal
  }

  /** The always-on office room (connected or not). */
  get officeRoom(): Room {
    return this.office.liveKitRoom
  }

  /** The room whose participants the person sees and hears right now. */
  get activeRoom(): Room {
    return this.privateRoomInternal ?? this.office.liveKitRoom
  }

  /** True while the person's own microphone and camera are still being set up on a private room that just connected (issue #141). */
  get mediaConnecting(): boolean {
    return this.mediaConnectingInternal
  }

  /** A private-room connection that failed and is still relevant (the error tile, or the spinner while "Try again" runs). */
  get connectError(): Readonly<PrivateRoomConnectError> | null {
    return this.privateRooms.connectError
  }

  /** Who counts as nearby in the office as of the last `update()`. Not refreshed while in a private room. */
  get nearbySessionIds(): ReadonlySet<string> {
    return this.nearby
  }

  /** Who else is in the private zone the person stands in, as of the last `update()` (empty outside one, or while Busy). */
  get zoneOccupantSessionIds(): readonly string[] {
    return this.privateRooms.occupancy.occupantSessionIds
  }

  /** The map's private zones. */
  setZones(zones: readonly PrivateZone[]): void {
    this.privateRooms.setZones(zones)
  }

  /**
   * Joins the office with the microphone and camera as the person left them on the entry screen.
   * Call once the realtime session exists. A failure (LiveKit unreachable, say) is logged and
   * leaves movement and presence alone.
   */
  connect(initial: MediaIntent): void {
    this.entryIntent = initial
    // Numbered like any switch: if a private room connects before the office has applied its media,
    // the office must not apply it afterwards on top of the private room's (issue #272).
    this.connectOffice(initial.microphoneEnabled, initial.cameraEnabled, false, undefined, false, ++this.generation)
  }

  /**
   * Once per frame. Connects or leaves a private room as its zone fills and empties, and, in the
   * office, sets everyone's volume by distance.
   */
  update(localPosition: AvatarPosition, remotePositions: ReadonlyMap<string, AvatarPosition>): void {
    this.lastPosition = localPosition
    const identity = this.options.identity()
    if (identity) {
      void this.privateRooms.update(identity, localPosition, remotePositions, {
        onConnect: room => this.handlePrivateRoomConnect(room),
        onDisconnect: () => this.handlePrivateRoomDisconnect(),
      }, this.options.flushPosition)
    }

    if (!this.privateRoomInternal)
      this.nearby = this.office.update(localPosition, remotePositions)
  }

  /** "Try again" on the private-room error tile. */
  retry(): void {
    this.privateRooms.retryFailedConnection()
  }

  /** Whether going to `presence` must be refused: a share would stay published behind the isolation Busy promises (#105). */
  isBusyBlocked(presence: AvatarPresence): boolean {
    return isBusyBlockedByScreenShare(this.mediaControls?.screenShareEnabled ?? false, presence)
  }

  /** Busy: unpublish the microphone and camera, remembering what to restore. Not busy: restore it. */
  async setBusy(busy: boolean): Promise<void> {
    if (busy)
      await this.mediaControls?.beginBusy()
    else
      await this.mediaControls?.endBusy()
  }

  /** Leaves every LiveKit room. */
  disconnect(): void {
    this.office.disconnect()
    this.privateRooms.disconnect()
  }

  /**
   * Connects the office room and applies the given state to it. Also how the person comes back
   * from a private room, carrying the microphone and camera they had there.
   */
  private connectOffice(micEnabled = true, cameraEnabled = false, screenShareEnabled = false, screenShareQuality?: ScreenShareQualityTier, screenShareAudio = false, generation?: number): void {
    const identity = this.options.identity()
    if (!identity)
      return

    this.office
      .connect(identity, this.lastPosition ?? { x: 0, y: 0, presence: this.options.getPresence() })
      .then(() => {
        // If the person went into a private room while the office was still connecting (coming back
        // from one, or joining inside one), the media belongs to that room now (issues #269, #272).
        if (generation !== undefined && generation !== this.generation)
          return
        return this.applyMedia(this.office.liveKitRoom, micEnabled, cameraEnabled, screenShareEnabled, screenShareQuality, screenShareAudio)
      })
      .catch((error: unknown) => {
        console.warn('kangeikai: failed to connect proximity audio/video', error)
      })
  }

  /**
   * Points the session's `MediaControls` at the room that is now active (creating it the first
   * time) and applies the given microphone, camera and screen-share state. A denied permission or
   * a missing device never throws: `MediaControls` records it. A screen share is never (re)started
   * while Busy. `screenShareHandoff` (issue #116) republishes an already-live track instead of
   * capturing again, and a failed republish is reported back, not thrown, so the microphone,
   * camera and the ready events still go through.
   */
  private async applyMedia(room: Room, micEnabled: boolean, cameraEnabled: boolean, screenShareEnabled: boolean, screenShareQuality?: ScreenShareQualityTier, screenShareAudio = false, screenShareHandoff?: ScreenShareHandoff): Promise<{ screenShareHandoffFailed: boolean }> {
    let next = this.mediaControls
    if (next) {
      next.switchRoom(room)
    }
    else {
      next = new MediaControls(
        room,
        () => this.options.events.onScreenShareEnded(),
        quality => this.options.events.onConnectionQualityChanged(quality),
      )
      this.mediaControls = next
    }
    // Before the first publish starts: the next switch reads the person's intent from here, and a
    // publish still in flight must not make it look like the microphone or camera is off (#239).
    next.declareIntent({ microphoneEnabled: micEnabled, cameraEnabled })
    let screenShareHandoffFailed = false
    const presence = this.options.getPresence()
    if (presence === 'busy') {
      await next.beginBusy({ microphoneEnabled: micEnabled, cameraEnabled })
    }
    else {
      await next.setMicrophoneEnabled(micEnabled)
      await next.setCameraEnabled(cameraEnabled)
      if (screenShareHandoff) {
        try {
          await next.adoptScreenShareTrack(screenShareHandoff)
        }
        catch (error) {
          screenShareHandoffFailed = true
          console.warn('kangeikai: failed to continue screen share across a room switch', error)
        }
      }
      else {
        await (screenShareQuality
          ? next.setScreenShareEnabled(screenShareEnabled, screenShareQuality, screenShareAudio)
          : next.setScreenShareEnabled(screenShareEnabled))
      }
    }
    this.options.events.onMediaReady(next)
    this.options.events.onPresenceApplied(this.options.getPresence())
    return { screenShareHandoffFailed }
  }

  /**
   * A zone's second person arrived: leave the office for a real, isolated call. Always an
   * office → private move (`PrivateRoomController` never goes private to private), so a screen
   * share is handed over instead of dropped. If that fails the person is told, unlike a normal
   * share attempt, which stays silent and retriable.
   */
  private handlePrivateRoomConnect(room: Room): void {
    this.options.events.onPrivateRoomConnect()
    void this.connectPrivateRoomWithScreenShareHandoff(room, ++this.generation)
  }

  private async connectPrivateRoomWithScreenShareHandoff(room: Room, generation: number): Promise<void> {
    const previous = this.mediaControls
    let screenShareHandoff: ScreenShareHandoff | undefined
    let screenShareHandoffFailed = false
    try {
      screenShareHandoff = await previous?.detachScreenShareTrack()
    }
    catch (error) {
      screenShareHandoffFailed = true
      console.warn('kangeikai: failed to detach screen share ahead of a private-room switch', error)
    }
    if (generation !== this.generation) {
      // The person left before this finished: the private room is already gone and the office is
      // coming back. The share was detached from the office, so nothing owns its tracks any more:
      // stop them rather than republish on a dead room (issue #269).
      screenShareHandoff?.videoTrack.stop()
      screenShareHandoff?.audioTrack?.stop()
      return
    }
    this.office.disconnect()
    this.privateRoomInternal = room
    this.mediaConnectingInternal = true
    try {
      const result = await this.applyMedia(
        room,
        previous?.microphoneIntent ?? this.entryIntent?.microphoneEnabled ?? true,
        previous?.cameraIntent ?? this.entryIntent?.cameraEnabled ?? false,
        false,
        undefined,
        false,
        screenShareHandoff,
      )
      if ((screenShareHandoffFailed || result.screenShareHandoffFailed) && generation === this.generation)
        this.options.events.onScreenShareHandoffFailed()
    }
    finally {
      // Only the latest switch decides this: an overtaken one must not clear what a newer one set.
      if (generation === this.generation)
        this.mediaConnectingInternal = false
    }
  }

  /**
   * The private call ended (fewer than two people, or the person left the zone): back to the
   * office with the microphone and camera they asked for. A screen share is never carried back, it
   * just stops (issue #116).
   */
  private handlePrivateRoomDisconnect(): void {
    // The controls still belong to the room that just disconnected. Its published tracks are gone,
    // but the intent it recorded is not tied to the room (#239): reading the track state instead is
    // always `false` after the disconnect (#222), and still `false` before it if a publish was in
    // flight when the person left.
    const micEnabled = this.mediaControls?.microphoneIntent ?? true
    const cameraEnabled = this.mediaControls?.cameraIntent ?? false
    this.privateRoomInternal = null
    this.mediaConnectingInternal = false
    this.connectOffice(micEnabled, cameraEnabled, false, undefined, false, ++this.generation)
  }
}
