import { deviceStatusText } from '$lib/av/devices/device-status-text'
import { describe, expect, it } from 'vitest'

describe('deviceStatusText (issue #246)', () => {
  it('says nothing while a device works, is starting, or was switched off on purpose', () => {
    for (const status of ['on', 'starting', 'off'] as const) {
      expect(deviceStatusText('camera', status)).toBeUndefined()
      expect(deviceStatusText('microphone', status)).toBeUndefined()
    }
  })

  it('explains each failure in terms of what the person can do', () => {
    expect(deviceStatusText('camera', 'blocked')).toBe('Camera blocked. Allow it in your browser\'s site settings, then reload.')
    expect(deviceStatusText('microphone', 'blocked')).toBe('Microphone blocked. Allow it in your browser\'s site settings, then reload.')
    expect(deviceStatusText('camera', 'not-found')).toBe('No camera found.')
    expect(deviceStatusText('microphone', 'not-found')).toBe('No microphone found.')
    expect(deviceStatusText('camera', 'in-use')).toBe('Camera is in use by another app.')
    expect(deviceStatusText('microphone', 'in-use')).toBe('Microphone is in use by another app.')
  })

  it('has a generic line for anything else', () => {
    expect(deviceStatusText('camera', 'unknown')).toBe('Couldn\'t start the camera.')
    expect(deviceStatusText('microphone', 'unknown')).toBe('Couldn\'t start the microphone.')
  })
})
