import { chooseDevice, deviceMenuContent } from '$lib/av/devices/device-menu-model'
import { describe, expect, it, vi } from 'vitest'

const headset = { deviceId: 'headset', label: 'Headset' }
const builtIn = { deviceId: 'built-in', label: 'Built-in mic' }
const systemDefault = { deviceId: 'default', label: 'Default' }

describe('deviceMenuContent (issue #247)', () => {
  it('marks the saved device as the current one', () => {
    const content = deviceMenuContent({ options: [builtIn, headset], choice: { audioinput: 'headset' }, device: 'audioinput', failure: undefined })

    expect(content).toEqual({
      kind: 'devices',
      entries: [{ ...builtIn, current: false }, { ...headset, current: true }],
    })
  })

  it('falls back to the browser default when the saved device is gone, then to the first one', () => {
    const withDefault = deviceMenuContent({ options: [builtIn, systemDefault], choice: { audioinput: 'unplugged' }, device: 'audioinput', failure: undefined })
    const without = deviceMenuContent({ options: [builtIn, headset], choice: {}, device: 'audioinput', failure: undefined })

    expect(withDefault.kind === 'devices' && withDefault.entries.find(entry => entry.current)?.deviceId).toBe('default')
    expect(without.kind === 'devices' && without.entries.find(entry => entry.current)?.deviceId).toBe('built-in')
  })

  it('reads the choice of its own kind only', () => {
    const content = deviceMenuContent({ options: [builtIn, headset], choice: { audioinput: 'headset', videoinput: 'built-in' }, device: 'videoinput', failure: undefined })

    expect(content.kind === 'devices' && content.entries.find(entry => entry.current)?.deviceId).toBe('built-in')
  })

  it('explains why there is nothing to pick, instead of an empty list', () => {
    expect(deviceMenuContent({ options: [], choice: {}, device: 'videoinput', failure: 'blocked' }))
      .toEqual({ kind: 'message', text: 'Camera blocked. Allow it in your browser\'s site settings, then reload.' })
    expect(deviceMenuContent({ options: [], choice: {}, device: 'audioinput', failure: undefined }))
      .toEqual({ kind: 'message', text: 'No microphone found.' })
  })

  it('still lists the devices when the current one fails, so another one can be picked', () => {
    const content = deviceMenuContent({ options: [builtIn, headset], choice: {}, device: 'audioinput', failure: 'in-use' })

    expect(content.kind).toBe('devices')
  })
})

describe('chooseDevice (issue #247)', () => {
  it('remembers the device and switches the room to it', async () => {
    const save = vi.fn()
    const controls = { switchDevice: vi.fn().mockResolvedValue(true) }

    const worked = await chooseDevice(controls, save, 'audioinput', 'headset')

    expect(worked).toBe(true)
    expect(save).toHaveBeenCalledWith('audioinput', 'headset')
    expect(controls.switchDevice).toHaveBeenCalledWith('audioinput', 'headset')
  })

  it('keeps the choice when the switch fails', async () => {
    const save = vi.fn()
    const controls = { switchDevice: vi.fn().mockResolvedValue(false) }

    const worked = await chooseDevice(controls, save, 'videoinput', 'webcam')

    expect(worked).toBe(false)
    expect(save).toHaveBeenCalledWith('videoinput', 'webcam')
  })
})
