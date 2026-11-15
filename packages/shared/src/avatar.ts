import type { CharacterSelection } from './character'

/** The allowed values live here once; the types below and the office protocol's schemas derive from them. */
export const AVATAR_DIRECTIONS = ['up', 'down', 'left', 'right'] as const
export const AVATAR_MOTION_STATES = ['idle', 'walking', 'sprinting'] as const
export const AVATAR_SPRITE_TYPES = ['man', 'woman'] as const
export const AVATAR_PRESENCES = ['available', 'busy'] as const

export type AvatarDirection = (typeof AVATAR_DIRECTIONS)[number]
export type AvatarMotionState = (typeof AVATAR_MOTION_STATES)[number]
export type AvatarSpriteType = (typeof AVATAR_SPRITE_TYPES)[number]
export type AvatarPresence = (typeof AVATAR_PRESENCES)[number]

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
