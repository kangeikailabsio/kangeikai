import type { DeviceChoice, DeviceKind } from './device-choice-store'
import type { MediaFailureKind } from './device-error'
import type { DeviceOption } from './device-list'
import { resolveDevice } from './device-list'
import { deviceStatusText } from './device-status-text'

export interface DeviceMenuEntry {
  deviceId: string
  label: string
  current: boolean
}

/** What the menu of a split button shows: the devices to pick from, or the reason there is nothing to pick. */
export type DeviceMenuContent
  = | { kind: 'devices', entries: DeviceMenuEntry[] }
    | { kind: 'message', text: string }

interface DeviceMenuInput {
  options: readonly DeviceOption[]
  choice: DeviceChoice
  device: DeviceKind
  /** Why the device does not work right now, when it does not (`MediaControls.microphoneFailure` / `cameraFailure`). */
  failure: MediaFailureKind | undefined
}

/**
 * The entries of a device menu (issue #247). The current device is the saved one if it is still
 * plugged in, otherwise the browser's `default` entry, otherwise the first one. A failure explains
 * itself instead of an empty list, but a list that has devices always wins: a device that is in
 * use can be left for another one.
 */
export function deviceMenuContent({ options, choice, device, failure }: DeviceMenuInput): DeviceMenuContent {
  if (options.length === 0) {
    const text = deviceStatusText(device === 'audioinput' ? 'microphone' : 'camera', failure ?? 'not-found')
    return { kind: 'message', text: text ?? 'No device found.' }
  }
  const currentId = resolveDevice(options, choice[device])
    ?? options.find(option => option.deviceId === 'default')?.deviceId
    ?? options[0]!.deviceId
  return {
    kind: 'devices',
    entries: options.map(option => ({ ...option, current: option.deviceId === currentId })),
  }
}

export interface DeviceSwitcher {
  switchDevice: (kind: DeviceKind, deviceId: string) => Promise<boolean>
}

/**
 * Picks a device from the menu: always remembered for the next rooms and visits, and switched on
 * the room the person is in (`switchDevice` only does it live when the device is on; off, it just
 * points the next capture at it). Remembered first, so a switch that fails still leaves the choice.
 */
export async function chooseDevice(
  controls: DeviceSwitcher,
  save: (kind: DeviceKind, deviceId: string) => void,
  kind: DeviceKind,
  deviceId: string,
): Promise<boolean> {
  save(kind, deviceId)
  return controls.switchDevice(kind, deviceId)
}
