/** Kept pure so keyboard and pointer priority share the same tested policy. */
export function blocksOfficeInput(options: { gameOpen: boolean, screenShareOpen: boolean, busy: boolean, typing: boolean }): boolean {
  return options.gameOpen || options.screenShareOpen || options.busy || options.typing
}

export function isTypingTarget(target: EventTarget | null): boolean {
  return typeof HTMLElement !== 'undefined' && target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

export const VIDEO_OVERLAY_THROTTLE_MS = 100

/**
 * How often the video-strip view models may be rebuilt. `OfficeScene.update()` normally writes them
 * every frame, which invalidates two Svelte stores and re-runs their DOM effects 60 times a second;
 * while a game overlay covers the strip that work buys nothing. Throttled rather than skipped
 * because the screen-share grid can still be expanded on top of a game.
 */
export function nextOverlayRefresh(now: number, dueAt: number, throttled: boolean, intervalMs = VIDEO_OVERLAY_THROTTLE_MS): { refresh: boolean, dueAt: number } {
  // Clearing `dueAt` while unthrottled means closing the overlay refreshes on the very next frame.
  if (!throttled)
    return { refresh: true, dueAt: 0 }
  if (now < dueAt)
    return { refresh: false, dueAt }
  return { refresh: true, dueAt: now + intervalMs }
}
