/** World units are independent of canvas size. Only the server advances this simulation. */
export const TABLE_WIDTH = 800
export const TABLE_HEIGHT = 400
export const BALL_RADIUS = 10
export const POCKET_RADIUS = 24
export const MAX_SHOT_SPEED = 1600
export const FIXED_STEP = 1 / 120
export const POCKETS = [
  { x: 0, y: 0 },
  { x: 400, y: 0 },
  { x: 800, y: 0 },
  { x: 0, y: 400 },
  { x: 400, y: 400 },
  { x: 800, y: 400 },
]

export interface Ball {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  pocketed: boolean
}

export interface ShotReport {
  firstContact: number | null
  pocketed: number[]
  railsAfterContact: number[]
}

export function emptyReport(): ShotReport {
  return { firstContact: null, pocketed: [], railsAfterContact: [] }
}

export function createRack(): Ball[] {
  const balls: Ball[] = [{ id: 0, x: 200, y: 200, vx: 0, vy: 0, pocketed: false }]
  // Eight in the middle, opposite groups in the back corners.
  const ids = [1, 9, 2, 10, 8, 3, 4, 11, 5, 12, 6, 13, 7, 14, 15]
  let index = 0
  for (let row = 0; row < 5; row++) {
    for (let column = 0; column <= row; column++) {
      balls.push({ id: ids[index++], x: 560 + row * 17.5, y: 200 + (column - row / 2) * 20.2, vx: 0, vy: 0, pocketed: false })
    }
  }
  return balls
}

/** Earliest swept point/circle intersection, including touching objects approaching each other. */
function impactTime(x: number, y: number, vx: number, vy: number, radius: number): number {
  const a = vx * vx + vy * vy
  const b = x * vx + y * vy
  const c = x * x + y * y - radius * radius
  if (a < 1e-10 || b >= 0)
    return Infinity
  if (c <= 1e-7)
    return 0
  const discriminant = b * b - a * c
  return discriminant < 0 ? Infinity : Math.max(0, (-b - Math.sqrt(discriminant)) / a)
}

type Impact = { kind: 'pair', a: Ball, b: Ball } | { kind: 'rail', a: Ball, axis: 'x' | 'y' } | { kind: 'pocket', a: Ball }

/** Event-based continuous collision detection prevents tunnelling, including at maximum power. */
export function stepPhysics(balls: Ball[], report: ShotReport, dt = FIXED_STEP): boolean {
  let remaining = dt
  // A bound prevents a degenerate contact cluster from monopolizing the office event loop.
  // At the bound we discard only the remaining fraction of this step, never move through contacts.
  for (let iteration = 0; remaining > 1e-9 && iteration < 128; iteration++) {
    let time = remaining
    let impact: Impact | undefined
    const consider = (candidate: number, event: Impact) => {
      if (candidate >= 0 && candidate <= time) {
        time = candidate
        impact = event
      }
    }
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i]
      if (a.pocketed)
        continue
      for (const pocket of POCKETS) {
        const inside = Math.hypot(a.x - pocket.x, a.y - pocket.y) < POCKET_RADIUS
        consider(inside ? 0 : impactTime(a.x - pocket.x, a.y - pocket.y, a.vx, a.vy, POCKET_RADIUS), { kind: 'pocket', a })
      }
      if (a.vx < 0)
        consider((BALL_RADIUS - a.x) / a.vx, { kind: 'rail', a, axis: 'x' })
      if (a.vx > 0)
        consider((TABLE_WIDTH - BALL_RADIUS - a.x) / a.vx, { kind: 'rail', a, axis: 'x' })
      if (a.vy < 0)
        consider((BALL_RADIUS - a.y) / a.vy, { kind: 'rail', a, axis: 'y' })
      if (a.vy > 0)
        consider((TABLE_HEIGHT - BALL_RADIUS - a.y) / a.vy, { kind: 'rail', a, axis: 'y' })
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j]
        if (!b.pocketed)
          consider(impactTime(a.x - b.x, a.y - b.y, a.vx - b.vx, a.vy - b.vy, 2 * BALL_RADIUS), { kind: 'pair', a, b })
      }
    }
    for (const ball of balls) {
      if (!ball.pocketed) {
        ball.x += ball.vx * time
        ball.y += ball.vy * time
      }
    }
    remaining -= time
    if (!impact)
      break
    const { a } = impact
    if (impact.kind === 'pocket') {
      a.pocketed = true
      a.vx = a.vy = 0
      report.pocketed.push(a.id)
    }
    else if (impact.kind === 'rail') {
      if (impact.axis === 'x')
        a.vx *= -0.82
      else
        a.vy *= -0.82
      if (report.firstContact !== null && !report.railsAfterContact.includes(a.id))
        report.railsAfterContact.push(a.id)
    }
    else {
      const { b } = impact
      const distance = Math.hypot(b.x - a.x, b.y - a.y) || 1
      const nx = (b.x - a.x) / distance
      const ny = (b.y - a.y) / distance
      const impulse = ((a.vx - b.vx) * nx + (a.vy - b.vy) * ny) * 0.98
      a.vx -= impulse * nx
      a.vy -= impulse * ny
      b.vx += impulse * nx
      b.vy += impulse * ny
      if (report.firstContact === null && (a.id === 0 || b.id === 0))
        report.firstContact = a.id === 0 ? b.id : a.id
    }
  }
  let moving = false
  for (const ball of balls) {
    if (ball.pocketed)
      continue
    const speed = Math.hypot(ball.vx, ball.vy)
    const next = Math.max(0, speed - 120 * dt)
    const factor = speed > 0 && next > 2 ? next / speed : 0
    ball.vx *= factor
    ball.vy *= factor
    moving ||= factor > 0
  }
  return moving
}

export function canPlaceBall(balls: Ball[], id: number, x: number, y: number): boolean {
  return Number.isFinite(x) && Number.isFinite(y)
    && x >= BALL_RADIUS && x <= TABLE_WIDTH - BALL_RADIUS
    && y >= BALL_RADIUS && y <= TABLE_HEIGHT - BALL_RADIUS
    && POCKETS.every(p => Math.hypot(p.x - x, p.y - y) > POCKET_RADIUS + 1)
    && balls.every(b => b.id === id || b.pocketed || Math.hypot(b.x - x, b.y - y) >= BALL_RADIUS * 2 + 0.1)
}

export function respotEight(balls: Ball[]): void {
  const eight = balls.find(b => b.id === 8)!
  for (let x = 595; x <= TABLE_WIDTH - BALL_RADIUS; x += 0.5) {
    if (canPlaceBall(balls, 8, x, 200)) {
      Object.assign(eight, { x, y: 200, vx: 0, vy: 0, pocketed: false })
      return
    }
  }
  // Extremely crowded foot string: continue toward the head, keeping the ball on the table.
  for (let x = 594.5; x >= BALL_RADIUS; x -= 0.5) {
    if (canPlaceBall(balls, 8, x, 200)) {
      Object.assign(eight, { x, y: 200, vx: 0, vy: 0, pocketed: false })
      return
    }
  }
}
