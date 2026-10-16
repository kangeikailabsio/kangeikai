import type { Point } from '@kangeikai/game-pool/aim'
import type { Phase } from '@kangeikai/game-pool/core'
import type { PoolSnapshot } from '@kangeikai/game-pool/protocol'
import { aimAngle, aimDistance, chargeFromDrag, MIN_POWER, MIN_PULL, pullDistance } from '@kangeikai/game-pool/aim'
import { FLOOR_EDGE } from '@kangeikai/game-pool/floor'
import { BALL_RADIUS, canPlaceBall } from '@kangeikai/game-pool/physics'
import { createPrediction } from '@kangeikai/game-pool/predict'
import { createBallTextures, createStaticLayer } from '@kangeikai/game-pool/table-art'
import Phaser from 'phaser'

export interface PoolRendererOptions {
  getState: () => PoolSnapshot | null
  canInteract: () => boolean
  isPlacing: () => boolean
  getPower: () => number
  /** Drives the DOM force control while the cue is being pulled back. */
  setPower: (value: number) => void
  place: (x: number, y: number) => void
  /** The renderer never decides outcomes — the overlay builds and sends the command. */
  shoot: (angle: number, power: number) => void
}

export interface PoolRenderer {
  /** True while the aim is locked — either pulling back, or committed to a shot in flight. */
  charging: () => boolean
  /** Aborts a pull in progress without shooting. */
  cancelCharge: () => void
  /** Fires at the currently aimed angle. The slider/button path goes through here so it locks too. */
  shoot: (power: number) => void
  /** Releases a committed shot's lock after the server rejected it. */
  unlock: () => void
  /** The ScaleManager only re-measures the parent every 500ms; call this after a layout change. */
  refreshScale: () => void
  destroy: () => void
}

const CANVAS_WIDTH = 900
const CANVAS_HEIGHT = 600
/** The table furniture block. Same 868x468 footprint as before, moved down to leave room above. */
const FRAME = { x: 16, y: 72, width: 868, height: 468 }
/** Playfield origin in canvas space — the cloth sits 34px inside the frame block. */
const ORIGIN = { x: FRAME.x + 34, y: FRAME.y + 34 }
/** Floor fades to a flat FLOOR_EDGE band over this height, which the DOM panel gradient continues. */
const FADE_HEIGHT = 112
/** Enough to keep the force slider from re-rendering on frames where the rounded value is unchanged. */
const POWER_EPSILON = 0.005
/** How long the cue follows through into the ball after release, so the strike reads as a strike. */
const FOLLOW_THROUGH_MS = 80

function toTable(x: number, y: number): Point {
  return { x: x - ORIGIN.x, y: y - ORIGIN.y }
}

export function createPoolRenderer(parent: HTMLElement, options: PoolRendererOptions): PoolRenderer {
  let angle = 0
  /** Hover position only. While charging, the aim is frozen and this stops tracking. */
  let pointer = { x: 200, y: 200 }
  /** Non-null means a pull is in progress: the single source of truth for it. */
  let charge: { angle: number, anchor: Point, point: Point, matchId: number, turnId: number } | null = null
  /**
   * The committed shot for this turn. It both prevents a duplicate `shoot` — which the server would
   * reject as a visible error — and keeps the cue pointing where it was struck until the shot
   * resolves. `turnId` always advances on resolution, so it releases itself.
   */
  let sent: { matchId: number, turnId: number, angle: number, power: number, at: number } | null = null
  /** Snapshot scalars, mirrored on arrival so the hot path never touches the reactive proxy. */
  let current: { matchId: number, turnId: number, phase: Phase, cuePlaced: boolean } | null = null
  let previousState: PoolSnapshot | null = null
  let scale: Phaser.Scale.ScaleManager | undefined
  const prediction = createPrediction()

  /**
   * Phaser only binds `mousemove` to the canvas, and the table leaves little margin inside it, so
   * pulling the cue back from a rail immediately exits the canvas. Tracking the drag on `window` and
   * reusing Phaser's own transform keeps hover and drag in one coordinate space.
   */
  function toTableFromPage(pageX: number, pageY: number): Point {
    return toTable(scale?.transformX(pageX) ?? 0, scale?.transformY(pageY) ?? 0)
  }

  function onDragMove(event: PointerEvent): void {
    if (!charge)
      return
    // The button came up somewhere we could not observe (another window, a native menu).
    if (event.pointerType === 'mouse' && (event.buttons & 1) === 0) {
      endCharge(false)
      return
    }
    event.preventDefault()
    charge.point = toTableFromPage(event.pageX, event.pageY)
  }

  function onDragUp(event: PointerEvent): void {
    if (event.button === 0)
      endCharge(true)
  }

  function onDragAbort(): void {
    endCharge(false)
  }

  /** The state a shot can be taken from, or null — shared by the drag and the button. */
  function shootable(): { matchId: number, turnId: number } | null {
    if (!current || !options.canInteract() || options.isPlacing() || current.phase !== 'aiming' || !current.cuePlaced)
      return null
    if (sent && sent.matchId === current.matchId && sent.turnId === current.turnId)
      return null
    const cue = prediction.simulated().find(ball => ball.id === 0)
    return cue && !cue.pocketed ? { matchId: current.matchId, turnId: current.turnId } : null
  }

  function fire(turn: { matchId: number, turnId: number }, aimed: number, power: number, at: number): void {
    sent = { ...turn, angle: aimed, power, at }
    options.shoot(aimed, power)
  }

  function beginCharge(x: number, y: number): void {
    const turn = shootable()
    if (!turn || charge)
      return
    const cue = prediction.simulated().find(ball => ball.id === 0)!
    angle = aimAngle(cue, { x, y })
    charge = { angle, anchor: { x, y }, point: { x, y }, ...turn }
    options.setPower(MIN_POWER)
    window.addEventListener('pointermove', onDragMove, { passive: false })
    window.addEventListener('pointerup', onDragUp)
    window.addEventListener('pointercancel', onDragAbort)
    window.addEventListener('blur', onDragAbort)
  }

  function endCharge(shouldFire: boolean): void {
    if (!charge)
      return
    const shot = charge
    charge = null
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointerup', onDragUp)
    window.removeEventListener('pointercancel', onDragAbort)
    window.removeEventListener('blur', onDragAbort)
    // A bare click would otherwise send a minimum-power shot, which barely moves the cue ball and
    // scores as a foul. Below the dead zone a release just frees the aim again.
    if (!shouldFire || pullDistance(shot.anchor, shot.point, shot.angle) < MIN_PULL)
      return
    fire(shot, shot.angle, chargeFromDrag(shot.anchor, shot.point, shot.angle), performance.now())
  }

  class PoolScene extends Phaser.Scene {
    private drawing!: Phaser.GameObjects.Graphics
    private balls = new Map<number, Phaser.GameObjects.Image>()

    create(): void {
      scale = this.scale
      createStaticLayer(this, { canvasWidth: CANVAS_WIDTH, canvasHeight: CANVAS_HEIGHT, frame: FRAME, origin: ORIGIN, fadeHeight: FADE_HEIGHT })
      const textureOf = createBallTextures(this)
      for (let id = 0; id <= 15; id++)
        this.balls.set(id, this.add.image(0, 0, textureOf(id)).setDepth(1).setVisible(false))
      this.drawing = this.add.graphics().setDepth(2)

      this.input.on('pointermove', (event: Phaser.Input.Pointer) => {
        if (charge)
          return
        pointer = toTable(event.x, event.y)
      })
      this.input.on('pointerdown', (event: Phaser.Input.Pointer) => {
        if (!event.leftButtonDown() || !options.canInteract())
          return
        const { x, y } = toTable(event.x, event.y)
        if (options.isPlacing()) {
          options.place(x, y)
          return
        }
        beginCharge(x, y)
      })
    }

    update(_time: number, delta: number): void {
      const state = options.getState()
      if (state && state !== previousState) {
        previousState = state
        current = { matchId: state.matchId, turnId: state.turnId, phase: state.phase, cuePlaced: state.cuePlaced }
        prediction.adopt(state)
      }
      // Every path that ends the aiming opportunity also has to tear the pull down. Comparing
      // against the key stored when the aim locked cannot miss a turn change by a frame.
      if (!current || !options.canInteract() || options.isPlacing() || current.phase !== 'aiming')
        endCharge(false)
      else if (charge && (charge.matchId !== current.matchId || charge.turnId !== current.turnId))
        endCharge(false)
      if (!current)
        return
      if (sent && (sent.matchId !== current.matchId || sent.turnId !== current.turnId))
        sent = null

      prediction.advance(delta)
      const frames = prediction.frames()
      const resting = !prediction.moving()
      for (const image of this.balls.values())
        image.setVisible(false)
      for (const frame of frames) {
        const image = this.balls.get(frame.id)
        if (!image)
          continue
        // Resting balls land on exact texels; only moving ones carry the resample softness.
        const x = frame.x + ORIGIN.x
        const y = frame.y + ORIGIN.y
        image.setVisible(true).setScale(frame.scale)
        image.setPosition(resting ? Math.round(x) : x, resting ? Math.round(y) : y)
      }

      const graphics = this.drawing.clear()
      if (!options.canInteract())
        return
      const balls = prediction.simulated()
      if (options.isPlacing()) {
        const valid = canPlaceBall(balls, 0, pointer.x, pointer.y)
        graphics.lineStyle(2, valid ? 0xFFE278 : 0xFF6262).strokeCircle(pointer.x + ORIGIN.x, pointer.y + ORIGIN.y, BALL_RADIUS + 2)
        return
      }
      const cue = balls.find(ball => ball.id === 0)
      if (!cue || cue.pocketed)
        return
      const locked = sent && sent.matchId === current.matchId && sent.turnId === current.turnId ? sent : null
      // Hover only steers the aim while nothing is committed: the cue must not swing to wherever the
      // mouse ended up in the moments between release and the server's `moving` snapshot.
      angle = charge ? charge.angle : locked ? locked.angle : aimAngle(cue, pointer)
      const power = charge
        ? chargeFromDrag(charge.anchor, charge.point, charge.angle)
        : locked
          ? locked.power
          : options.getPower()
      // Pushed once per frame rather than per pointer event, rounded to the slider's own step so
      // the thumb cannot jitter between two sub-step values.
      if (charge && Math.abs(power - options.getPower()) >= POWER_EPSILON)
        options.setPower(Math.round(power * 100) / 100)
      const dx = Math.cos(angle)
      const dy = Math.sin(angle)
      const length = aimDistance(balls, cue.x, cue.y, angle)
      const x = cue.x + ORIGIN.x
      const y = cue.y + ORIGIN.y
      // Amber and a deeper recoil both signal the locked aim — a player who has pulled back only a
      // few units still needs to see that the direction is already frozen.
      const committed = Boolean(charge || locked)
      graphics.lineStyle(committed ? 2.5 : 1.5, committed ? 0xFFE278 : 0xFFFFFF, committed ? 0.9 : 0.55)
      for (let d = 15; d < length; d += 14)
        graphics.lineBetween(x + dx * d, y + dy * d, x + dx * Math.min(d + 6, length), y + dy * Math.min(d + 6, length))
      graphics.strokeCircle(x + dx * length, y + dy * length, BALL_RADIUS)
      const strike = locked ? 1 - Math.min(1, (performance.now() - locked.at) / FOLLOW_THROUGH_MS) : 1
      const pull = (18 + power * 55) * strike
      graphics.lineStyle(5, 0xD8B078).lineBetween(x - dx * pull, y - dy * pull, x - dx * (pull + 90), y - dy * (pull + 90))
      graphics.lineStyle(3, 0xC5EEEC).lineBetween(x - dx * pull, y - dy * pull, x - dx * (pull + 7), y - dy * (pull + 7))
    }
  }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    // The scene paints every pixel now, and clearing to the scene's own edge colour means any
    // sub-pixel rounding hairline at the canvas border is invisible.
    backgroundColor: FLOOR_EDGE,
    antialias: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [PoolScene],
    audio: { noAudio: true },
  })
  return {
    charging: () => charge !== null,
    cancelCharge: () => endCharge(false),
    shoot: (power: number) => {
      const turn = shootable()
      if (turn)
        fire(turn, angle, power, performance.now())
    },
    unlock: () => {
      sent = null
    },
    refreshScale: () => game.scale.refresh(),
    // `game.destroy` knows nothing about our window listeners, so drop them first.
    destroy: () => {
      endCharge(false)
      game.destroy(true)
    },
  }
}
