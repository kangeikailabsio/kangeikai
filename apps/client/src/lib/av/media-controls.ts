import type { ConnectionQuality, LocalTrack, LocalTrackPublication, Room } from 'livekit-client'
import type { DeviceKind } from './devices/device-choice-store'
import type { MediaFailureKind } from './devices/device-error'
import type { ScreenShareQualityTier } from './screen-share-quality'
import { ParticipantEvent, Track } from 'livekit-client'
import { classifyMediaError } from './devices/device-error'
import { applyDeviceChoice } from './devices/room-device-options'
import { DEFAULT_SCREEN_SHARE_QUALITY_TIER, resolveScreenShareQuality } from './screen-share-quality'

interface EnabledSnapshot {
  microphoneEnabled: boolean
  cameraEnabled: boolean
}

/**
 * A screen-share (+ optional audio) track detached from one room, still capturing, ready to be
 * republished on another room instead of triggering a fresh `getDisplayMedia()` prompt — how a
 * share survives a private-area room switch (issue #116).
 */
export interface ScreenShareHandoff {
  videoTrack: LocalTrack
  audioTrack: LocalTrack | undefined
  quality: ScreenShareQualityTier
  shareAudio: boolean
}

/**
 * Whether this browser can capture the screen at all — a static capability, not something that
 * changes per room or per attempt, so it's a module-level function rather than instance state
 * (issue #115's grill). Takes `navigator` as a parameter (defaulting to the global) so tests can
 * inject a fake one instead of stubbing the global.
 */
export function isScreenShareCaptureSupported(nav: Navigator = navigator): boolean {
  return typeof nav.mediaDevices?.getDisplayMedia === 'function'
}

/**
 * Controls the local participant's own microphone/camera/screen-share publishing
 * (FR-004/FR-005, and screen share per issue #96).
 *
 * `setMicrophoneEnabled`/`setCameraEnabled` never throw: a denied permission or missing device
 * is caught and recorded as `*Unavailable` instead, so callers (the auto-enable attempt on
 * connect, and the UI's toggle buttons) can treat it as a normal state to disable/label around
 * rather than an error to handle.
 *
 * `setScreenShareEnabled` never throws either, but a failed attempt (permission denied *or* the
 * native picker cancelled — browsers don't reliably distinguish the two, e.g. Chrome throws the
 * same `NotAllowedError` for both) is only logged, not recorded as unavailable: it must stay
 * retriable (issue #115). `screenShareUnsupported` covers the one case that *is* reliably
 * detectable — this browser has no `getDisplayMedia` at all — via `isScreenShareCaptureSupported`.
 */
export class MediaControls {
  private micUnavailable = false
  private cameraUnavailableFlag = false
  /** Why the last attempt failed, `undefined` after a success (issue #245): blocked, no device or in use. */
  private micFailure: MediaFailureKind | undefined
  private cameraFailureKind: MediaFailureKind | undefined
  private busySuppression = false
  private busySnapshot: EnabledSnapshot | null = null
  /**
   * What the person last asked for, recorded when they ask and not when the publish finishes
   * (issue #239). `undefined` until the first request. See `microphoneIntent`.
   */
  private requestedMicrophone: boolean | undefined
  private requestedCamera: boolean | undefined
  private screenShareQualityTier: ScreenShareQualityTier = DEFAULT_SCREEN_SHARE_QUALITY_TIER
  private screenShareAudioPreference = false

  /**
   * Fires `onScreenShareEnded` when the screen-share track is unpublished for any reason,
   * including the browser's native "Stop sharing" control (LiveKit fires this same event for
   * that case — see `LocalTrackUnpublished`'s docs) — not just when we call
   * `setScreenShareEnabled(false)` ourselves. No explicit teardown: this instance (and its
   * `room`) is discarded wholesale on the next room switch (`OfficeScene.applyMediaControls`),
   * same as every other `MediaControls` listener today.
   */
  private readonly handleLocalTrackUnpublished = (publication: LocalTrackPublication): void => {
    if (publication.source === Track.Source.ScreenShare) {
      this.onScreenShareEnded?.()
    }
  }

  /**
   * Issue #132 — LiveKit recalculates this continuously and fires the event whether or not it
   * actually changed, unlike the FPS overlay (`fps-display.svelte`), which has no such event and
   * has to poll `requestAnimationFrame` instead.
   */
  private readonly handleConnectionQualityChanged = (quality: ConnectionQuality): void => {
    this.onConnectionQualityChanged?.(quality)
  }

  constructor(private readonly room: Room, private readonly onScreenShareEnded?: () => void, private readonly onConnectionQualityChanged?: (quality: ConnectionQuality) => void) {
    this.room.localParticipant.on(ParticipantEvent.LocalTrackUnpublished, this.handleLocalTrackUnpublished)
    this.room.localParticipant.on(ParticipantEvent.ConnectionQualityChanged, this.handleConnectionQualityChanged)
    // Reports the room's already-current reading immediately, rather than leaving the caller at
    // `ConnectionQuality.Unknown` until the next actual change fires.
    this.onConnectionQualityChanged?.(this.connectionQuality)
  }

  get microphoneEnabled(): boolean {
    return this.room.localParticipant.isMicrophoneEnabled
  }

  get cameraEnabled(): boolean {
    return this.room.localParticipant.isCameraEnabled
  }

  /**
   * Whether the person wants their microphone on — what to carry across a room switch.
   *
   * Not `microphoneEnabled`: that is read from the published track and stays `false` from the
   * moment a publish starts until it completes (`getUserMedia` plus publishing, a few hundred
   * ms), and `false` for good once the room it belongs to is disconnected. Handing that over made
   * a person who left a private room right after joining it come back to the office muted
   * (issue #239). The intent is recorded synchronously when the person (or a room hand-off)
   * asks, survives a rejected publish so the next room can retry it, and while busy it is what
   * `endBusy` will restore, not the suppression.
   */
  get microphoneIntent(): boolean {
    if (this.busySuppression && this.busySnapshot) {
      return this.busySnapshot.microphoneEnabled
    }
    return this.requestedMicrophone ?? this.microphoneEnabled
  }

  /** Same as `microphoneIntent`, for the camera. */
  get cameraIntent(): boolean {
    if (this.busySuppression && this.busySnapshot) {
      return this.busySnapshot.cameraEnabled
    }
    return this.requestedCamera ?? this.cameraEnabled
  }

  /**
   * Sets both intents up front, synchronously. A room hand-off (`OfficeScene.applyMediaControls`)
   * publishes the microphone, then the camera, one after the other: without this the camera's
   * intent would stay unknown while the microphone publish is still in flight.
   */
  declareIntent(intent: EnabledSnapshot): void {
    this.requestedMicrophone = intent.microphoneEnabled
    this.requestedCamera = intent.cameraEnabled
  }

  get screenShareEnabled(): boolean {
    return this.room.localParticipant.isScreenShareEnabled
  }

  get microphoneFailure(): MediaFailureKind | undefined {
    return this.micFailure
  }

  get cameraFailure(): MediaFailureKind | undefined {
    return this.cameraFailureKind
  }

  get microphoneUnavailable(): boolean {
    return this.micUnavailable
  }

  get cameraUnavailable(): boolean {
    return this.cameraUnavailableFlag
  }

  get screenShareUnsupported(): boolean {
    return !isScreenShareCaptureSupported()
  }

  /**
   * `LocalParticipant extends Participant`, so this already reflects the local participant's
   * own connection (issue #132) — whichever LiveKit room `this.room` is (`office`, or a private
   * zone's isolated room), matching every other getter on this class.
   */
  get connectionQuality(): ConnectionQuality {
    return this.room.localParticipant.connectionQuality
  }

  /**
   * The tier last passed to (or defaulted by) `setScreenShareEnabled` — carried forward across a
   * room switch mid-share (`OfficeScene.applyMediaControls`) the same way `screenShareEnabled`
   * itself is, so reconnecting keeps the quality the person picked rather than resetting it.
   */
  get screenShareQuality(): ScreenShareQualityTier {
    return this.screenShareQualityTier
  }

  /**
   * The "share audio too" choice last passed to (or defaulted by) `setScreenShareEnabled` —
   * carried forward across a room switch the same way `screenShareQuality` is (issue #113).
   */
  get screenShareAudio(): boolean {
    return this.screenShareAudioPreference
  }

  async setMicrophoneEnabled(enabled: boolean): Promise<void> {
    this.requestedMicrophone = enabled
    try {
      await this.room.localParticipant.setMicrophoneEnabled(enabled)
      this.micUnavailable = false
      this.micFailure = undefined
    }
    catch (error) {
      this.micUnavailable = true
      this.micFailure = classifyMediaError(error)
      console.warn('kangeikai: microphone unavailable (permission denied or no device)', error)
    }
  }

  /**
   * Switches to another microphone or camera (issue #245). The room's next capture is always
   * pointed at it; when the person wants that device on (`microphoneIntent` / `cameraIntent`) it is
   * also switched live. Off, it is only remembered and applies when the device is turned on.
   * Saving the choice for later rooms and visits is the caller's job (`DeviceChoiceStore`).
   * Resolves to `false`, with the reason on `microphoneFailure` / `cameraFailure`, when the switch
   * fails (the new device is in use, say) instead of throwing.
   */
  async switchDevice(kind: DeviceKind, deviceId: string): Promise<boolean> {
    applyDeviceChoice(this.room, kind === 'audioinput' ? { audioinput: deviceId } : { videoinput: deviceId })
    const wanted = kind === 'audioinput' ? this.microphoneIntent : this.cameraIntent
    if (!wanted)
      return true

    try {
      await this.room.switchActiveDevice(kind, deviceId)
      return true
    }
    catch (error) {
      if (kind === 'audioinput')
        this.micFailure = classifyMediaError(error)
      else
        this.cameraFailureKind = classifyMediaError(error)
      console.warn(`kangeikai: could not switch the ${kind === 'audioinput' ? 'microphone' : 'camera'}`, error)
      return false
    }
  }

  async setCameraEnabled(enabled: boolean): Promise<void> {
    this.requestedCamera = enabled
    try {
      await this.room.localParticipant.setCameraEnabled(enabled)
      this.cameraUnavailableFlag = false
      this.cameraFailureKind = undefined
    }
    catch (error) {
      this.cameraUnavailableFlag = true
      this.cameraFailureKind = classifyMediaError(error)
      console.warn('kangeikai: camera unavailable (permission denied or no device)', error)
    }
  }

  /**
   * Also rejects if the person cancels the browser's screen/window/tab picker — logged and
   * swallowed the same way as a denied permission, never left to bubble up as an error, and
   * never recorded as unavailable: both cases must stay retriable (issue #115).
   *
   * `quality` (issue #111) and `shareAudio` (issue #113) default to whatever was last applied
   * (or their defaults if never set) — callers that just carry forward an already-running share
   * across a room switch don't need to pass them, while the popover-driven toggle in
   * `+page.svelte` always passes what the person just picked. Only resolved into capture/publish
   * options when actually turning sharing on; a disable call doesn't need them.
   */
  async setScreenShareEnabled(enabled: boolean, quality: ScreenShareQualityTier = this.screenShareQualityTier, shareAudio: boolean = this.screenShareAudioPreference): Promise<void> {
    this.screenShareQualityTier = quality
    this.screenShareAudioPreference = shareAudio
    try {
      if (enabled) {
        const { captureOptions, publishOptions } = resolveScreenShareQuality(quality, shareAudio)
        await this.room.localParticipant.setScreenShareEnabled(true, captureOptions, publishOptions)
      }
      else {
        await this.room.localParticipant.setScreenShareEnabled(false)
      }
    }
    catch (error) {
      console.warn('kangeikai: screen share attempt failed (permission denied or picker cancelled) — retriable', error)
    }
  }

  /**
   * Detaches the screen-share track (and its paired audio track, if "share audio too" was on)
   * from this room *without stopping the capture* (`stopOnUnpublish: false`), so a caller can
   * hand it to `adoptScreenShareTrack` on a different room's `MediaControls` instead of losing
   * it — the private-area room switch continuity fix (issue #116). Must be called before this
   * room disconnects, or the track gets force-stopped along with everything else.
   *
   * Returns `undefined` if nothing is currently sharing.
   */
  async detachScreenShareTrack(): Promise<ScreenShareHandoff | undefined> {
    const videoTrack = this.room.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track
    if (!videoTrack) {
      return undefined
    }
    const audioTrack = this.room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio)?.track
    await this.room.localParticipant.unpublishTrack(videoTrack, false)
    if (audioTrack) {
      await this.room.localParticipant.unpublishTrack(audioTrack, false)
    }
    return { videoTrack, audioTrack, quality: this.screenShareQualityTier, shareAudio: this.screenShareAudioPreference }
  }

  /**
   * Republishes a track handed off by `detachScreenShareTrack` onto this room instead of
   * capturing a fresh one — the still-live `MediaStreamTrack` just gets a new RTP sender, no
   * `getDisplayMedia()` prompt (issue #116). Throws if the republish itself fails (e.g. the new
   * room rejects it, or the track ended mid-transition) — callers decide how to surface that,
   * since it's a genuine failure, unlike a normal `setScreenShareEnabled` rejection.
   */
  async adoptScreenShareTrack(handoff: ScreenShareHandoff): Promise<void> {
    this.screenShareQualityTier = handoff.quality
    this.screenShareAudioPreference = handoff.shareAudio
    const { publishOptions } = resolveScreenShareQuality(handoff.quality, handoff.shareAudio)
    await this.room.localParticipant.publishTrack(handoff.videoTrack, publishOptions)
    if (handoff.audioTrack) {
      await this.room.localParticipant.publishTrack(handoff.audioTrack)
    }
  }

  /**
   * Copies busy suppression + pre-busy snapshot from a previous instance (room switch).
   * Does not touch LiveKit tracks.
   */
  adoptBusyState(from: MediaControls | undefined): void {
    if (!from || !from.busySuppression) {
      return
    }
    this.busySuppression = true
    this.busySnapshot = from.busySnapshot
      ? { ...from.busySnapshot }
      : null
  }

  /**
   * Unpublishes mic and camera while busy. A second call does not rewrite the snapshot.
   */
  async beginBusy(intended?: EnabledSnapshot): Promise<void> {
    if (!this.busySuppression) {
      this.busySnapshot = intended
        ? { ...intended }
        : {
            microphoneEnabled: this.microphoneIntent,
            cameraEnabled: this.cameraIntent,
          }
      this.busySuppression = true
    }
    await this.setMicrophoneEnabled(false)
    await this.setCameraEnabled(false)
  }

  /**
   * Restores the pre-busy snapshot and clears suppression. No-op if not busy.
   */
  async endBusy(): Promise<void> {
    if (!this.busySuppression) {
      return
    }
    const snapshot = this.busySnapshot
    this.busySuppression = false
    this.busySnapshot = null
    if (!snapshot) {
      return
    }
    await this.setMicrophoneEnabled(snapshot.microphoneEnabled)
    await this.setCameraEnabled(snapshot.cameraEnabled)
  }
}
