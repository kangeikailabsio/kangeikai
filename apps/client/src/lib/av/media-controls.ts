import type { Room } from 'livekit-client'

interface EnabledSnapshot {
  microphoneEnabled: boolean
  cameraEnabled: boolean
}

/**
 * Controls the local participant's own microphone/camera publishing (FR-004/FR-005).
 *
 * `setMicrophoneEnabled`/`setCameraEnabled` never throw: a denied permission or missing
 * device (spec.md US3) is caught and recorded as `microphoneUnavailable`/`cameraUnavailable`
 * instead, so callers (the auto-enable attempt on connect, and the UI's toggle buttons) can
 * treat it as a normal state to disable/label around rather than an error to handle.
 */
export class MediaControls {
  private micUnavailable = false
  private cameraUnavailableFlag = false
  private busySuppression = false
  private busySnapshot: EnabledSnapshot | null = null

  constructor(private readonly room: Room) {}

  get microphoneEnabled(): boolean {
    return this.room.localParticipant.isMicrophoneEnabled
  }

  get cameraEnabled(): boolean {
    return this.room.localParticipant.isCameraEnabled
  }

  get microphoneUnavailable(): boolean {
    return this.micUnavailable
  }

  get cameraUnavailable(): boolean {
    return this.cameraUnavailableFlag
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
