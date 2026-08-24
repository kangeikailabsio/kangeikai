export type AvatarDirection = 'up' | 'down' | 'left' | 'right'
export type AvatarMotionState = 'idle' | 'walking' | 'sprinting'
export type AvatarSpriteType = 'man' | 'woman'

export const MAX_NAME_LENGTH = 24

export interface AvatarState {
  displayName: string
  x: number
  y: number
  direction: AvatarDirection
  motionState: AvatarMotionState
  spriteType: AvatarSpriteType
}
