import type { AvatarDirection, AvatarMotionState, AvatarPresence, AvatarSpriteType } from '@kangeikai/shared'
import { Schema, type } from '@colyseus/schema'

/** Colyseus state-sync mirror of packages/shared/src/avatar.ts's AvatarState. */
export class AvatarSchema extends Schema {
  @type('string') displayName = ''
  @type('number') x = 0
  @type('number') y = 0
  @type('string') direction: AvatarDirection = 'down'
  @type('string') motionState: AvatarMotionState = 'idle'
  @type('string') spriteType: AvatarSpriteType = 'man'
  @type('string') presence: AvatarPresence = 'available'
  /**
   * JSON-encoded `CharacterSelection` (issue #171), empty string for none — Colyseus schemas
   * don't need a dedicated nested type for something this small and join-time-only; the client
   * parses it back in `room-connection.ts`'s `toAvatarSnapshot`.
   */
  @type('string') characterSelection = ''

  /**
   * Deliberately NOT `@type`-annotated — this is server-only bookkeeping for `OfficeRoom.onJoin`'s
   * duplicate-avatar dedup (issue #178), never synced to any client.
   */
  guestId = ''
}
