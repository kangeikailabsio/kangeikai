import { resolveDevice, toDeviceOptions } from '$lib/av/devices/device-list'
import { describe, expect, it } from 'vitest'

function device(kind: MediaDeviceKind, deviceId: string, label: string): MediaDeviceInfo {
  return { kind, deviceId, label, groupId: 'g', toJSON: () => ({}) }
}

describe('toDeviceOptions (issue #245)', () => {
  it('keeps only the wanted kind, in the order the browser lists them', () => {
    const devices = [
      device('audioinput', 'mic-1', 'Built-in Microphone'),
      device('videoinput', 'cam-1', 'FaceTime HD'),
      device('audiooutput', 'out-1', 'Speakers'),
      device('audioinput', 'mic-2', 'USB Headset'),
    ]

    expect(toDeviceOptions(devices, 'audioinput')).toEqual([
      { deviceId: 'mic-1', label: 'Built-in Microphone' },
      { deviceId: 'mic-2', label: 'USB Headset' },
    ])
  })

  it('names a device the browser has not labelled yet (before permission), by kind and position', () => {
    const devices = [device('videoinput', 'cam-1', ''), device('videoinput', 'cam-2', '')]

    expect(toDeviceOptions(devices, 'videoinput')).toEqual([
      { deviceId: 'cam-1', label: 'Camera 1' },
      { deviceId: 'cam-2', label: 'Camera 2' },
    ])
    expect(toDeviceOptions([device('audioinput', 'mic-1', '')], 'audioinput')).toEqual([{ deviceId: 'mic-1', label: 'Microphone 1' }])
  })

  it('drops entries without an id (nothing to select) and lists nothing for an empty list', () => {
    expect(toDeviceOptions([device('audioinput', '', 'Ghost')], 'audioinput')).toEqual([])
    expect(toDeviceOptions([], 'audioinput')).toEqual([])
  })
})

describe('resolveDevice (issue #245)', () => {
  const options = [{ deviceId: 'mic-1', label: 'A' }, { deviceId: 'mic-2', label: 'B' }]

  it('returns the saved device while it is still there', () => {
    expect(resolveDevice(options, 'mic-2')).toBe('mic-2')
  })

  it('falls back to "the default" (undefined) when the saved device is gone or nothing was saved', () => {
    expect(resolveDevice(options, 'unplugged')).toBeUndefined()
    expect(resolveDevice(options, undefined)).toBeUndefined()
    expect(resolveDevice([], 'mic-1')).toBeUndefined()
  })
})
