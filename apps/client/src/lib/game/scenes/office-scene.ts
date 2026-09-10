import type { ScreenShareHandoff } from '$lib/av/media-controls'
import type { AvatarPosition, ProximityAudioControllerOptions } from '$lib/av/proximity-audio-controller'
import type { ScreenShareQualityTier } from '$lib/av/screen-share-quality'
import type { RemoteVideoOverlayCandidate, VideoOverlayParticipant } from '$lib/av/video-overlay-tiles'
import type { HoverTarget } from '$lib/game/entities/avatar-hover'
import type { CollisionRect } from '$lib/game/map/collision'
import type { PathfindingGrid } from '$lib/game/map/pathfinding'
import type { AvatarDirection, AvatarMotionState, AvatarPresence, AvatarSpriteType, AvatarState, PrivateZone, TiledSpaceObject } from '@kangeikai/shared'
import type { LocalVideoTrack, RemoteVideoTrack, Room } from 'livekit-client'
import avatarManIdleUrl from '$lib/assets/sprites/avatar-man-idle.png?url'
import avatarManWalkUrl from '$lib/assets/sprites/avatar-man-walk.png?url'
import avatarWomanIdleUrl from '$lib/assets/sprites/avatar-woman-idle.png?url'
import avatarWomanWalkUrl from '$lib/assets/sprites/avatar-woman-walk.png?url'
import { MediaControls } from '$lib/av/media-controls'
import { PrivateRoomController } from '$lib/av/private-room-controller'
import { resolvePrivateZoneOccupancy } from '$lib/av/private-room-occupancy'
import { ProximityAudioController } from '$lib/av/proximity-audio-controller'
import { isBusyBlockedByScreenShare } from '$lib/av/screen-share-busy-guard'
import { buildScreenShareGridTiles } from '$lib/av/screen-share-grid'
import { screenShareGridState } from '$lib/av/screen-share-grid-state.svelte'
import { screenShareOverlayState } from '$lib/av/screen-share-overlay-state.svelte'
import { videoOverlayState } from '$lib/av/video-overlay-state.svelte'
import { buildVideoOverlayTiles } from '$lib/av/video-overlay-tiles'
import { BusyPresenceStore } from '$lib/entry/busy-presence-store'
import { clampedCameraCenter, clampZoom, fitToMapZoom } from '$lib/game/camera/camera-math'
import { Avatar, AVATAR_FRAME_RANGES, feetHitbox, getSpriteAnimation, MOTION_STATE_ANIMATIONS } from '$lib/game/entities/avatar'
import { resolveHoverTargetPosition } from '$lib/game/entities/avatar-hover'
import { AvatarNameLabel } from '$lib/game/entities/avatar-name-label'
import { AutoWalkController } from '$lib/game/input/auto-walk-controller'
import { DoubleClickDetector } from '$lib/game/input/double-click-detector'
import { MovementController } from '$lib/game/input/movement-controller'
import { queueActiveMapLoad } from '$lib/game/map/active-map'
import { buildPathfindingGrid, findPath } from '$lib/game/map/pathfinding'
import { resolveRespawnPoint } from '$lib/game/map/respawn-point'
import { RoomConnection } from '$lib/network/room-connection'
import { avatarProfileState } from '$lib/people/avatar-profile-state.svelte'
import { toastState } from '$lib/ui/toast-state.svelte'
import { privateZoneAt, resolvePrivateZones } from '@kangeikai/shared'
import { Track } from 'livekit-client'
import Phaser from 'phaser'

/** Emitted on `game.events` once `MediaControls` is ready (T017 — see +page.svelte). */
export const MEDIA_CONTROLS_READY_EVENT = 'mediacontrols-ready'

/** Emitted on `game.events` when local presence changes (busy unpublish / restore). */
export const LOCAL_PRESENCE_EVENT = 'local-presence'

/**
 * Emitted on `game.events` when the local screen-share track is unpublished for any reason
 * other than a room switch (own toggle, or the browser's native "Stop sharing" control) — see
 * `MediaControls`'s `onScreenShareEnded` callback, wired in `applyMediaControls`.
 */
export const SCREEN_SHARE_ENDED_EVENT = 'screen-share-ended'

/**
 * Emitted on `game.events` with the local participant's current `ConnectionQuality` (issue
 * #132) whenever `MediaControls`'s own LiveKit listener fires — including once immediately on
 * every `MediaControls` construction (room switch), not just on a genuine change.
 */
export const CONNECTION_QUALITY_CHANGED_EVENT = 'connection-quality-changed'

/**
 * Emitted on `game.events` when the Colyseus room join is rejected (most commonly a wrong/
 * missing access code, `OfficeRoom.onAuth`) — `+page.svelte` tears down the game and returns
 * to `EntryForm` on this event, since there's no meaningful in-game state to show otherwise.
 */
export const ROOM_JOIN_FAILED_EVENT = 'room-join-failed'

/**
 * Emitted on `game.events` once the Colyseus room join actually succeeds — `+page.svelte` uses
 * this (rather than assuming success the instant the game is constructed) to know when it's
 * safe to reveal the map, instead of it flashing visible during the connect attempt right
 * before a possible rejection (`ROOM_JOIN_FAILED_EVENT`).
 */
export const ROOM_JOINED_EVENT = 'room-joined'

/**
 * Emitted on `game.events` as soon as `RoomConnection` exists (before `connect()` resolves) —
 * `+page.svelte`'s members sidebar subscribes directly to the instance's event hooks rather
 * than going through this scene's per-frame loop.
 */
export const ROOM_CONNECTION_READY_EVENT = 'room-connection-ready'

/**
 * Cap on remote video tiles shown in the strip at once — beyond this, the closest
 * `MAX_REMOTE_VIDEO_TILES` remain visible and the rest collapse into a single "+N" overflow
 * tile (`updateVideoOverlay`). Keeps tiles legible regardless of how many participants share a
 * zone/proximity radius; audio (`ProximityAudioController`) is unaffected by this cap.
 */
const MAX_REMOTE_VIDEO_TILES = 4

const KEY_TO_DIRECTION: Record<string, AvatarDirection> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
}

/** Either Shift key holds the sprint modifier. */
const SPRINT_KEYS = new Set(['ShiftLeft', 'ShiftRight'])

/** Accent color already used elsewhere in the app (e.g. entry-form.svelte's submit button). */
const WALK_TARGET_MARKER_COLOR = 0xE8A9C9
/** Same red as the busy indicator (avatar-name-label.ts) — reused for "not accessible" feedback. */
const INVALID_TARGET_MARKER_COLOR = 0xEF4444
const TARGET_MARKER_RADIUS_PX = 6
const INVALID_TARGET_MARKER_DURATION_MS = 300
/** "Go to" (issue #159) stops one tile short of the target's exact position, not on top of them — tiles are 32px. */
const GO_TO_STOP_DISTANCE_PX = 32
/** Shown for both an off-map click and an on-map click with no open route to it (#92) — from the user's point of view the result is the same. */
const PATH_UNREACHABLE_MESSAGE = 'Não é possível chegar até aí'

/**
 * Pathfinding grid cell size (#92) — half a tile (tiles are 32px), giving routes room to fit
 * through doorways/gaps without the grid resolution itself being the limiting factor. Cheap at
 * this map's scale (tens of thousands of cells) either way; see pathfinding.ts.
 */
const PATHFINDING_CELL_SIZE_PX = 16

/** Frame width/height for every avatar spritesheet (768x64px, 32px-wide frames — see avatar.ts). */
const AVATAR_FRAME_SIZE = { frameWidth: 32, frameHeight: 64 }

/** Reuses the same accent color — both are "this is an avatar-related highlight" markers. */
const HOVER_RING_COLOR = WALK_TARGET_MARKER_COLOR
const HOVER_RING_STROKE_WIDTH = 2
/** Soft fill so the ring reads as a highlight glow without hiding the sprite art under it. */
const HOVER_RING_FILL_ALPHA = 0.15
/**
 * Radius of both the hover ring and its hit area — what you see is exactly what triggers it.
 */
const AVATAR_HOVER_RADIUS_PX = 36

/**
 * "Spotlight" dimming (issue #151, Gather-style): while the local avatar is inside a private
 * zone, everything outside it — terrain and other avatars alike — dims under a semi-transparent
 * overlay, drawn as four rectangles framing the zone's own (always axis-aligned, per
 * `privateZoneAt`) bounds rather than any Phaser mask — `GeometryMask` is Canvas-renderer only,
 * and this game runs WebGL, but a rectangle-minus-rectangle "picture frame" needs no masking API
 * at all.
 */
const PRIVATE_ZONE_SPOTLIGHT_ALPHA = 0.5
const PRIVATE_ZONE_SPOTLIGHT_FADE_MS = 250
/** Above `AvatarNameLabel`'s `LABEL_DEPTH` (10_000) — dims labels and sprites alike, not just tiles. */
const PRIVATE_ZONE_SPOTLIGHT_DEPTH = 20_000
/**
 * Shifts the ring/hit area down from the raw frame middle, toward the feet — a middle ground
 * between the frame's geometric center and `feetHitbox`'s bottom edge in avatar.ts
 * (`y + SPRITE_HEIGHT / 2`): fully anchoring at the feet needed a much bigger radius to avoid
 * clipping the head (the sprite is top-heavy — a wide hat over comparatively thin legs), which
 * read as too large; this keeps the ring compact while still leaning toward "stands in it"
 * rather than "centered on the torso".
 */
const AVATAR_VISUAL_CENTER_OFFSET_Y = 16

const AVATAR_SPRITE_TYPES: AvatarSpriteType[] = ['man', 'woman']

/**
 * Texture key for a spriteType+segment's spritesheet, e.g. "man-idle". Shared by all four
 * directions' animations, which each play a different frame range from the same sheet.
 */
function avatarTextureKey(spriteType: AvatarSpriteType, segment: 'idle' | 'walk'): string {
  return `${spriteType}-${segment}`
}

/**
 * Native tile size (1 tile-px = 1 screen-px) — the starting zoom on load and the level scroll-
 * wheel zooming (#89) returns toward as you zoom back out, before hitting `minZoom`.
 */
const DEFAULT_ZOOM = 1

/** How much closer scroll-wheel zoom-in can get, relative to `DEFAULT_ZOOM` (#89). */
const MAX_ZOOM = DEFAULT_ZOOM * 2

/**
 * Multiplicative zoom-per-wheel-event factor: `zoom *= exp(-deltaY * WHEEL_ZOOM_SENSITIVITY)`.
 * Exponential (rather than a flat per-event step) keeps a wheel notch feeling like the same
 * proportional zoom change regardless of the current zoom level. Tuned so a typical mouse
 * wheel notch (~100px deltaY) changes zoom by roughly 10%; trackpads report smaller, more
 * frequent deltas and so zoom more smoothly per physical scroll gesture.
 */
const WHEEL_ZOOM_SENSITIVITY = 0.001

/** Duration of the eased `camera.zoomTo` tween triggered by each wheel event (#89). */
const ZOOM_TWEEN_DURATION_MS = 150

interface RemoteAvatarEntry {
  /** `x`/`y` hold the latest raw position received over the network (the interpolation target). */
  avatar: Avatar
  view: Phaser.GameObjects.Sprite
  nameLabel: AvatarNameLabel
  presence: AvatarPresence
  /** Otherwise only readable through `nameLabel` (no getter) — issue #141's pending video-overlay placeholders need it directly. */
  displayName: string
  /** Currently rendered position — eased toward `avatar.x/y` each frame, see `updateRemoteAvatarViews`. */
  renderX: number
  renderY: number
}

/**
 * Exponential-smoothing time constant (seconds) for remote avatar rendering (T026): network
 * updates land in discrete ~50ms steps (`room-connection.ts`'s `SEND_INTERVAL_MS`), but
 * `view.setPosition` used to snap straight to each one, visibly "stepping" on other clients'
 * screens. Easing the rendered position toward the latest received one each frame — instead of
 * jumping to it — smooths that out; the local player is unaffected (fully client-predicted,
 * see `update()`). Distance-based logic (proximity/zone/video ordering) still reads `avatar.x/y`
 * directly, so it always sees the true, un-eased network position.
 */
const REMOTE_AVATAR_SMOOTHING_TAU_SECONDS = 0.08

/**
 * Passed via `game.scene.add('office', OfficeScene, true, data)` — the confirmed guest
 * identity from spec 004's entry flow (`contracts/guest-profile-handoff.md`).
 */
export interface OfficeSceneData {
  displayName: string
  spriteType: AvatarSpriteType
  /**
   * Typed on the entry form; validated server-side (`OfficeRoom.onAuth`, contracts/office-
   * room-protocol.md) — a shared room lock, not part of the guest's identity.
   */
  accessCode: string
}

export class OfficeScene extends Phaser.Scene {
  private readonly movementController = new MovementController()
  private readonly autoWalkController = new AutoWalkController()
  private readonly doubleClickDetector = new DoubleClickDetector()
  private walkTargetMarker: Phaser.GameObjects.Arc | undefined
  private hoveredTarget: HoverTarget | undefined
  private hoverRing: Phaser.GameObjects.Arc | undefined
  private readonly busyPresenceStore = new BusyPresenceStore()
  private readonly roomConnection = new RoomConnection()
  private readonly proximityAudioController = new ProximityAudioController()
  private readonly privateRoomController = new PrivateRoomController()
  private readonly remoteAvatars = new Map<string, RemoteAvatarEntry>()
  private avatar!: Avatar
  private avatarView!: Phaser.GameObjects.Sprite
  private avatarNameLabel!: AvatarNameLabel
  private mapWidthPx = 0
  private mapHeightPx = 0
  /** The map's `collisions` layer, read once in `create()` — also passed to `findPath` for its exact-goal-point check (#92). */
  private colliders: readonly CollisionRect[] = []
  /** Built once from `colliders` in `create()` (#92) — see pathfinding.ts. */
  private pathfindingGrid!: PathfindingGrid
  /**
   * The zoom `handleWheel`/`handleResize` are steering the camera toward (#89) — read back on
   * resize instead of `camera.zoom` since a `zoomTo` tween may still be mid-flight.
   */
  private targetZoom = DEFAULT_ZOOM
  /** Recomputed on `create()`/resize from the current viewport — see `resolveMinZoom` (#89). */
  private minZoom = DEFAULT_ZOOM
  private mapKey!: string
  private displayName!: string
  private spriteType!: AvatarSpriteType
  private accessCode!: string
  private presence: AvatarPresence = 'available'
  private mediaControls: MediaControls | undefined
  /** Tracks the screen-share overlay's previous open state, to edge-trigger `movementController.clear()` (#100) only on the transition into it, not every frame it stays open. */
  private wasScreenShareOverlayExpanded = false
  /** Set only while connected to a private zone's isolated room — `null` means ambient `office` audio is active. */
  private connectedPrivateRoom: Room | null = null
  /** The `spaces` layer's `private: true` objects, read once in `create()` (issue #151's spotlight needs the same zones `PrivateRoomController` already gets). */
  private privateZones: readonly PrivateZone[] = []
  private privateZoneSpotlight!: Phaser.GameObjects.Graphics
  /** The zone the local avatar was in as of the last frame, or `null` — only redraws/re-fades the spotlight on a change, not every frame. */
  private currentSpotlightZoneId: number | null = null
  private spotlightTween: Phaser.Tweens.Tween | undefined
  /**
   * True only between `connectedPrivateRoom` being set and `applyMediaControls` resolving for
   * that room (issue #141) — the window where the local person's own mic/camera capture is
   * still in flight, so `updateVideoOverlay` should show a pending placeholder for the local
   * tile instead of a real (but misleadingly camera/mic-off-looking) one.
   */
  private localMediaConnecting = false
  /**
   * The zone id a private-room connection attempt most recently failed for (issue #142), or
   * `null`. Only ever acted on while `resolvePrivateZoneOccupancy` still reports this exact zone
   * as current — stepping out clears it on its own next frame, mirroring
   * `PrivateRoomController`'s own `failedZoneId` reset. `connectedPrivateRoom` truthy always
   * takes priority over this in `update()`, so a later successful retry needs no explicit
   * handling here beyond `handlePrivateRoomConnect` clearing it for hygiene.
   */
  private localPrivateRoomConnectErrorZoneId: number | null = null

  constructor() {
    super('office')
  }

  init(data: OfficeSceneData): void {
    this.displayName = data.displayName
    this.spriteType = data.spriteType
    this.accessCode = data.accessCode
  }

  preload(): void {
    this.mapKey = queueActiveMapLoad(this).key

    this.load.spritesheet(avatarTextureKey('man', 'idle'), avatarManIdleUrl, AVATAR_FRAME_SIZE)
    this.load.spritesheet(avatarTextureKey('man', 'walk'), avatarManWalkUrl, AVATAR_FRAME_SIZE)
    this.load.spritesheet(avatarTextureKey('woman', 'idle'), avatarWomanIdleUrl, AVATAR_FRAME_SIZE)
    this.load.spritesheet(avatarTextureKey('woman', 'walk'), avatarWomanWalkUrl, AVATAR_FRAME_SIZE)
  }

  create(): void {
    const map = this.make.tilemap({ key: this.mapKey })

    // map.addTilesetImage() looks up a tileset by name and only binds the image to the
    // FIRST match, which silently leaves any later same-named tileset entry's tiles
    // textureless (this bit welcome.tmj in the past — two tileset entries both named
    // "Room_Builder_32x32", same source image, two separate gid ranges). Bind every
    // tileset entry's image directly instead; layer creation resolves each tile's
    // tileset by gid range, not by name, so this is safe even with duplicate names.
    for (const tileset of map.tilesets) {
      tileset.setImage(this.textures.get(tileset.name))
    }

    for (const layerData of map.layers) {
      map.createLayer(layerData.name, map.tilesets, 0, 0)
    }

    this.mapWidthPx = map.widthInPixels
    this.mapHeightPx = map.heightInPixels
    this.minZoom = this.resolveMinZoom(this.cameras.main.width, this.cameras.main.height)
    this.targetZoom = DEFAULT_ZOOM
    this.cameras.main.setZoom(this.targetZoom)

    // The "spaces" object layer's `private: true` objects — each one an isolated conversation
    // room, not an ambient-volume zone (spec 004's private-room refactor).
    const spaceObjects = (map.getObjectLayer('spaces')?.objects ?? []) as TiledSpaceObject[]
    this.privateZones = resolvePrivateZones(spaceObjects)
    this.privateRoomController.setZones(this.privateZones)

    this.privateZoneSpotlight = this.add.graphics()
    this.privateZoneSpotlight.setDepth(PRIVATE_ZONE_SPOTLIGHT_DEPTH)
    this.privateZoneSpotlight.setAlpha(0)

    for (const spriteType of AVATAR_SPRITE_TYPES) {
      for (const motionState of Object.keys(MOTION_STATE_ANIMATIONS) as AvatarMotionState[]) {
        const { textureSegment, frameRate } = MOTION_STATE_ANIMATIONS[motionState]
        const textureKey = avatarTextureKey(spriteType, textureSegment)
        for (const direction of Object.keys(AVATAR_FRAME_RANGES) as AvatarDirection[]) {
          this.anims.create({
            key: getSpriteAnimation(spriteType, motionState, direction).key,
            frames: this.anims.generateFrameNumbers(textureKey, AVATAR_FRAME_RANGES[direction]),
            frameRate,
            repeat: -1,
          })
        }
      }
    }

    // The "respawn" object layer's rectangles mark valid spawn areas — one is picked at random,
    // then a random point inside it, so simultaneous joins don't stack on the same pixel.
    const respawnObjects = (map.getObjectLayer('respawn')?.objects ?? []).map(object => ({
      x: object.x ?? 0,
      y: object.y ?? 0,
      width: object.width ?? 0,
      height: object.height ?? 0,
    }))
    if (respawnObjects.length === 0) {
      console.warn('kangeikai: active map has no "respawn" object layer objects — falling back to the map center')
    }
    const spawnPoint = resolveRespawnPoint(respawnObjects, { x: this.mapWidthPx / 2, y: this.mapHeightPx / 2 })

    this.avatar = new Avatar(spawnPoint.x, spawnPoint.y, this.spriteType, this.mapWidthPx, this.mapHeightPx)

    // The "collisions" object layer's rectangles block the local avatar's movement — every
    // object counts, regardless of name, since none carry a distinguishing custom property.
    const collisionObjects = (map.getObjectLayer('collisions')?.objects ?? []).map(object => ({
      x: object.x ?? 0,
      y: object.y ?? 0,
      width: object.width ?? 0,
      height: object.height ?? 0,
    }))
    this.avatar.setColliders(collisionObjects)
    this.colliders = collisionObjects
    this.pathfindingGrid = buildPathfindingGrid(
      collisionObjects,
      this.mapWidthPx,
      this.mapHeightPx,
      PATHFINDING_CELL_SIZE_PX,
      feetHitbox,
    )

    this.avatarView = this.add.sprite(this.avatar.x, this.avatar.y, avatarTextureKey(this.spriteType, 'idle'))
    this.avatarView.anims.play(getSpriteAnimation(this.avatar.spriteType, this.avatar.motionState, this.avatar.direction).key)
    this.makeAvatarHoverable(this.avatarView, 'local')
    this.avatarNameLabel = new AvatarNameLabel(this, this.avatar.x, this.avatar.y, 'You')

    this.input.keyboard?.on('keydown', this.handleKeyDown, this)
    this.input.keyboard?.on('keyup', this.handleKeyUp, this)
    this.input.on('pointerdown', this.handlePointerDown, this)
    this.input.on('wheel', this.handleWheel, this)
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this)
    this.game.events.on(Phaser.Core.Events.BLUR, this.handleBlur, this)

    // No onRemoteAvatarAdd wiring here: `state.x/y` at add-time is still the server's spawn
    // placeholder (issue #143), not the joining player's real (client-resolved) respawn point.
    // updateRemoteAvatar's fallback below spawns the avatar on the first real position update
    // instead, so it never renders at the placeholder.
    this.roomConnection.onRemoteAvatarChange((sessionId, state) => this.updateRemoteAvatar(sessionId, state))
    this.roomConnection.onRemoteAvatarRemove(sessionId => this.removeRemoteAvatar(sessionId))
    this.game.events.emit(ROOM_CONNECTION_READY_EVENT, this.roomConnection)
    this.presence = this.busyPresenceStore.load()
    this.avatarNameLabel.setPresence(this.presence)
    this.roomConnection.connect({
      displayName: this.displayName,
      spriteType: this.spriteType,
      accessCode: this.accessCode,
      presence: this.presence,
    })
      .then(() => {
        this.game.events.emit(ROOM_JOINED_EVENT)
        this.connectProximityAudio()
      })
      .catch((error: unknown) => {
        console.warn('kangeikai: failed to connect to the shared room', error)
        this.game.events.emit(ROOM_JOIN_FAILED_EVENT)
      })

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown', this.handleKeyDown, this)
      this.input.keyboard?.off('keyup', this.handleKeyUp, this)
      this.input.off('pointerdown', this.handlePointerDown, this)
      this.input.off('wheel', this.handleWheel, this)
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this)
      this.game.events.off(Phaser.Core.Events.BLUR, this.handleBlur, this)
      this.roomConnection.disconnect()
      this.proximityAudioController.disconnect()
      this.privateRoomController.disconnect()
      videoOverlayState.set([])
    })
  }

  /**
   * Only called once `roomConnection.connect()` has resolved, so the local avatar already has
   * a synced position/sessionId from the realtime sync layer (FR-008) — a failure here (e.g.
   * LiveKit unreachable) is caught and logged without affecting movement/presence sync
   * (FR-009's system-independence requirement). Also re-used to return to `office` after a
   * private call ends, carrying forward whatever mic/camera state the person had going into it
   * instead of resetting to the just-joined defaults.
   */
  private connectProximityAudio(micEnabled = true, cameraEnabled = false, screenShareEnabled = false, screenShareQuality?: ScreenShareQualityTier, screenShareAudio = false): void {
    const { sessionId } = this.roomConnection
    if (!sessionId) {
      return
    }

    this.proximityAudioController
      .connect(
        { identity: sessionId, name: this.displayName, proof: this.roomConnection.sessionProof ?? '' },
        { x: this.avatar.x, y: this.avatar.y, presence: this.presence },
      )
      .then(() => this.applyMediaControls(this.proximityAudioController.liveKitRoom, micEnabled, cameraEnabled, screenShareEnabled, screenShareQuality, screenShareAudio))
      .catch((error: unknown) => {
        console.warn('kangeikai: failed to connect proximity audio/video', error)
      })
  }

  /**
   * (Re-)creates `MediaControls` for whichever LiveKit room is now active — `office` or a
   * private zone's isolated room — and applies the given mic/camera/screen-share state to it.
   * A denied permission or missing device (US3) never throws here — `MediaControls` records it
   * as `microphoneUnavailable`/`cameraUnavailable` instead (a failed screen-share attempt is
   * just logged and left retriable — issue #115). Screen share is never (re)started while busy
   * — the HUD button is disabled for that case, and a room switch mid-busy shouldn't start one
   * either.
   *
   * `screenShareHandoff` (issue #116) takes over from `screenShareEnabled`/`screenShareQuality`/
   * `screenShareAudio` for the screen-share portion when present: it republishes an already-live
   * track (`MediaControls.adoptScreenShareTrack`) instead of calling `setScreenShareEnabled`,
   * which would trigger a fresh `getDisplayMedia()` capture. A failed republish is swallowed the
   * same way the rest of this method swallows media failures — mic/camera and the ready events
   * below must still go through — and reported back via the return value instead of a throw, so
   * the caller (`handlePrivateRoomConnect`) can decide whether to surface it (a toast, since it's
   * a genuine failure unlike a normal "share attempt failed, stay retriable" swallow).
   */
  private async applyMediaControls(room: Room, micEnabled: boolean, cameraEnabled: boolean, screenShareEnabled: boolean, screenShareQuality?: ScreenShareQualityTier, screenShareAudio = false, screenShareHandoff?: ScreenShareHandoff): Promise<{ screenShareHandoffFailed: boolean }> {
    const previous = this.mediaControls
    const next = new MediaControls(
      room,
      () => this.game.events.emit(SCREEN_SHARE_ENDED_EVENT),
      quality => this.game.events.emit(CONNECTION_QUALITY_CHANGED_EVENT, quality),
    )
    next.adoptBusyState(previous)
    this.mediaControls = next
    let screenShareHandoffFailed = false
    if (this.presence === 'busy') {
      await next.beginBusy({ microphoneEnabled: micEnabled, cameraEnabled })
    }
    else {
      await next.setMicrophoneEnabled(micEnabled)
      await next.setCameraEnabled(cameraEnabled)
      if (screenShareHandoff) {
        try {
          await next.adoptScreenShareTrack(screenShareHandoff)
        }
        catch (error) {
          screenShareHandoffFailed = true
          console.warn('kangeikai: failed to continue screen share across a room switch', error)
        }
      }
      else {
        await (screenShareQuality
          ? next.setScreenShareEnabled(screenShareEnabled, screenShareQuality, screenShareAudio)
          : next.setScreenShareEnabled(screenShareEnabled))
      }
    }
    this.game.events.emit(MEDIA_CONTROLS_READY_EVENT, next)
    this.game.events.emit(LOCAL_PRESENCE_EVENT, this.presence)
    return { screenShareHandoffFailed }
  }

  async toggleBusyPresence(): Promise<void> {
    await this.setLocalPresence(this.presence === 'busy' ? 'available' : 'busy')
  }

  /**
   * Single source of truth for local busy toggles (keyboard + HUD): updates local state, sends
   * presence to Colyseus, persists the per-tab choice, applies media busy suppression, then
   * notifies the page. Refuses to enter busy while screen sharing (#105) — busy would otherwise
   * leave the screen-share track published behind the AV isolation it promises.
   */
  async setLocalPresence(presence: AvatarPresence): Promise<void> {
    if (presence === this.presence) {
      return
    }
    if (isBusyBlockedByScreenShare(this.mediaControls?.screenShareEnabled ?? false, presence)) {
      toastState.show('Stop sharing your screen to go Busy')
      return
    }
    this.presence = presence
    // Ahead of the media awaits below: the nameplate should never wait on LiveKit to reflect
    // a toggle the person just made.
    this.avatarNameLabel.setPresence(presence)
    if (presence === 'busy') {
      this.movementController.clear()
    }
    this.roomConnection.sendPresence(presence)
    this.busyPresenceStore.save(presence)
    if (presence === 'busy') {
      await this.mediaControls?.beginBusy()
    }
    else {
      await this.mediaControls?.endBusy()
    }
    this.game.events.emit(LOCAL_PRESENCE_EVENT, presence)
  }

  /**
   * `PrivateRoomController` calls this once a zone's 2nd person arrives: leaves `office`'s
   * audio for the duration (a real, isolated call — not just muting) and points media controls/
   * video overlay at the private room instead.
   *
   * This is always an `office → private` transition (`PrivateRoomController.update()` never
   * connects private-to-private directly — it always tears the current one down first), so an
   * active screen share is handed off rather than dropped: detached from `office` before
   * disconnecting from it (issue #116), then republished on the private room once
   * `applyMediaControls` gets there — no interruption, no new `getDisplayMedia()` prompt. If the
   * handoff itself fails (rare — the private room rejects the republish, or the track ended
   * mid-transition), that's a genuine error, surfaced via toast, unlike a normal share-attempt
   * failure which stays silent and retriable.
   */
  private handlePrivateRoomConnect(room: Room): void {
    // A retry (after a previous attempt in this same zone failed) succeeded — hygiene only,
    // `connectedPrivateRoom` truthy already takes priority over the error state in `update()`.
    this.localPrivateRoomConnectErrorZoneId = null
    void this.connectPrivateRoomWithScreenShareHandoff(room)
  }

  /**
   * `PrivateRoomController` calls this when `fetchLiveKitToken`/`room.connect` itself fails
   * (issue #142) — instead of the attempt silently aborting with only a `console.warn`, the
   * local person's own tile in the (would-be) private-room video strip shows an error instead of
   * being stuck on the #141 pending placeholder forever.
   */
  private handlePrivateRoomConnectError(zoneId: number): void {
    this.localPrivateRoomConnectErrorZoneId = zoneId
  }

  private async connectPrivateRoomWithScreenShareHandoff(room: Room): Promise<void> {
    const previous = this.mediaControls
    let screenShareHandoff: ScreenShareHandoff | undefined
    let screenShareHandoffFailed = false
    try {
      screenShareHandoff = await previous?.detachScreenShareTrack()
    }
    catch (error) {
      screenShareHandoffFailed = true
      console.warn('kangeikai: failed to detach screen share ahead of a private-room switch', error)
    }
    this.proximityAudioController.disconnect()
    this.connectedPrivateRoom = room
    this.localMediaConnecting = true
    try {
      const result = await this.applyMediaControls(
        room,
        previous?.microphoneEnabled ?? true,
        previous?.cameraEnabled ?? false,
        false,
        undefined,
        false,
        screenShareHandoff,
      )
      if (screenShareHandoffFailed || result.screenShareHandoffFailed) {
        toastState.show('Couldn\'t continue screen share — try sharing again')
      }
    }
    finally {
      this.localMediaConnecting = false
    }
  }

  /**
   * `PrivateRoomController` calls this once the private call ends (occupancy drops under 2, or
   * the local avatar left the zone): reconnects `office` audio, carrying forward the mic/camera
   * state the person had during the private call.
   *
   * This is always a `private → office` transition, and screen share is never carried forward
   * into it (issue #116) — it stops silently, matching Gather.town's own behavior for this
   * direction; the HUD button and full-screen overlay resolve on their own once
   * `screenShareEnabled` goes back to `false`, the same way they do for a manual "Stop sharing".
   */
  private handlePrivateRoomDisconnect(): void {
    const micEnabled = this.mediaControls?.microphoneEnabled ?? true
    const cameraEnabled = this.mediaControls?.cameraEnabled ?? false
    this.connectedPrivateRoom = null
    this.connectProximityAudio(micEnabled, cameraEnabled, false)
  }

  update(_time: number, delta: number): void {
    const screenShareOverlayOpen = screenShareOverlayState.expanded
    if (screenShareOverlayOpen && !this.wasScreenShareOverlayExpanded) {
      // Same care as setLocalPresence's busy transition: cancel whatever's already pressed so
      // the avatar doesn't keep sliding for a frame before the block below takes effect.
      this.movementController.clear()
    }
    this.wasScreenShareOverlayExpanded = screenShareOverlayOpen

    const manualIntent = (this.presence === 'busy' || screenShareOverlayOpen)
      ? { direction: null, sprint: false }
      : this.movementController.getIntent()

    let intent = manualIntent
    if (manualIntent.direction) {
      // A manual key always wins over an in-progress auto-walk.
      this.autoWalkController.cancel()
      this.clearWalkTargetMarker()
    }
    else if (this.autoWalkController.active) {
      intent = this.autoWalkController.getIntent(this.avatar.x, this.avatar.y)
      if (!this.autoWalkController.active) {
        // Arrived this frame.
        this.clearWalkTargetMarker()
      }
    }

    const previousX = this.avatar.x
    const previousY = this.avatar.y
    this.avatar.update(intent, delta / 1000)

    if (this.autoWalkController.active && this.avatar.x === previousX && this.avatar.y === previousY) {
      // A step was blocked by a collider — stop trying rather than animate against it forever.
      // Should be effectively unreachable now that the path itself is computed against the exact
      // same collision check (#92's pathfindingGrid), but kept as a safety net for grid-cell-
      // boundary edge cases; same "not accessible" feedback as a click that was rejected upfront.
      this.autoWalkController.cancel()
      this.clearWalkTargetMarker()
      toastState.show(PATH_UNREACHABLE_MESSAGE)
    }

    this.avatarView.setPosition(this.avatar.x, this.avatar.y)
    this.avatarNameLabel.setPosition(this.avatar.x, this.avatar.y)

    const animation = getSpriteAnimation(this.avatar.spriteType, this.avatar.motionState, this.avatar.direction)
    if (this.avatarView.anims.currentAnim?.key !== animation.key) {
      this.avatarView.anims.play(animation.key)
    }

    this.updatePrivateZoneSpotlight()

    const camera = this.cameras.main
    const centerX = clampedCameraCenter(this.avatar.x, camera.width / camera.zoom, this.mapWidthPx)
    const centerY = clampedCameraCenter(this.avatar.y, camera.height / camera.zoom, this.mapHeightPx)
    camera.centerOn(centerX, centerY)

    this.roomConnection.sendState({
      x: this.avatar.x,
      y: this.avatar.y,
      direction: this.avatar.direction,
      motionState: this.avatar.motionState,
    })

    const localPosition = { x: this.avatar.x, y: this.avatar.y, presence: this.presence }
    const remotePositions = this.remoteAvatarPositions()

    const { sessionId, sessionProof } = this.roomConnection
    if (sessionId) {
      const options: ProximityAudioControllerOptions = { identity: sessionId, name: this.displayName, proof: sessionProof ?? '' }
      void this.privateRoomController.update(options, localPosition, remotePositions, {
        onConnect: room => this.handlePrivateRoomConnect(room),
        onDisconnect: () => this.handlePrivateRoomDisconnect(),
        onError: zoneId => this.handlePrivateRoomConnectError(zoneId),
      }, () => this.roomConnection.flushPendingState())
    }

    if (this.connectedPrivateRoom) {
      // Isolated, small room — everyone in it is "in the call", no distance falloff needed.
      // Local busy still hides the strip here: this path lists all remoteParticipants, not nearby.
      if (this.presence === 'busy') {
        videoOverlayState.set([])
      }
      else {
        // `occupantSessionIds` (Colyseus position, always accurate) is who's expected in this
        // zone's call; `remoteParticipants` (LiveKit) is who's actually connected so far — the
        // gap between the two is exactly who gets a pending placeholder (issue #141). Recomputed
        // independently here rather than threading it out of `privateRoomController.update()`
        // above: that call is fire-and-forget (its own connect is async), but this needs the
        // same-frame, synchronous answer `updateVideoOverlay` runs on right below.
        const { occupantSessionIds } = resolvePrivateZoneOccupancy(this.privateZones, localPosition, remotePositions)
        const pendingSessionIds = new Set(occupantSessionIds)
        const expectedSessionIds = new Set([...pendingSessionIds, ...this.connectedPrivateRoom.remoteParticipants.keys()])
        this.updateVideoOverlay(expectedSessionIds, this.connectedPrivateRoom, pendingSessionIds)
      }
    }
    else {
      // Still called every frame regardless of the error branch below — proximity audio (office
      // is still the active room whenever a private-room attempt fails, per `PrivateRoomController`
      // only ever disconnecting it on a genuine `onConnect`) must keep having its volumes updated.
      const nearbySessionIds = this.proximityAudioController.update(localPosition, remotePositions)

      if (this.localPrivateRoomConnectErrorZoneId !== null) {
        const { zoneId, occupantSessionIds } = resolvePrivateZoneOccupancy(this.privateZones, localPosition, remotePositions)
        if (zoneId === this.localPrivateRoomConnectErrorZoneId) {
          this.updateVideoOverlayForLocalConnectError(occupantSessionIds)
        }
        else {
          // No longer standing in the zone that failed (issue #142) — stop showing its error
          // tile; PrivateRoomController's own retry-blocking already resets the same way.
          this.localPrivateRoomConnectErrorZoneId = null
          this.updateVideoOverlay(nearbySessionIds, this.proximityAudioController.liveKitRoom)
        }
      }
      else {
        this.updateVideoOverlay(nearbySessionIds, this.proximityAudioController.liveKitRoom)
      }
    }

    this.updateRemoteAvatarViews(delta / 1000)
    this.updateHoverRing()
  }

  /**
   * Eases each remote avatar's rendered position toward its latest network-received
   * `avatar.x/y` instead of snapping to it, smoothing the ~50ms-stepped updates into
   * continuous motion (T026).
   */
  /**
   * Fades the private-zone spotlight in/out as the local avatar crosses a zone boundary
   * (issue #151) — only redraws/re-tweens on an actual zone change, not every frame, since
   * `privateZoneAt` runs here unconditionally on every `update()` tick.
   */
  private updatePrivateZoneSpotlight(): void {
    const zone = privateZoneAt(this.privateZones, this.avatar.x, this.avatar.y)
    const zoneId = zone?.id ?? null
    if (zoneId === this.currentSpotlightZoneId) {
      return
    }
    this.currentSpotlightZoneId = zoneId

    if (zone) {
      this.drawPrivateZoneSpotlightFrame(zone)
    }

    this.spotlightTween?.stop()
    this.spotlightTween = this.tweens.add({
      targets: this.privateZoneSpotlight,
      alpha: zone ? PRIVATE_ZONE_SPOTLIGHT_ALPHA : 0,
      duration: PRIVATE_ZONE_SPOTLIGHT_FADE_MS,
    })
  }

  /**
   * Draws the dimmed area as four rectangles framing `zone`'s bounds (always axis-aligned, per
   * `PrivateZone`) instead of masking — a rectangle-minus-rectangle "picture frame" needs no
   * masking API at all. The shape itself is opaque black; `updatePrivateZoneSpotlight`'s tween
   * on the Graphics object's own alpha is what fades it in/out and caps its final darkness.
   */
  private drawPrivateZoneSpotlightFrame(zone: PrivateZone): void {
    const graphics = this.privateZoneSpotlight
    graphics.clear()
    graphics.fillStyle(0x000000, 1)
    graphics.fillRect(0, 0, this.mapWidthPx, zone.y) // above the zone
    graphics.fillRect(0, zone.y + zone.height, this.mapWidthPx, this.mapHeightPx - (zone.y + zone.height)) // below
    graphics.fillRect(0, zone.y, zone.x, zone.height) // left of the zone, same row
    graphics.fillRect(zone.x + zone.width, zone.y, this.mapWidthPx - (zone.x + zone.width), zone.height) // right
  }

  private updateRemoteAvatarViews(deltaSeconds: number): void {
    const factor = 1 - Math.exp(-deltaSeconds / REMOTE_AVATAR_SMOOTHING_TAU_SECONDS)

    for (const entry of this.remoteAvatars.values()) {
      entry.renderX += (entry.avatar.x - entry.renderX) * factor
      entry.renderY += (entry.avatar.y - entry.renderY) * factor
      entry.view.setPosition(entry.renderX, entry.renderY)
      entry.nameLabel.setPosition(entry.renderX, entry.renderY)
    }
  }

  private remoteAvatarPositions(): ReadonlyMap<string, AvatarPosition> {
    const positions = new Map<string, AvatarPosition>()
    for (const [sessionId, entry] of this.remoteAvatars) {
      positions.set(sessionId, { x: entry.avatar.x, y: entry.avatar.y, presence: entry.presence })
    }
    return positions
  }

  /**
   * Refreshes `videoOverlayState` (T015/T016) with a fixed-position strip: the local
   * participant's tile(s) ("You") first, then the `MAX_REMOTE_VIDEO_TILES` closest nearby
   * ("close enough to hear", `ProximityAudioController.update()`'s return value — same
   * condition per spec.md's US2 acceptance scenarios) remote tiles, screen-share tiles ahead of
   * camera tiles within that cap (#98). Busy identities never appear: a busy local hides the
   * strip entirely, and a busy remote is omitted before tiles (so a camera-off placeholder is
   * not reused as a mute tile). Every visible participant always gets a `kind: 'camera'` tile —
   * camera on or off, a camera-off tile still renders as a placeholder — plus a *second*,
   * separate `kind: 'screen'` tile when that person is sharing their screen (screen share never
   * replaces the camera tile, per #94's grill Q6). Any remaining nearby tiles beyond the cap
   * collapse into a single "+N" overflow tile (still audible/visible in the full grid later —
   * this cap only affects the strip). The strip itself (including "You") is hidden entirely
   * while alone — it only appears once at least one other participant is nearby. `room` is
   * whichever LiveKit room is currently active — `office`, or a private zone's isolated room
   * while one is connected (see `update()`). Also refreshes `screenShareGridState` (#99) from
   * the exact same candidate lists, for the full-screen grid overlay (#100) — every active
   * screen share nearby, with no cap (unlike the strip above).
   *
   * `pendingSessionIds` (issue #141) — only ever non-empty for the private-room call above —
   * marks which of `nearbySessionIds` are expected occupants without a `RemoteParticipant` yet:
   * those get a pending placeholder tile instead of being silently skipped. Omitted (empty) for
   * the general office/proximity call, which keeps its original behavior unchanged: a nearby
   * session without a `RemoteParticipant` yet is just skipped, same as before this issue.
   */
  private updateVideoOverlay(nearbySessionIds: ReadonlySet<string>, room: Room, pendingSessionIds: ReadonlySet<string> = new Set()): void {
    if (this.presence === 'busy') {
      videoOverlayState.set([])
      screenShareGridState.set([])
      return
    }

    const visibleSessionIds = [...nearbySessionIds].filter(
      sessionId => this.remoteAvatars.get(sessionId)?.presence !== 'busy',
    )

    const { localParticipant } = room

    const remotes: RemoteVideoOverlayCandidate[] = []
    for (const sessionId of visibleSessionIds) {
      const participant = room.remoteParticipants.get(sessionId)
      if (!participant) {
        if (pendingSessionIds.has(sessionId)) {
          remotes.push({
            sessionId,
            name: this.remoteAvatars.get(sessionId)?.displayName ?? sessionId,
            pending: true,
            distance: this.distanceToLocal(sessionId),
          })
        }
        continue
      }

      const name = participant.name || sessionId
      const distance = this.distanceToLocal(sessionId)

      remotes.push({
        sessionId,
        name,
        kind: 'camera',
        cameraEnabled: participant.isCameraEnabled,
        micEnabled: participant.isMicrophoneEnabled,
        speaking: participant.isSpeaking,
        videoTrack: participant.getTrackPublication(Track.Source.Camera)?.track as RemoteVideoTrack | undefined,
        distance,
      })

      const screenShareTrack = participant.getTrackPublication(Track.Source.ScreenShare)?.track as RemoteVideoTrack | undefined
      if (screenShareTrack) {
        remotes.push({
          sessionId,
          name,
          kind: 'screen',
          cameraEnabled: participant.isCameraEnabled,
          micEnabled: participant.isMicrophoneEnabled,
          speaking: participant.isSpeaking,
          videoTrack: screenShareTrack,
          distance,
        })
      }
    }

    const localName = localParticipant.name ?? 'You'
    // While the local person's own getUserMedia/media-controls setup is still in flight (issue
    // #141, only true during the private-room connect window), `localParticipant` exists but has
    // no published tracks yet — a real tile here would misleadingly look like a deliberate
    // camera/mic-off choice rather than "still connecting". Screen share can't be relevant yet
    // either (it can't start until this same setup finishes), so this is the tile's only slot.
    const local: VideoOverlayParticipant[] = this.localMediaConnecting
      ? [{ sessionId: localParticipant.identity, name: localName, pending: true }]
      : [{
          sessionId: localParticipant.identity,
          name: localName,
          kind: 'camera',
          cameraEnabled: localParticipant.isCameraEnabled,
          micEnabled: localParticipant.isMicrophoneEnabled,
          speaking: localParticipant.isSpeaking,
          videoTrack: localParticipant.getTrackPublication(Track.Source.Camera)?.track as LocalVideoTrack | undefined,
        }]

    const localScreenShareTrack = this.localMediaConnecting
      ? undefined
      : localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track as LocalVideoTrack | undefined
    if (localScreenShareTrack) {
      local.push({
        sessionId: localParticipant.identity,
        name: localName,
        kind: 'screen',
        cameraEnabled: localParticipant.isCameraEnabled,
        micEnabled: localParticipant.isMicrophoneEnabled,
        speaking: localParticipant.isSpeaking,
        videoTrack: localScreenShareTrack,
      })
    }

    videoOverlayState.set(buildVideoOverlayTiles(local, remotes, MAX_REMOTE_VIDEO_TILES))
    // Full-screen grid overlay (#100): every active share nearby, uncapped — built from the
    // exact same candidate lists as the strip above, just filtered down to the screen ones.
    screenShareGridState.set(buildScreenShareGridTiles(local, remotes))
  }

  /**
   * The local person's own private-room connection attempt failed (issue #142) — no `Room` to
   * read `localParticipant`/`remoteParticipants` from at all, unlike `updateVideoOverlay`, so
   * this builds tiles straight from Colyseus data instead: the local tile shows the error,
   * `occupantSessionIds` (who the zone expects, same source `updateVideoOverlay`'s pending tiles
   * use) all render pending — with no `Room` of our own, whether they've actually connected on
   * their end is unknowable from here either way, so pending is the only honest answer.
   */
  private updateVideoOverlayForLocalConnectError(occupantSessionIds: readonly string[]): void {
    if (this.presence === 'busy') {
      videoOverlayState.set([])
      screenShareGridState.set([])
      return
    }

    const local: VideoOverlayParticipant[] = [{
      sessionId: this.roomConnection.sessionId ?? 'local',
      name: this.displayName,
      error: true,
    }]

    const remotes: RemoteVideoOverlayCandidate[] = occupantSessionIds
      .filter(sessionId => this.remoteAvatars.get(sessionId)?.presence !== 'busy')
      .map(sessionId => ({
        sessionId,
        name: this.remoteAvatars.get(sessionId)?.displayName ?? sessionId,
        pending: true,
        distance: this.distanceToLocal(sessionId),
      }))

    videoOverlayState.set(buildVideoOverlayTiles(local, remotes, MAX_REMOTE_VIDEO_TILES))
    screenShareGridState.set([])
  }

  /** Euclidean distance in map pixels between the local avatar and a remote avatar. */
  private distanceToLocal(sessionId: string): number {
    const remote = this.remoteAvatars.get(sessionId)?.avatar
    if (!remote) {
      return Infinity
    }
    return Math.hypot(remote.x - this.avatar.x, remote.y - this.avatar.y)
  }

  private spawnRemoteAvatar(sessionId: string, state: AvatarState): void {
    const avatar = new Avatar(state.x, state.y, state.spriteType, this.mapWidthPx, this.mapHeightPx)
    avatar.direction = state.direction
    avatar.motionState = state.motionState

    const view = this.add.sprite(avatar.x, avatar.y, avatarTextureKey(avatar.spriteType, 'idle'))
    view.anims.play(getSpriteAnimation(avatar.spriteType, avatar.motionState, avatar.direction).key)
    this.makeAvatarHoverable(view, sessionId)
    const nameLabel = new AvatarNameLabel(this, avatar.x, avatar.y, state.displayName)
    nameLabel.setPresence(state.presence)

    this.remoteAvatars.set(sessionId, { avatar, view, nameLabel, presence: state.presence, displayName: state.displayName, renderX: avatar.x, renderY: avatar.y })
  }

  private updateRemoteAvatar(sessionId: string, state: AvatarState): void {
    const entry = this.remoteAvatars.get(sessionId)
    if (!entry) {
      this.spawnRemoteAvatar(sessionId, state)
      return
    }

    // Only the interpolation target (avatar.x/y) moves here — the rendered `view` position is
    // eased toward it every frame in `updateRemoteAvatarViews`, not snapped to it here.
    entry.avatar.x = state.x
    entry.avatar.y = state.y
    entry.avatar.direction = state.direction
    entry.avatar.motionState = state.motionState
    entry.presence = state.presence
    entry.nameLabel.setPresence(state.presence)

    const animation = getSpriteAnimation(state.spriteType, state.motionState, state.direction)
    if (entry.view.anims.currentAnim?.key !== animation.key) {
      entry.view.anims.play(animation.key)
    }
  }

  private removeRemoteAvatar(sessionId: string): void {
    const entry = this.remoteAvatars.get(sessionId)
    entry?.view.destroy()
    entry?.nameLabel.destroy()
    this.remoteAvatars.delete(sessionId)
    if (this.hoveredTarget === sessionId) {
      this.hoveredTarget = undefined
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.code === 'KeyB') {
      if (!event.repeat) {
        void this.toggleBusyPresence()
      }
      return
    }

    if (SPRINT_KEYS.has(event.code)) {
      this.movementController.pressSprint()
      return
    }
    const direction = KEY_TO_DIRECTION[event.code]
    if (direction) {
      this.movementController.press(direction)
    }
  }

  private handleKeyUp(event: KeyboardEvent): void {
    if (SPRINT_KEYS.has(event.code)) {
      this.movementController.releaseSprint()
      return
    }
    const direction = KEY_TO_DIRECTION[event.code]
    if (direction) {
      this.movementController.release(direction)
    }
  }

  private handleBlur(): void {
    this.movementController.clear()
  }

  /**
   * Scroll-wheel zoom (#89): scales `targetZoom` by an exponential factor of the wheel's deltaY,
   * so each physical scroll gesture reads as the same proportional zoom change regardless of the
   * current zoom level, then tweens the camera toward the clamped result. Always anchored on the
   * avatar rather than the cursor: `update()`'s `camera.centerOn` call already re-centers on it
   * every frame at any zoom, so no separate anchor math is needed here.
   */
  private handleWheel(_pointer: Phaser.Input.Pointer, _currentlyOver: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number): void {
    const factor = Math.exp(-deltaY * WHEEL_ZOOM_SENSITIVITY)
    this.targetZoom = clampZoom(this.targetZoom * factor, this.minZoom, MAX_ZOOM)
    this.cameras.main.zoomTo(this.targetZoom, ZOOM_TWEEN_DURATION_MS)
  }

  /**
   * The zoom at which the whole map fits the viewport (#89) — the floor for scroll-wheel zoom-
   * out, so the user can never zoom out further than "see everything." Clamped to never exceed
   * `DEFAULT_ZOOM`: on a viewport large enough relative to a small map, fitting the whole map
   * would otherwise require zooming *in* past the default, which would put the default (kept as
   * the always-valid starting point) outside the allowed `[minZoom, MAX_ZOOM]` range.
   */
  private resolveMinZoom(viewportWidth: number, viewportHeight: number): number {
    return Math.min(fitToMapZoom(viewportWidth, viewportHeight, this.mapWidthPx, this.mapHeightPx), DEFAULT_ZOOM)
  }

  /**
   * Browser window resize (#89): recomputes `minZoom` for the new viewport. If the camera was
   * sitting exactly at the previous fit-to-map minimum, re-snaps to the new one so the whole map
   * stays visible and centered; otherwise the user's chosen zoom is left alone, only reclamped
   * back into range in case the new minimum now exceeds it.
   */
  private handleResize(): void {
    const camera = this.cameras.main
    const wasAtMinZoom = this.targetZoom === this.minZoom
    this.minZoom = this.resolveMinZoom(camera.width, camera.height)
    this.targetZoom = wasAtMinZoom ? this.minZoom : clampZoom(this.targetZoom, this.minZoom, MAX_ZOOM)
    camera.setZoom(this.targetZoom)
  }

  /**
   * Double-click-to-walk (FR click-to-move): a double-click landing within the map's pixel
   * bounds routes the avatar there around any obstacles in the way (#92's pathfindingGrid) —
   * outside those bounds (the letterboxed margin shown when the viewport shows more than the
   * map, e.g. at the minimum zoom), or on an in-bounds point with no open route to it at all
   * (walled off), shows the same "not accessible" feedback instead. No presence check here:
   * `BusyOverlay`'s full-screen, pointer-events:auto div already intercepts the click before it
   * reaches this canvas.
   *
   * A single (non-double) click reuses `hoveredTarget` — already tracked continuously by
   * `makeAvatarHoverable`'s `pointerover`/`pointerout` — rather than a separate per-sprite click
   * listener: the pointer is necessarily over the avatar at click time, so this is equivalent
   * and avoids the two-listeners-for-one-click ordering questions a sprite-level handler would
   * raise. Opens the avatar profile panel (issue #127) when the click landed on an avatar,
   * closes it otherwise (single click elsewhere on the map = "click outside" the panel). A
   * double-click still walks there regardless — including on an avatar, deliberately not an
   * exception (#127's grill): the first click of that pair still opens/updates the panel (this
   * runs before the `isDoubleClick` check returns early below), the second one just also walks.
   */
  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    const isDoubleClick = this.doubleClickDetector.registerClick({ x: pointer.x, y: pointer.y }, this.time.now)
    if (!isDoubleClick) {
      if (this.hoveredTarget) {
        avatarProfileState.open(this.hoveredTarget)
      }
      else {
        avatarProfileState.close()
      }
      return
    }

    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y)
    if (worldPoint.x < 0 || worldPoint.x > this.mapWidthPx || worldPoint.y < 0 || worldPoint.y > this.mapHeightPx) {
      this.showUnreachableTargetFeedback(worldPoint)
      return
    }

    this.walkTo(worldPoint.x, worldPoint.y)
  }

  /**
   * Shared by click-to-move (`handlePointerDown`) and the "Go to" profile-panel button (issue
   * #159) — pathfinds from the current position to `(x, y)` and starts the walk, or shows the
   * same "unreachable" feedback either way if there's no route.
   */
  private walkTo(x: number, y: number): void {
    const path = findPath(this.pathfindingGrid, this.colliders, feetHitbox, { x: this.avatar.x, y: this.avatar.y }, { x, y })
    if (!path) {
      this.showUnreachableTargetFeedback({ x, y })
      return
    }

    this.autoWalkController.setPath(path)
    this.showWalkTargetMarker({ x, y })
  }

  /**
   * "Go to" (issue #159) — walks to wherever `sessionId`'s avatar currently is, as a one-time
   * snapshot: if they move after this is called, the walk does not retarget (that's "Follow",
   * a separate, not-yet-built feature). A no-op if the session isn't a known remote avatar
   * (already left, or a stale panel reference).
   *
   * Stops `GO_TO_STOP_DISTANCE_PX` short of their exact position — along the straight line from
   * the local avatar's current spot, not their exact tile — so the two avatars don't end up
   * stacked on top of each other. Already within that distance: a no-op, nothing to walk toward.
   */
  walkToAvatar(sessionId: string): void {
    const target = this.remoteAvatars.get(sessionId)
    if (!target) {
      return
    }

    const dx = target.avatar.x - this.avatar.x
    const dy = target.avatar.y - this.avatar.y
    const distance = Math.hypot(dx, dy)
    if (distance <= GO_TO_STOP_DISTANCE_PX) {
      return
    }

    const ratio = (distance - GO_TO_STOP_DISTANCE_PX) / distance
    this.walkTo(this.avatar.x + dx * ratio, this.avatar.y + dy * ratio)
  }

  private showWalkTargetMarker(point: { x: number, y: number }): void {
    this.clearWalkTargetMarker()
    this.walkTargetMarker = this.add.circle(point.x, point.y, TARGET_MARKER_RADIUS_PX, WALK_TARGET_MARKER_COLOR, 0.9)
      .setStrokeStyle(2, WALK_TARGET_MARKER_COLOR)
  }

  private clearWalkTargetMarker(): void {
    this.walkTargetMarker?.destroy()
    this.walkTargetMarker = undefined
  }

  /** Off-map click, or an in-bounds one with no open route to it (#92) — same red flash + toast either way. */
  private showUnreachableTargetFeedback(point: { x: number, y: number }): void {
    const marker = this.add.circle(point.x, point.y, TARGET_MARKER_RADIUS_PX, INVALID_TARGET_MARKER_COLOR, 0.9)
    this.time.delayedCall(INVALID_TARGET_MARKER_DURATION_MS, () => marker.destroy())
    toastState.show(PATH_UNREACHABLE_MESSAGE)
  }

  /**
   * Cosmetic only, no click behavior attached — `pointerover`/`pointerout` are separate event
   * types from `pointerdown`, so this doesn't affect click-to-move's hit-testing at all. The
   * circular hit area is centered on the character's visual center (in frame-space, independent
   * of the sprite's origin), matching where the visual ring is drawn.
   */
  private makeAvatarHoverable(view: Phaser.GameObjects.Sprite, target: HoverTarget): void {
    const hitArea = new Phaser.Geom.Circle(
      AVATAR_FRAME_SIZE.frameWidth / 2,
      AVATAR_FRAME_SIZE.frameHeight / 2 + AVATAR_VISUAL_CENTER_OFFSET_Y,
      AVATAR_HOVER_RADIUS_PX,
    )
    view.setInteractive(hitArea, Phaser.Geom.Circle.Contains)
    view.on('pointerover', () => {
      this.hoveredTarget = target
    })
    view.on('pointerout', () => {
      if (this.hoveredTarget === target) {
        this.hoveredTarget = undefined
      }
    })
  }

  /** Follows the hovered avatar (local or remote) each frame, since it may be walking. */
  private updateHoverRing(): void {
    const remotePositions = new Map(
      [...this.remoteAvatars].map(([sessionId, entry]) => [sessionId, { x: entry.renderX, y: entry.renderY }] as const),
    )
    const position = resolveHoverTargetPosition(this.hoveredTarget, { x: this.avatar.x, y: this.avatar.y }, remotePositions)

    if (!position) {
      this.hoverRing?.destroy()
      this.hoverRing = undefined
      return
    }

    const centerY = position.y + AVATAR_VISUAL_CENTER_OFFSET_Y

    if (!this.hoverRing) {
      this.hoverRing = this.add.circle(position.x, centerY, AVATAR_HOVER_RADIUS_PX, HOVER_RING_COLOR, HOVER_RING_FILL_ALPHA)
        .setStrokeStyle(HOVER_RING_STROKE_WIDTH, HOVER_RING_COLOR)
    }
    this.hoverRing.setPosition(position.x, centerY)
  }
}
