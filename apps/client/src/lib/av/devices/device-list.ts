import type { DeviceKind } from './device-choice-store'
import { Room } from 'livekit-client'

export interface DeviceOption {
  deviceId: string
  label: string
}

const FALLBACK_LABEL: Record<DeviceKind, string> = {
  audioinput: 'Microphone',
  videoinput: 'Camera',
}

/**
 * The devices of one kind, ready for a selector. Browsers leave `label` empty until the person
 * has granted permission, so an unlabelled device is named by kind and position instead of
 * showing a blank option. Entries without an id cannot be selected and are dropped.
 */
export function toDeviceOptions(devices: readonly MediaDeviceInfo[], kind: DeviceKind): DeviceOption[] {
  return devices
    .filter(device => device.kind === kind && device.deviceId !== '')
    .map((device, index) => ({ deviceId: device.deviceId, label: device.label || `${FALLBACK_LABEL[kind]} ${index + 1}` }))
}

/**
 * The saved device if it is still plugged in, otherwise `undefined`, which means "the browser's
 * default". A device that has gone away must never leave a person with nothing selected.
 */
export function resolveDevice(options: readonly DeviceOption[], savedId: string | undefined): string | undefined {
  return savedId !== undefined && options.some(option => option.deviceId === savedId) ? savedId : undefined
}

/**
 * Lists the devices of one kind with no room needed (LiveKit's static method). It never asks for
 * permission by itself: call it once a stream exists, when the browser fills in the labels.
 */
export async function listDevices(kind: DeviceKind): Promise<DeviceOption[]> {
  if (!navigator.mediaDevices)
    return []
  return toDeviceOptions(await Room.getLocalDevices(kind, false), kind)
}

/**
 * Calls `onChange` when a device is plugged in or removed. LiveKit only listens for this inside
 * a room, so the entry screen needs its own. Returns the function that stops listening.
 */
export function watchDevices(onChange: () => void): () => void {
  const devices = navigator.mediaDevices
  if (!devices)
    return () => {}
  devices.addEventListener('devicechange', onChange)
  return () => devices.removeEventListener('devicechange', onChange)
}
