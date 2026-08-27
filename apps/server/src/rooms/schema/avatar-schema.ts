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
}
