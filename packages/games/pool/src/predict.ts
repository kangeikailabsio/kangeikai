/**
 * Client-side smoothing for ball motion. The server stays the only authority: this adopts each
 * snapshot as truth and keeps running the *same* `stepPhysics` locally between snapshots, so motion
 * stays continuous instead of reaching the previous snapshot and freezing until the next one lands.
 *
 * It is a smoother, not a predictor — the client's step phase differs from the server's, so a break
 * cluster diverges. Divergence is bounded to one broadcast period of independent integration (both
 * sides advance the same wall-clock interval from the same state, so there is no systematic lag),
 * and the clamp plus decay absorb it. The client never decides pocketing, fouls or turns.
 */
import type { Phase } from '@kangeikai/game-pool/core'
import type { Ball } from '@kangeikai/game-pool/physics'
import { BALL_RADIUS, emptyReport, FIXED_STEP, POCKETS, stepPhysics } from '@kangeikai/game-pool/physics'
import { SNAPSHOT_INTERVAL_MS } from '@kangeikai/game-pool/protocol'

/** Visual error half-life: ~92% of a disagreement is gone after 100ms. */
export const CORRECTION_TAU_MS = 40
/** A disagreement wider than one ball diameter snaps rather than gliding across the cloth. */
export const MAX_VISUAL_ERROR = 2 * BALL_RADIUS
/** Below this the offset is dropped outright, so a resting ball sits exactly where the server says. */
export const SETTLED_ERROR = 0.05
/** How far past the last snapshot the local simulation may run — the disconnect guard. */
export const MAX_PREDICTION_MS = SNAPSHOT_INTERVAL_MS * 5
/** How long a pocketed ball takes to shrink into the pocket instead of vanishing mid-cloth. */
export const SINK_MS = 120

export interface Point {
  x: number
  y: number
}

/** A ball to draw. `scale` shrinks from 1 to 0 while it drops into a pocket. */
export interface PredictedFrame {
  id: number
  x: number
  y: number
  scale: number
}

export interface PredictionInput {
  matchId: number
  turnId: number
  phase: Phase
  balls: readonly Ball[]
}

export interface Prediction {
  /** The only place that reads the snapshot, so proxy access is per-snapshot, not per-frame. */
  adopt: (snapshot: PredictionInput) => void
  advance: (deltaMs: number) => void
  /**
   * Simulated truth — for aim geometry and placement checks, never the decayed render offsets.
   * Owned by the prediction; callers must not mutate it.
   */
  simulated: () => Ball[]
  /** Render positions. The array and its entries are reused between calls; do not retain them. */
  frames: () => readonly PredictedFrame[]
  moving: () => boolean
}

/** Frame-rate independent exponential decay. */
export function decayFactor(deltaMs: number, tauMs = CORRECTION_TAU_MS): number {
  return Math.exp(-Math.max(deltaMs, 0) / tauMs)
}

export function clampOffset(dx: number, dy: number, max = MAX_VISUAL_ERROR): Point {
  const distance = Math.hypot(dx, dy)
  if (distance <= max || distance === 0)
    return { x: dx, y: dy }
  return { x: (dx / distance) * max, y: (dy / distance) * max }
}

export function nearestPocket(x: number, y: number): Point {
  let best = POCKETS[0]
  let bestDistance = Infinity
  for (const pocket of POCKETS) {
    const distance = Math.hypot(pocket.x - x, pocket.y - y)
    if (distance < bestDistance) {
      bestDistance = distance
      best = pocket
    }
  }
  return { x: best.x, y: best.y }
}

interface Sink {
  x: number
  y: number
  px: number
  py: number
  elapsed: number
}

export function createPrediction(): Prediction {
  let sim: Ball[] = []
  let previous: { matchId: number, turnId: number, phase: Phase } | null = null
  let simMoving = false
  let accumulator = 0
  let aheadMs = 0
  let report = emptyReport()
  const offsets = new Map<number, Point>()
  const sinks = new Map<number, Sink>()
  /** Mirrors `sim`'s pocketed flags so a physics step can spot a new pocket without allocating. */
  const pocketedIds = new Set<number>()
  /** Frame objects are pooled and the returned view is truncated in place — a frame allocates nothing. */
  const pool: PredictedFrame[] = []
  const view: PredictedFrame[] = []

  function renderedOf(ball: Ball): Point | null {
    const sink = sinks.get(ball.id)
    if (sink) {
      const progress = Math.min(1, sink.elapsed / SINK_MS)
      return { x: sink.x + (sink.px - sink.x) * progress, y: sink.y + (sink.py - sink.y) * progress }
    }
    if (ball.pocketed)
      return null
    const offset = offsets.get(ball.id)
    return { x: ball.x + (offset?.x ?? 0), y: ball.y + (offset?.y ?? 0) }
  }

  function startSink(id: number, x: number, y: number): void {
    const pocket = nearestPocket(x, y)
    sinks.set(id, { x, y, px: pocket.x, py: pocket.y, elapsed: 0 })
  }

  function adopt(snapshot: PredictionInput): void {
    // Snapshot what is on screen *before* the state changes, so the rendered position can be held
    // identical across the adoption and a pop becomes impossible by construction.
    const before = new Map<number, Point | null>()
    for (const ball of sim)
      before.set(ball.id, renderedOf(ball))

    // Explicit field copies: this is the one pass that touches the reactive proxy.
    sim = snapshot.balls.map(ball => ({ id: ball.id, x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy, pocketed: ball.pocketed }))

    // Only motion carries visual error forward. Deliberate teleports — ball in hand, a new rack,
    // a respotted eight — all arrive with the previous phase settled, and must land instantly.
    const continuous = previous !== null && previous.matchId === snapshot.matchId && previous.phase === 'moving'
    for (const ball of sim) {
      const rendered = before.get(ball.id)
      if (!ball.pocketed) {
        sinks.delete(ball.id)
        if (continuous && rendered)
          offsets.set(ball.id, clampOffset(rendered.x - ball.x, rendered.y - ball.y))
        else
          offsets.delete(ball.id)
        continue
      }
      offsets.delete(ball.id)
      // Pocketed on the server but still visible here: drop it in rather than vanishing.
      if (rendered && !sinks.has(ball.id))
        startSink(ball.id, rendered.x, rendered.y)
    }

    // `stepPhysics` appends to the report without bound and the client discards outcomes entirely,
    // so it has to be recycled or it grows for the life of the overlay.
    pocketedIds.clear()
    for (const ball of sim) {
      if (ball.pocketed)
        pocketedIds.add(ball.id)
    }
    report = emptyReport()
    // Reset only on the aiming -> moving transition, mirroring the server's own accumulator reset in
    // `shoot()`. Resetting per snapshot would discard up to a whole step each time (~17% of a
    // period) and leave the client permanently behind, rubber-banding backwards.
    if (previous?.phase !== 'moving' && snapshot.phase === 'moving')
      accumulator = 0
    aheadMs = 0
    simMoving = snapshot.phase === 'moving'
    previous = { matchId: snapshot.matchId, turnId: snapshot.turnId, phase: snapshot.phase }
  }

  function advance(deltaMs: number): void {
    const dt = Math.min(Math.max(deltaMs, 0), 100)
    if (simMoving && aheadMs < MAX_PREDICTION_MS) {
      accumulator += dt / 1000
      while (accumulator >= FIXED_STEP && simMoving && aheadMs < MAX_PREDICTION_MS) {
        accumulator -= FIXED_STEP
        simMoving = stepPhysics(sim, report)
        aheadMs += FIXED_STEP * 1000
        for (const ball of sim) {
          // Pocketed locally: the step leaves it at the pocket mouth, so the sink mostly shrinks.
          if (ball.pocketed && !pocketedIds.has(ball.id)) {
            pocketedIds.add(ball.id)
            startSink(ball.id, ball.x, ball.y)
          }
        }
      }
    }
    const factor = decayFactor(dt)
    for (const [id, offset] of offsets) {
      offset.x *= factor
      offset.y *= factor
      if (Math.abs(offset.x) < SETTLED_ERROR && Math.abs(offset.y) < SETTLED_ERROR)
        offsets.delete(id)
    }
    for (const [id, sink] of sinks) {
      sink.elapsed += dt
      if (sink.elapsed >= SINK_MS)
        sinks.delete(id)
    }
  }

  function frames(): readonly PredictedFrame[] {
    let count = 0
    for (const ball of sim) {
      const sink = sinks.get(ball.id)
      if (!sink && ball.pocketed)
        continue
      const frame = pool[count] ?? (pool[count] = { id: 0, x: 0, y: 0, scale: 1 })
      if (sink) {
        const progress = Math.min(1, sink.elapsed / SINK_MS)
        frame.x = sink.x + (sink.px - sink.x) * progress
        frame.y = sink.y + (sink.py - sink.y) * progress
        frame.scale = Math.max(0, 1 - progress)
      }
      else {
        const offset = offsets.get(ball.id)
        frame.x = ball.x + (offset?.x ?? 0)
        frame.y = ball.y + (offset?.y ?? 0)
        frame.scale = 1
      }
      frame.id = ball.id
      view[count] = frame
      count++
    }
    view.length = count
    return view
  }

  return { adopt, advance, simulated: () => sim, frames, moving: () => simMoving }
}
