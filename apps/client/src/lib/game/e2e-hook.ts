/**
 * A small handle for end-to-end tests (issue #227), only present in builds made with
 * `VITE_E2E=true`. The caller guards it with a direct `import.meta.env.VITE_E2E === 'true'`,
 * which Vite replaces at build time: in a production build (variable unset) the branch is dead
 * code and this module is dropped from the bundle.
 *
 * It exists because getting an avatar to a given spot by walking depends on collisions and speed,
 * which makes tests slow and flaky. Real keyboard movement still has its own test.
 */
export interface E2eHook {
  /** Puts the local avatar at the given map position (px); the next frame syncs it to the server like any move. */
  teleport: (x: number, y: number) => void
  position: () => { x: number, y: number }
  /** Walks to the point along the same route-finding the click-to-move uses, without the ground marker. */
  walkTo: (x: number, y: number) => void
  /** Whether a `walkTo` (or a click) is still under way. */
  isWalking: () => boolean
  /** Leaves the office cleanly (Colyseus, the office call and any private room), as closing the tab would not: a person who just vanishes stays in the room for a while. */
  leave: () => void
  /** Which LiveKit room the call is in: `private` only once a private room is actually connected (a nearby person's tile shows up in the office long before that). */
  activeRoom: () => 'office' | 'private'
}

declare global {
  interface Window {
    __kangeikaiE2E?: E2eHook
  }
}

/** Returns a function that removes the hook, unless a newer scene has replaced it in the meantime. */
export function registerE2eHook(hook: E2eHook): () => void {
  window.__kangeikaiE2E = hook
  return () => {
    if (window.__kangeikaiE2E === hook)
      delete window.__kangeikaiE2E
  }
}
