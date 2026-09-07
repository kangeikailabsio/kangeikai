import type { HoverTarget } from '$lib/game/entities/avatar-hover'

/**
 * Which avatar's profile panel (issue #127) is currently open, if any — `'local'` for the
 * player's own avatar, a sessionId for someone else's, or `undefined` when closed. Purely
 * local UI state, never synced. Clicking a different avatar while the panel is already open
 * just overwrites this instead of requiring a close first (#127's grill).
 */
function createAvatarProfileState() {
  let selected = $state<HoverTarget | undefined>(undefined)

  return {
    get selected(): HoverTarget | undefined {
      return selected
    },
    open(target: HoverTarget): void {
      selected = target
    },
    close(): void {
      selected = undefined
    },
  }
}

export const avatarProfileState = createAvatarProfileState()
