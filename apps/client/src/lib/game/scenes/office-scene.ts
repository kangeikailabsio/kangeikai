import type { AvatarPosition, ProximityAudioControllerOptions } from '$lib/av/proximity-audio-controller'
import type { VideoOverlayEntry } from '$lib/av/video-overlay-state.svelte'
import type { TiledSpaceObject } from '$lib/game/map/private-zones'
import type { AvatarDirection, AvatarMotionState, AvatarPresence, AvatarSpriteType, AvatarState } from '@kangeikai/shared'
import type { LocalVideoTrack, RemoteVideoTrack, Room } from 'livekit-client'
import avatarManIdleUrl from '$lib/assets/sprites/avatar-man-idle.png?url'
import avatarManWalkUrl from '$lib/assets/sprites/avatar-man-walk.png?url'
import avatarWomanIdleUrl from '$lib/assets/sprites/avatar-woman-idle.png?url'
import avatarWomanWalkUrl from '$lib/assets/sprites/avatar-woman-walk.png?url'
import { MediaControls } from '$lib/av/media-controls'
import { PrivateRoomController } from '$lib/av/private-room-controller'
import { ProximityAudioController } from '$lib/av/proximity-audio-controller'
import { videoOverlayState } from '$lib/av/video-overlay-state.svelte'
import { Avatar, AVATAR_FRAME_RANGES, getSpriteAnimation, MOTION_STATE_ANIMATIONS } from '$lib/game/entities/avatar'
import { AvatarNameLabel } from '$lib/game/entities/avatar-name-label'
import { MovementController } from '$lib/game/input/movement-controller'
import { queueActiveMapLoad } from '$lib/game/map/active-map'
import { resolvePrivateZones } from '$lib/game/map/private-zones'
import { resolveRespawnPoint } from '$lib/game/map/respawn-point'
import { RoomConnection } from '$lib/network/room-connection'
import { Track } from 'livekit-client'
import Phaser from 'phaser'

/** Emitted on `game.events` once `MediaControls` is ready (T017 — see +page.svelte). */
export const MEDIA_CONTROLS_READY_EVENT = 'mediacontrols-ready'

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

/** Frame width/height for every avatar spritesheet (768x64px, 32px-wide frames — see avatar.ts). */
const AVATAR_FRAME_SIZE = { frameWidth: 32, frameHeight: 64 }

const AVATAR_SPRITE_TYPES: AvatarSpriteType[] = ['man', 'woman']

/**
 * Texture key for a spriteType+segment's spritesheet, e.g. "man-idle". Shared by all four
 * directions' animations, which each play a different frame range from the same sheet.
 */
function avatarTextureKey(spriteType: AvatarSpriteType, segment: 'idle' | 'walk'): string {
  return `${spriteType}-${segment}`
}

/**
 * Fixed at native tile size (1 tile-px = 1 screen-px), matching Gather's approach: a fixed,
 * comfortable zoom level rather than scaling to fit the screen — Gather's maps are simply
 * authored large enough that panning (FR-006) is the norm, not an edge case. This test map
 * (welcome.tmj) is smaller than that today, so it leaves empty margin on large screens; that's
 * expected to resolve itself once the real map is built out larger, not something to compensate
 * for here. User-controlled zoom (Gather has scroll-wheel zoom in/out) is a separate, not yet
 * scoped feature — this is only the fixed base zoom.
 */
const CAMERA_ZOOM = 1

/**
 * Camera scroll for one axis, in world units. When the (zoom-adjusted) viewport is smaller than
 * the map, follows the avatar centered, clamped so the camera never shows area outside the map
 * (FR-006). When the viewport is *larger* than the map along this axis (e.g. a wide monitor and
 * the current, smaller-than-typical office map), the whole map already fits — statically center
 * it rather than panning within the slack space, which would otherwise bias the map toward
 * whichever edge the avatar is nearest (not what "keep the avatar in view" should look like when
 * the avatar, and everything else, is already always in view).
 */
function clampedCameraScroll(avatarPos: number, viewportSize: number, mapSize: number): number {
  if (mapSize <= viewportSize) {
    return (mapSize - viewportSize) / 2
  }
  const desired = avatarPos - viewportSize / 2
  return Math.min(Math.max(desired, 0), mapSize - viewportSize)
}

interface RemoteAvatarEntry {
  /** `x`/`y` hold the latest raw position received over the network (the interpolation target). */
  avatar: Avatar
  view: Phaser.GameObjects.Sprite
  nameLabel: AvatarNameLabel
  presence: AvatarPresence
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
  private readonly roomConnection = new RoomConnection()
  private readonly proximityAudioController = new ProximityAudioController()
  private readonly privateRoomController = new PrivateRoomController()
  private readonly remoteAvatars = new Map<string, RemoteAvatarEntry>()
  private avatar!: Avatar
  private avatarView!: Phaser.GameObjects.Sprite
  private avatarNameLabel!: AvatarNameLabel
  private mapWidthPx = 0
  private mapHeightPx = 0
  private mapKey!: string
  private displayName!: string
  private spriteType!: AvatarSpriteType
  private accessCode!: string
  private mediaControls: MediaControls | undefined
  /** Set only while connected to a private zone's isolated room — `null` means ambient `office` audio is active. */
  private connectedPrivateRoom: Room | null = null
  /** Local presence for occupancy/volume maps. Default until a later card loads sessionStorage / HUD. */
  private presence: AvatarPresence = 'available'

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
    this.cameras.main.setZoom(CAMERA_ZOOM)

    // The "spaces" object layer's `private: true` objects — each one an isolated conversation
    // room, not an ambient-volume zone (spec 004's private-room refactor).
    const spaceObjects = (map.getObjectLayer('spaces')?.objects ?? []) as TiledSpaceObject[]
    this.privateRoomController.setZones(resolvePrivateZones(spaceObjects))

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

    this.avatarView = this.add.sprite(this.avatar.x, this.avatar.y, avatarTextureKey(this.spriteType, 'idle'))
    this.avatarView.anims.play(getSpriteAnimation(this.avatar.spriteType, this.avatar.motionState, this.avatar.direction).key)
    this.avatarNameLabel = new AvatarNameLabel(this, this.avatar.x, this.avatar.y, 'You')

    this.input.keyboard?.on('keydown', this.handleKeyDown, this)
    this.input.keyboard?.on('keyup', this.handleKeyUp, this)
    this.game.events.on(Phaser.Core.Events.BLUR, this.handleBlur, this)

    this.roomConnection.onRemoteAvatarAdd((sessionId, state) => this.spawnRemoteAvatar(sessionId, state))
    this.roomConnection.onRemoteAvatarChange((sessionId, state) => this.updateRemoteAvatar(sessionId, state))
    this.roomConnection.onRemoteAvatarRemove(sessionId => this.removeRemoteAvatar(sessionId))
    this.roomConnection.connect({ displayName: this.displayName, spriteType: this.spriteType, accessCode: this.accessCode })
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
  private connectProximityAudio(micEnabled = true, cameraEnabled = false): void {
    const { sessionId } = this.roomConnection
    if (!sessionId) {
      return
    }

    this.proximityAudioController
      .connect(
        { identity: sessionId, name: this.displayName, proof: this.roomConnection.sessionProof ?? '' },
        { x: this.avatar.x, y: this.avatar.y, presence: this.presence },
      )
      .then(() => this.applyMediaControls(this.proximityAudioController.liveKitRoom, micEnabled, cameraEnabled))
      .catch((error: unknown) => {
        console.warn('kangeikai: failed to connect proximity audio/video', error)
      })
  }

  /**
   * (Re-)creates `MediaControls` for whichever LiveKit room is now active — `office` or a
   * private zone's isolated room — and applies the given mic/camera state to it. A denied
   * permission or missing device (US3) never throws here — `MediaControls` records it as
   * `microphoneUnavailable`/`cameraUnavailable` instead.
   */
  private async applyMediaControls(room: Room, micEnabled: boolean, cameraEnabled: boolean): Promise<void> {
    const mediaControls = new MediaControls(room)
    this.mediaControls = mediaControls
    await mediaControls.setMicrophoneEnabled(micEnabled)
    await mediaControls.setCameraEnabled(cameraEnabled)
    this.game.events.emit(MEDIA_CONTROLS_READY_EVENT, mediaControls)
  }

  /**
   * `PrivateRoomController` calls this once a zone's 2nd person arrives: leaves `office`'s
   * audio for the duration (a real, isolated call — not just muting) and points media controls/
   * video overlay at the private room instead.
   */
  private handlePrivateRoomConnect(room: Room): void {
    this.proximityAudioController.disconnect()
    this.connectedPrivateRoom = room
    void this.applyMediaControls(room, this.mediaControls?.microphoneEnabled ?? true, this.mediaControls?.cameraEnabled ?? false)
  }

  /**
   * `PrivateRoomController` calls this once the private call ends (occupancy drops under 2, or
   * the local avatar left the zone): reconnects `office` audio, carrying forward the mic/camera
   * state the person had during the private call.
   */
  private handlePrivateRoomDisconnect(): void {
    const micEnabled = this.mediaControls?.microphoneEnabled ?? true
    const cameraEnabled = this.mediaControls?.cameraEnabled ?? false
    this.connectedPrivateRoom = null
    this.connectProximityAudio(micEnabled, cameraEnabled)
  }

  update(_time: number, delta: number): void {
    this.avatar.update(this.movementController.getIntent(), delta / 1000)
    this.avatarView.setPosition(this.avatar.x, this.avatar.y)
    this.avatarNameLabel.setPosition(this.avatar.x, this.avatar.y)

    const animation = getSpriteAnimation(this.avatar.spriteType, this.avatar.motionState, this.avatar.direction)
    if (this.avatarView.anims.currentAnim?.key !== animation.key) {
      this.avatarView.anims.play(animation.key)
    }

    const camera = this.cameras.main
    camera.scrollX = clampedCameraScroll(this.avatar.x, camera.width / camera.zoom, this.mapWidthPx)
    camera.scrollY = clampedCameraScroll(this.avatar.y, camera.height / camera.zoom, this.mapHeightPx)

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
      })
    }

    if (this.connectedPrivateRoom) {
      // Isolated, small room — everyone in it is "in the call", no distance falloff needed.
      this.updateVideoOverlay(new Set(this.connectedPrivateRoom.remoteParticipants.keys()), this.connectedPrivateRoom)
    }
    else {
      const nearbySessionIds = this.proximityAudioController.update(localPosition, remotePositions)
      this.updateVideoOverlay(nearbySessionIds, this.proximityAudioController.liveKitRoom)
    }

    this.updateRemoteAvatarViews(delta / 1000)
  }

  /**
   * Eases each remote avatar's rendered position toward its latest network-received
   * `avatar.x/y` instead of snapping to it, smoothing the ~50ms-stepped updates into
   * continuous motion (T026).
   */
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
   * participant ("You") plus the `MAX_REMOTE_VIDEO_TILES` closest nearby ("close enough to
   * hear", `ProximityAudioController.update()`'s return value — same condition per spec.md's
   * US2 acceptance scenarios) remote participants, closest-first. Each tile shows camera/mic
   * state and video track (if publishing); a camera-off tile still renders (as a placeholder,
   * per the component) rather than being omitted. Any remaining nearby participants beyond the
   * cap collapse into a single "+N" overflow tile (still audible — this cap only affects the
   * video strip, not `ProximityAudioController` volume). The strip itself (including "You") is
   * hidden entirely while alone — it only appears once at least one other participant is
   * nearby. `room` is whichever LiveKit room is currently active — `office`, or a private
   * zone's isolated room while one is connected (see `update()`).
   */
  private updateVideoOverlay(nearbySessionIds: ReadonlySet<string>, room: Room): void {
    if (nearbySessionIds.size === 0) {
      videoOverlayState.set([])
      return
    }

    const { localParticipant } = room

    const closestSessionIds = [...nearbySessionIds].sort((a, b) => this.distanceToLocal(a) - this.distanceToLocal(b))

    const entries: VideoOverlayEntry[] = [{
      sessionId: localParticipant.identity,
      name: localParticipant.name ?? 'You',
      isLocal: true,
      cameraEnabled: localParticipant.isCameraEnabled,
      micEnabled: localParticipant.isMicrophoneEnabled,
      speaking: localParticipant.isSpeaking,
      videoTrack: localParticipant.getTrackPublication(Track.Source.Camera)?.track as LocalVideoTrack | undefined,
    }]

    for (const sessionId of closestSessionIds.slice(0, MAX_REMOTE_VIDEO_TILES)) {
      const participant = room.remoteParticipants.get(sessionId)
      if (!participant) {
        continue
      }

      entries.push({
        sessionId,
        name: participant.name || sessionId,
        isLocal: false,
        cameraEnabled: participant.isCameraEnabled,
        micEnabled: participant.isMicrophoneEnabled,
        speaking: participant.isSpeaking,
        videoTrack: participant.getTrackPublication(Track.Source.Camera)?.track as RemoteVideoTrack | undefined,
      })
    }

    const overflowCount = closestSessionIds.length - MAX_REMOTE_VIDEO_TILES
    if (overflowCount > 0) {
      entries.push({ overflowCount })
    }

    videoOverlayState.set(entries)
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
    const nameLabel = new AvatarNameLabel(this, avatar.x, avatar.y, state.displayName)

    this.remoteAvatars.set(sessionId, { avatar, view, nameLabel, presence: state.presence, renderX: avatar.x, renderY: avatar.y })
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
  }

  private handleKeyDown(event: KeyboardEvent): void {
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
}
