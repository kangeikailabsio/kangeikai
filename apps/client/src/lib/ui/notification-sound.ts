/**
 * Named "tone" rather than one hardcoded sound — a second point-to-point interaction ("chamar
 * atenção", a planned follow-up issue reusing the same client→server→client message
 * infrastructure as "Say Hello", #157) needs its own, different tone, reusing these same
 * Web Audio primitives rather than a copy-pasted player.
 */
export type NotificationTone = 'hello'

interface Note {
  frequency: number
  startOffsetSeconds: number
  durationSeconds: number
}

/** A short, friendly two-note rising chime — no external audio asset (first sound effect in the app). */
const TONES: Record<NotificationTone, readonly Note[]> = {
  hello: [
    { frequency: 660, startOffsetSeconds: 0, durationSeconds: 0.12 },
    { frequency: 880, startOffsetSeconds: 0.1, durationSeconds: 0.15 },
  ],
}

/** Every `Notes`'s note has finished by this many seconds after playback starts. */
function scheduleEndSeconds(notes: readonly Note[]): number {
  return Math.max(...notes.map(note => note.startOffsetSeconds + note.durationSeconds))
}

/**
 * `window.AudioContext` (Safari still needs the `webkit`-prefixed fallback) — `undefined` in any
 * environment without Web Audio support, so `playNotificationSound` can no-op instead of throwing.
 */
function resolveAudioContextClass(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
}

/**
 * Plays `tone` via a few plain oscillators — swallows any failure (autoplay policies vary by
 * browser) rather than letting a notification sound ever break the feature it's decorating.
 * `AudioContextClass` is only ever overridden in tests; real callers always get the resolved
 * browser global.
 */
export function playNotificationSound(tone: NotificationTone = 'hello', AudioContextClass = resolveAudioContextClass()): void {
  if (!AudioContextClass) {
    return
  }

  try {
    const context = new AudioContextClass()
    const notes = TONES[tone]

    for (const note of notes) {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = note.frequency
      oscillator.connect(gain)
      gain.connect(context.destination)

      const startTime = context.currentTime + note.startOffsetSeconds
      const endTime = startTime + note.durationSeconds
      gain.gain.setValueAtTime(0.15, startTime)
      gain.gain.exponentialRampToValueAtTime(0.0001, endTime)
      oscillator.start(startTime)
      oscillator.stop(endTime)
    }

    // Repeated hellos would otherwise accumulate contexts indefinitely — release this one once
    // every scheduled note has finished.
    setTimeout(() => void context.close(), (scheduleEndSeconds(notes) + 0.05) * 1000)
  }
  catch (error) {
    console.warn('kangeikai: failed to play notification sound', error)
  }
}
