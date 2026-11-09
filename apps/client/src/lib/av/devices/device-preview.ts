import type { LocalAudioTrack, LocalVideoTrack } from 'livekit-client'
import type { DeviceChoice, DeviceKind } from './device-choice-store'
import type { MediaFailureKind } from './device-error'
import type { MediaIntent } from './media-intent'
import { classifyMediaError } from './device-error'

export type PreviewKind = 'microphone' | 'camera'
export type PreviewStatus = 'starting' | 'on' | 'off' | MediaFailureKind
export type PreviewTrack = LocalAudioTrack | LocalVideoTrack

export interface PreviewDevice {
  /** What the person wants (the switch). A device that failed is still wanted: they enter trying to use it. */
  wanted: boolean
  status: PreviewStatus
  track: PreviewTrack | undefined
}

export interface PreviewSnapshot {
  microphone: PreviewDevice
  camera: PreviewDevice
}

export interface CaptureRequest {
  audio?: true | { deviceId: string }
  video?: true | { deviceId: string }
}

export interface DevicePreviewDeps {
  /** LiveKit's `createLocalTracks`: one `getUserMedia` for everything asked for, so the browser prompts once. */
  createTracks: (request: CaptureRequest) => Promise<PreviewTrack[]>
  loadChoice: () => DeviceChoice
  saveChoice: (kind: DeviceKind, deviceId: string) => void
}

const KINDS: readonly PreviewKind[] = ['microphone', 'camera']

function idleDevice(): PreviewDevice {
  return { wanted: true, status: 'off', track: undefined }
}

/** The state before anything has started: both devices wanted, nothing running. */
export function idleSnapshot(): PreviewSnapshot {
  return { microphone: idleDevice(), camera: idleDevice() }
}

/**
 * The live microphone and camera of the entry screen (issue #246): starts both right away, lets
 * the person switch each one and pick which device, and releases everything on `stop()`.
 *
 * It is independent of the room. Pressing "Enter" stops it, and the room captures again with the
 * chosen devices, the way every switch between rooms already does; the preview tracks are never
 * handed over (LiveKit stops the tracks of a disconnecting room, which would kill them).
 */
export class DevicePreview {
  private devices: Record<PreviewKind, PreviewDevice> = { microphone: idleDevice(), camera: idleDevice() }
  /** True between `stop()` and the next `start()`: nothing may capture, so a device is never left on behind the form. */
  private released = false
  /** Bumped by `stop()`, so a capture that finishes afterwards knows it is stale and discards its tracks. */
  private generation = 0

  constructor(private readonly deps: DevicePreviewDeps, private readonly onChange: (snapshot: PreviewSnapshot) => void) {}

  snapshot(): PreviewSnapshot {
    return { microphone: { ...this.devices.microphone }, camera: { ...this.devices.camera } }
  }

  /** The state to enter the room with: what the switches say. */
  intent(): MediaIntent {
    return { microphoneEnabled: this.devices.microphone.wanted, cameraEnabled: this.devices.camera.wanted }
  }

  /** The id of the device the live track is actually using, for the selector to show. */
  activeDeviceId(kind: DeviceKind): string | undefined {
    const device = this.devices[kind === 'audioinput' ? 'microphone' : 'camera']
    return device.track?.mediaStreamTrack.getSettings().deviceId
  }

  /** Starts every wanted device that is not already running. Also brings the preview back after a `stop()`. */
  async start(): Promise<void> {
    this.released = false
    await this.startKinds(KINDS.filter(kind => this.devices[kind].wanted && !this.devices[kind].track))
  }

  async setWanted(kind: PreviewKind, wanted: boolean): Promise<void> {
    this.patch(kind, { wanted })
    if (!wanted) {
      this.stopKind(kind)
      this.emit()
      return
    }
    if (!this.released && !this.devices[kind].track && this.devices[kind].status !== 'starting')
      await this.startKinds([kind])
  }

  /**
   * Remembers the device for later (the room uses it too) and, when this one is running, switches
   * to it: the old device is released before the new one is captured, the same order the rooms use
   * to avoid a "device busy" error (issue #137). Off, it is only remembered.
   */
  async selectDevice(deviceKind: DeviceKind, deviceId: string): Promise<void> {
    this.deps.saveChoice(deviceKind, deviceId)
    const kind: PreviewKind = deviceKind === 'audioinput' ? 'microphone' : 'camera'
    if (this.released || !this.devices[kind].wanted)
      return
    this.stopKind(kind)
    await this.startKinds([kind], { [deviceKind]: deviceId })
  }

  /** Releases every device now. What the person wanted is kept, so a later `start()` brings it back. */
  stop(): void {
    this.generation += 1
    this.released = true
    for (const kind of KINDS)
      this.stopKind(kind)
    this.emit()
  }

  private request(kinds: readonly PreviewKind[], override: DeviceChoice = {}): CaptureRequest {
    const choice = { ...this.deps.loadChoice(), ...override }
    const request: CaptureRequest = {}
    if (kinds.includes('microphone'))
      request.audio = choice.audioinput ? { deviceId: choice.audioinput } : true
    if (kinds.includes('camera'))
      request.video = choice.videoinput ? { deviceId: choice.videoinput } : true
    return request
  }

  private async startKinds(kinds: readonly PreviewKind[], override: DeviceChoice = {}): Promise<void> {
    if (kinds.length === 0)
      return
    const generation = this.generation
    for (const kind of kinds)
      this.patch(kind, { status: 'starting' })
    this.emit()

    try {
      this.attach(await this.deps.createTracks(this.request(kinds, override)), generation)
    }
    catch (error) {
      if (generation !== this.generation)
        return
      if (kinds.length > 1) {
        // The single request tells nothing about which device is at fault: ask for each on its own.
        for (const kind of kinds)
          await this.startKinds([kind], override)
        return
      }
      this.patch(kinds[0], { status: classifyMediaError(error), track: undefined })
      this.emit()
    }
  }

  private attach(tracks: readonly PreviewTrack[], generation: number): void {
    if (generation !== this.generation) {
      for (const track of tracks)
        track.stop()
      return
    }
    for (const track of tracks) {
      const kind: PreviewKind = track.kind === 'audio' ? 'microphone' : 'camera'
      // Switched off while it was starting: the capture arrives late and must not turn it back on.
      if (!this.devices[kind].wanted) {
        track.stop()
        this.patch(kind, { track: undefined, status: 'off' })
        continue
      }
      this.devices[kind].track?.stop()
      this.patch(kind, { track, status: 'on' })
    }
    this.emit()
  }

  private stopKind(kind: PreviewKind): void {
    this.devices[kind].track?.stop()
    this.patch(kind, { track: undefined, status: 'off' })
  }

  private patch(kind: PreviewKind, change: Partial<PreviewDevice>): void {
    this.devices[kind] = { ...this.devices[kind], ...change }
  }

  private emit(): void {
    this.onChange(this.snapshot())
  }
}
