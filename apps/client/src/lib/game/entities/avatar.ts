import type { MovementIntent } from '$lib/game/input/movement-controller'
import type { CollisionRect } from '$lib/game/map/collision'
import type { AvatarDirection, AvatarMotionState, AvatarSpriteType, AvatarState } from '@kangeikai/shared'
import { collidesWithAny } from '$lib/game/map/collision'

const SPEED_PX_PER_SECOND = 200
const SPRINT_SPEED_MULTIPLIER = 1.5

/** Must match office-scene.ts's AVATAR_FRAME_SIZE — the sprite is center-anchored, so this offsets the collision hitbox down to the sprite's feet instead of its visual middle. */
const SPRITE_HEIGHT = 64

/**
 * Small hitbox at the avatar's feet rather than the full 32×64 sprite — lets the sprite's
 * head/shoulders visually overlap the top of furniture/walls (how these tile-based asset packs
 * are drawn) while only the base actually collides.
 */
const COLLISION_HITBOX_WIDTH = 20
const COLLISION_HITBOX_HEIGHT = 12

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

/** The avatar's collision hitbox at a given position — a small box at its feet, not the full sprite (see COLLISION_HITBOX_WIDTH/HEIGHT). */
function feetHitbox(x: number, y: number): CollisionRect {
  return {
    x: x - COLLISION_HITBOX_WIDTH / 2,
    y: y + SPRITE_HEIGHT / 2 - COLLISION_HITBOX_HEIGHT,
    width: COLLISION_HITBOX_WIDTH,
    height: COLLISION_HITBOX_HEIGHT,
  }
}

/**
 * Pure position/state logic, decoupled from Phaser rendering (research.md's testability
 * approach) — OfficeScene owns the visual representation and reads `getState()` each frame to
 * sync it. Clamped to the map's outer edges (mapWidthPx/mapHeightPx below): without it the
 * avatar could walk into negative/out-of-map coordinates the camera (clamped to the map bounds)
 * can never scroll to, making it disappear with no way back — found live during Phase 6 testing.
 * Also blocked by `colliders` (the map's `collisions` object layer, set via `setColliders`) —
 * movement is single-axis per frame (never diagonal), so a blocked step just doesn't move that
 * frame rather than sliding or snapping to the obstacle's edge.
 */
export class Avatar {
  x: number
  y: number
  direction: AvatarDirection = 'down'
  motionState: AvatarMotionState = 'idle'
  readonly spriteType: AvatarSpriteType
  private readonly mapWidthPx: number
  private readonly mapHeightPx: number
  private colliders: readonly CollisionRect[] = []

  constructor(spawnX: number, spawnY: number, spriteType: AvatarSpriteType, mapWidthPx: number, mapHeightPx: number) {
    this.x = spawnX
    this.y = spawnY
    this.spriteType = spriteType
    this.mapWidthPx = mapWidthPx
    this.mapHeightPx = mapHeightPx
  }

  /** The map's `collisions` object layer, as rectangles the avatar's feet can't walk into. */
  setColliders(colliders: readonly CollisionRect[]): void {
    this.colliders = colliders
  }

  update(intent: MovementIntent, deltaSeconds: number): void {
    if (intent.direction) {
      this.direction = intent.direction
      this.motionState = intent.sprint ? 'sprinting' : 'walking'
      const speed = intent.sprint ? SPEED_PX_PER_SECOND * SPRINT_SPEED_MULTIPLIER : SPEED_PX_PER_SECOND
      const vector = DIRECTION_VECTORS[intent.direction]

      const nextX = Math.min(Math.max(this.x + vector.x * speed * deltaSeconds, 0), this.mapWidthPx)
      const nextY = Math.min(Math.max(this.y + vector.y * speed * deltaSeconds, 0), this.mapHeightPx)

      if (!collidesWithAny(feetHitbox(nextX, nextY), this.colliders)) {
        this.x = nextX
        this.y = nextY
      }
    }
    else {
      this.motionState = 'idle'
    }
  }

  getState(): Omit<AvatarState, 'displayName' | 'presence'> {
    return {
      x: this.x,
      y: this.y,
      direction: this.direction,
      motionState: this.motionState,
      spriteType: this.spriteType,
    }
  }
}
