import type { CharacterSelection } from './character'

export type AvatarDirection = 'up' | 'down' | 'left' | 'right'
export type AvatarMotionState = 'idle' | 'walking' | 'sprinting'
export type AvatarSpriteType = 'man' | 'woman'
export type AvatarPresence = 'available' | 'busy'

export const MAX_NAME_LENGTH = 24

export interface AvatarState {
  displayName: string
  x: number
  y: number
  direction: AvatarDirection
  motionState: AvatarMotionState
  spriteType: AvatarSpriteType
  presence: AvatarPresence
  /**
   * Set only at join time (issue #171) — never re-sent on `updateState`, so mid-session avatar
   * re-edits don't propagate live (deliberately out of scope). `undefined` for a guest with no
   * Character Creator selection, in which case `spriteType` above is what actually renders
   * (issue #169's fallback decision).
   */
  characterSelection?: CharacterSelection
}
