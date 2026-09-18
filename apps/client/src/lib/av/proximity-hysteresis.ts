/**
 * Whether someone still counts as "nearby" this frame, given whether they did last frame — a
 * wider "stay" range than "enter" range (hysteresis, a.k.a. a Schmitt trigger), the standard fix
 * for a signal that oscillates right at a single hard threshold: without it, proximity chat
 * flickers on/off whenever distance hovers near `enterRangePx` (reported live with "Follow",
 * issue #160 — its chase naturally settles close to the boundary, but the same flicker can
 * happen to anyone just walking near the edge of hearing range). Once someone is nearby, they
 * only drop out past the wider `stayRangePx`, so small back-and-forth movement well inside that
 * margin no longer toggles the connection.
 */
export function resolveProximityHysteresis(distance: number, wasNearby: boolean, enterRangePx: number, stayRangePx: number): boolean {
  return wasNearby ? distance < stayRangePx : distance < enterRangePx
}
