import { playNotificationSound } from '$lib/ui/notification-sound'
import { describe, expect, it, vi } from 'vitest'

interface FakeOscillator {
  type: string
  frequency: { value: number }
  connect: ReturnType<typeof vi.fn>
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
}

interface FakeGain {
  connect: ReturnType<typeof vi.fn>
  gain: { setValueAtTime: ReturnType<typeof vi.fn>, exponentialRampToValueAtTime: ReturnType<typeof vi.fn> }
}

/** Minimal fake matching what `playNotificationSound` actually touches on `AudioContext`. */
function createFakeAudioContextClass(): { instances: { oscillators: FakeOscillator[], gains: FakeGain[], closed: boolean } [], AudioContextClass: new () => AudioContext } {
  const instances: { oscillators: FakeOscillator[], gains: FakeGain[], closed: boolean }[] = []

  class FakeAudioContext {
    currentTime = 0
    destination = {}
    private readonly record: { oscillators: FakeOscillator[], gains: FakeGain[], closed: boolean } = { oscillators: [], gains: [], closed: false }

    constructor() {
      instances.push(this.record)
    }

    createOscillator(): FakeOscillator {
      const oscillator: FakeOscillator = {
        type: '',
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      }
      this.record.oscillators.push(oscillator)
      return oscillator
    }

    createGain(): FakeGain {
      const gain: FakeGain = {
        connect: vi.fn(),
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      }
      this.record.gains.push(gain)
      return gain
    }

    close(): Promise<void> {
      this.record.closed = true
      return Promise.resolve()
    }
  }

  return { instances, AudioContextClass: FakeAudioContext as unknown as new () => AudioContext }
}

describe('playNotificationSound', () => {
  it('is a silent no-op when no AudioContext class is available', () => {
    expect(() => playNotificationSound('hello', undefined)).not.toThrow()
  })

  it('creates and starts one oscillator per note in the hello tone', () => {
    const { instances, AudioContextClass } = createFakeAudioContextClass()

    playNotificationSound('hello', AudioContextClass)

    expect(instances).toHaveLength(1)
    const [instance] = instances
    // hello is a two-note chime — see notification-sound.ts's TONES table.
    expect(instance.oscillators).toHaveLength(2)
    expect(instance.oscillators[0].frequency.value).toBe(660)
    expect(instance.oscillators[1].frequency.value).toBe(880)
    for (const oscillator of instance.oscillators) {
      expect(oscillator.type).toBe('sine')
      expect(oscillator.start).toHaveBeenCalledOnce()
      expect(oscillator.stop).toHaveBeenCalledOnce()
    }
  })

  it('connects each oscillator through a gain node to the destination', () => {
    const { instances, AudioContextClass } = createFakeAudioContextClass()

    playNotificationSound('hello', AudioContextClass)

    const [instance] = instances
    expect(instance.gains).toHaveLength(2)
    for (const gain of instance.gains) {
      expect(gain.connect).toHaveBeenCalledOnce()
      expect(gain.gain.setValueAtTime).toHaveBeenCalledOnce()
      expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalledOnce()
    }
  })

  it('creates a distinct, shorter/higher-pitched pair of beeps for the attention tone', () => {
    const { instances, AudioContextClass } = createFakeAudioContextClass()

    playNotificationSound('attention', AudioContextClass)

    expect(instances).toHaveLength(1)
    const [instance] = instances
    expect(instance.oscillators).toHaveLength(2)
    // Both beeps share the same (higher than hello's) pitch, unlike hello's rising two notes.
    expect(instance.oscillators[0].frequency.value).toBe(1046)
    expect(instance.oscillators[1].frequency.value).toBe(1046)
  })

  it('swallows an error thrown by the AudioContext constructor instead of throwing', () => {
    class ThrowingAudioContext {
      constructor() {
        throw new Error('autoplay blocked')
      }
    }

    expect(() => playNotificationSound('hello', ThrowingAudioContext as unknown as new () => AudioContext)).not.toThrow()
  })
})
