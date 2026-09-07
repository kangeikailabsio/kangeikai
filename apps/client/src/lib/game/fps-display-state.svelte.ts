/**
 * Whether the FPS counter overlay (issue #130) is showing — toggled from the local avatar's
 * profile panel checkbox. Purely local, per-viewer, never persisted (resets to off every
 * session/reload, unlike screenShareOverlayState-style settings) and independent of whether
 * the panel that toggled it is still open.
 */
function createFpsDisplayState() {
  let enabled = $state(false)

  return {
    get enabled(): boolean {
      return enabled
    },
    set(value: boolean): void {
      enabled = value
    },
  }
}

export const fpsDisplayState = createFpsDisplayState()
