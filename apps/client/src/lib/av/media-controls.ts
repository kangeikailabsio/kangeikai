import type { LocalTrack, LocalTrackPublication, Room } from 'livekit-client'
import type { ScreenShareQualityTier } from './screen-share-quality'
import { ParticipantEvent, Track } from 'livekit-client'
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
  private busySuppression = false
  private busySnapshot: EnabledSnapshot | null = null
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

  constructor(private readonly room: Room, private readonly onScreenShareEnded?: () => void) {
    this.room.localParticipant.on(ParticipantEvent.LocalTrackUnpublished, this.handleLocalTrackUnpublished)
  }

  get microphoneEnabled(): boolean {
    return this.room.localParticipant.isMicrophoneEnabled
  }

  get cameraEnabled(): boolean {
    return this.room.localParticipant.isCameraEnabled
  }

  get screenShareEnabled(): boolean {
    return this.room.localParticipant.isScreenShareEnabled
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
    try {
      await this.room.localParticipant.setMicrophoneEnabled(enabled)
      this.micUnavailable = false
    }
    catch (error) {
      this.micUnavailable = true
      console.warn('kangeikai: microphone unavailable (permission denied or no device)', error)
    }
  }

  async setCameraEnabled(enabled: boolean): Promise<void> {
    try {
      await this.room.localParticipant.setCameraEnabled(enabled)
      this.cameraUnavailableFlag = false
    }
    catch (error) {
      this.cameraUnavailableFlag = true
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
            microphoneEnabled: this.microphoneEnabled,
            cameraEnabled: this.cameraEnabled,
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
