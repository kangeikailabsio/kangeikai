import type { AvatarPresence } from '@kangeikai/shared'

/**
 * Whether a presence transition to `targetPresence` should be blocked because the person is
 * currently sharing their screen — busy fully unpublishes/isolates AV (`MediaControls.beginBusy`
 * despublishes mic and camera; screen share isn't part of that snapshot), so entering busy while
 * sharing would leave the screen-share track published behind the isolation, leaking media the
 * same way an un-guarded mic/camera would (#94's grill: "só vai poder ficar busy se parar").
 *
 * Only ever blocks entering `'busy'` — leaving busy (`'available'`) is always allowed regardless
 * of `screenShareEnabled`. In practice the two states can't coexist (starting a share is itself
 * disabled while already busy, via the HUD's own `disabled` check), but this never assumes that
 * invariant silently: it only decides the one transition it's asked about.
 */
export function isBusyBlockedByScreenShare(screenShareEnabled: boolean, targetPresence: AvatarPresence): boolean {
  return targetPresence === 'busy' && screenShareEnabled
}
