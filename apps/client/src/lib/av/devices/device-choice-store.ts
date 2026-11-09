import * as v from 'valibot'

/** Single `localStorage` key the chosen microphone and camera are stored under (issue #245). */
export const DEVICE_CHOICE_STORAGE_KEY = 'kangeikai:device-choice'

/** The kinds of device a person can choose: the audio output is not part of this (see the epic's scope). */
export type DeviceKind = 'audioinput' | 'videoinput'

/** The chosen device ids; a kind that is missing means "use the browser's default". */
export interface DeviceChoice {
  audioinput?: string
  videoinput?: string
}

/** An empty or non-string id is no choice. Each field recovers on its own, so one bad value does not lose the other. */
const deviceIdSchema = v.fallback(v.optional(v.pipe(v.string(), v.nonEmpty())), undefined)

const storedChoiceSchema = v.fallback(
  v.object({ audioinput: deviceIdSchema, videoinput: deviceIdSchema }),
  { audioinput: undefined, videoinput: undefined },
)

function withoutUndefined(choice: DeviceChoice): DeviceChoice {
  const result: DeviceChoice = {}
  if (choice.audioinput)
    result.audioinput = choice.audioinput
  if (choice.videoinput)
    result.videoinput = choice.videoinput
  return result
}

/**
 * Wraps `localStorage` for the microphone and camera a person picked. Per browser, not per
 * account: the same person has different devices on a laptop and a desktop. Same broad-catch
 * pattern as `ScreenShareQualityStore`: some browsers throw on `localStorage` access (Safari
 * private browsing), which degrades to "no choice" on read and a silent no-op on write. A saved
 * device that has since been unplugged is not handled here (see `resolveDevice`).
 */
export class DeviceChoiceStore {
  load(): DeviceChoice {
    try {
      const raw = localStorage.getItem(DEVICE_CHOICE_STORAGE_KEY)
      if (raw === null)
        return {}
      return withoutUndefined(v.parse(storedChoiceSchema, JSON.parse(raw)))
    }
    catch {
      return {}
    }
  }

  /** Remembers `deviceId` for one kind, keeping the other kind's choice. */
  choose(kind: DeviceKind, deviceId: string): void {
    try {
      localStorage.setItem(DEVICE_CHOICE_STORAGE_KEY, JSON.stringify({ ...this.load(), [kind]: deviceId }))
    }
    catch {
      // Storage unavailable — the choice still applies for this visit, it just won't stick.
    }
  }
}
