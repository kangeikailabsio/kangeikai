import type { MovementIntent } from '$lib/game/input/movement-controller'
import type { AvatarDirection, AvatarMotionState, AvatarSpriteType, AvatarState } from '@kangeikai/shared'

const SPEED_PX_PER_SECOND = 200
const SPRINT_SPEED_MULTIPLIER = 1.5

const DIRECTION_VECTORS: Record<AvatarDirection, { x: number, y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

/**
 * The purchased character sheets (`avatar-{man,woman}-{idle,walk}.png`, 768×64px, 32px-wide
 * frames — a character-builder export from itch.io) pack all four directions into one row, six
 * frames each, in **right, up, left, down** order (confirmed by the asset's owner — no
 * accompanying frame documentation ships with it).
 */
export const AVATAR_FRAME_RANGES: Record<AvatarDirection, { start: number, end: number }> = {
  right: { start: 0, end: 5 },
  up: { start: 6, end: 11 },
  left: { start: 12, end: 17 },
  down: { start: 18, end: 23 },
}

/**
 * Which spritesheet (`textureSegment`) and Phaser animation `frameRate` each motion state
 * plays. Deliberately separate: a motion state doesn't need its own spritesheet to get its own
 * animation — `textureSegment` picks the frame source, the record key (the motion state)
 * drives the animation's identity/key, so two motion states can share a `textureSegment` while
 * still registering as distinct, independently-rated Phaser animations.
 */
export const MOTION_STATE_ANIMATIONS: Record<AvatarMotionState, { textureSegment: 'idle' | 'walk', frameRate: number }> = {
  idle: { textureSegment: 'idle', frameRate: 4 },
  walking: { textureSegment: 'walk', frameRate: 8 },
  /**
   * No dedicated "run" spritesheet exists — reuses the walk frames at a proportionally higher
   * frame rate (matches SPRINT_SPEED_MULTIPLIER) so the leg cycle keeps pace with the faster
   * movement instead of looking like it's sliding.
   */
  sprinting: { textureSegment: 'walk', frameRate: 8 * SPRINT_SPEED_MULTIPLIER },
}

export interface SpriteAnimation {
  /** Matches the Phaser animation key OfficeScene creates from AVATAR_FRAME_RANGES. */
  key: string
}

export function getSpriteAnimation(spriteType: AvatarSpriteType, motionState: AvatarMotionState, direction: AvatarDirection): SpriteAnimation {
  return {
    key: `${spriteType}-${motionState}-${direction}`,
  }
}

/**
 * Pure position/state logic, decoupled from Phaser rendering (research.md's testability
 * approach) — OfficeScene owns the visual representation and reads `getState()` each frame to
 * sync it. No *interior* obstacle collision yet (tasks.md T013/T021 known gap, deferred past
 * the MVP) — the avatar walks freely through furniture/walls. It IS clamped to the map's outer
 * edges (mapWidthPx/mapHeightPx below), which is a distinct, non-deferred fix: without it the
 * avatar could walk into negative/out-of-map coordinates the camera (clamped to the map bounds)
 * can never scroll to, making it disappear with no way back — found live during Phase 6 testing.
 */
export class Avatar {
  x: number
  y: number
  direction: AvatarDirection = 'down'
  motionState: AvatarMotionState = 'idle'
  readonly spriteType: AvatarSpriteType
  private readonly mapWidthPx: number
  private readonly mapHeightPx: number

  constructor(spawnX: number, spawnY: number, spriteType: AvatarSpriteType, mapWidthPx: number, mapHeightPx: number) {
    this.x = spawnX
    this.y = spawnY
    this.spriteType = spriteType
    this.mapWidthPx = mapWidthPx
    this.mapHeightPx = mapHeightPx
  }

  update(intent: MovementIntent, deltaSeconds: number): void {
    if (intent.direction) {
      this.direction = intent.direction
      this.motionState = intent.sprint ? 'sprinting' : 'walking'
      const speed = intent.sprint ? SPEED_PX_PER_SECOND * SPRINT_SPEED_MULTIPLIER : SPEED_PX_PER_SECOND
      const vector = DIRECTION_VECTORS[intent.direction]
      this.x += vector.x * speed * deltaSeconds
      this.y += vector.y * speed * deltaSeconds
      this.x = Math.min(Math.max(this.x, 0), this.mapWidthPx)
      this.y = Math.min(Math.max(this.y, 0), this.mapHeightPx)
    }
    else {
      this.motionState = 'idle'
    }
  }

  getState(): Omit<AvatarState, 'displayName'> {
    return {
      x: this.x,
      y: this.y,
      direction: this.direction,
      motionState: this.motionState,
      spriteType: this.spriteType,
    }
  }
}
