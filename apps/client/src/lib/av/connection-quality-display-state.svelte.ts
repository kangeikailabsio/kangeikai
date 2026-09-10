/**
 * Whether the connection-quality overlay (issue #132) is showing — toggled from the local
 * avatar's profile panel checkbox. Same convention as `fps-display-state.svelte.ts`: purely
 * local, per-viewer, never persisted (resets to off every session/reload) and independent of
 * whether the panel that toggled it is still open.
 */
function createConnectionQualityDisplayState() {
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

export const connectionQualityDisplayState = createConnectionQualityDisplayState()
