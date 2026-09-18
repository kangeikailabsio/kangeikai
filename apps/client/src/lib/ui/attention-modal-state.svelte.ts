/**
 * The blocking "{Name} wants your attention 🔔" modal (issue #158) — shown only once the camera
 * shake finishes (`office-scene.ts`'s `SHAKE_COMPLETE` handler), never simultaneously with it.
 * Manual dismissal only (no auto-timeout), same "confirm you saw it" spirit as the Hello toast's
 * persistent state, but this one is also read directly by `office-scene.ts` to suppress manual
 * movement while open — the same pattern `screenShareOverlayState` already uses for its own
 * blocking overlay.
 */
function createAttentionModalState() {
  let fromDisplayName = $state<string | undefined>(undefined)

  return {
    get fromDisplayName(): string | undefined {
      return fromDisplayName
    },
    get open(): boolean {
      return fromDisplayName !== undefined
    },
    show(name: string): void {
      fromDisplayName = name
    },
    dismiss(): void {
      fromDisplayName = undefined
    },
  }
}

export const attentionModalState = createAttentionModalState()
