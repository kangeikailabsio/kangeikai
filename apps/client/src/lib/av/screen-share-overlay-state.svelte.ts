/**
 * Whether the full-screen screen-share overlay (#100) is expanded — a purely local,
 * per-viewer UI preference, never synced between people (#94's grill Q4). Several independent
 * places write it: clicking a screen tile in the strip (`avatar-video-overlay.svelte`) expands
 * it, starting your own share (`+page.svelte`'s `toggleScreenShare`) auto-expands it, the
 * overlay's own minimize button and its empty-grid auto-close effect (`screen-share-overlay.svelte`)
 * collapse it. `OfficeScene.update()` also reads it every frame to block movement while open.
 */
function createScreenShareOverlayState() {
  let expanded = $state(false)

  return {
    get expanded(): boolean {
      return expanded
    },
    set(value: boolean): void {
      expanded = value
    },
  }
}

export const screenShareOverlayState = createScreenShareOverlayState()
