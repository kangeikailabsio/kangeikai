<script lang='ts'>
  import type { AvatarSpriteType } from '@kangeikai/shared'
  import avatarManIdleUrl from '$lib/assets/sprites/avatar-man-idle.png?url'
  import avatarWomanIdleUrl from '$lib/assets/sprites/avatar-woman-idle.png?url'

  interface Props {
    /** Absent only against a server too old to send it — then the initial stands in. */
    spriteType?: AvatarSpriteType
    name: string
  }

  const { spriteType, name }: Props = $props()

  const AVATAR_IDLE_URL: Record<AvatarSpriteType, string> = {
    man: avatarManIdleUrl,
    woman: avatarWomanIdleUrl,
  }

  /** Frame width mirrors office-scene.ts's AVATAR_FRAME_SIZE (height is set directly in CSS below). */
  const FRAME_WIDTH = 32
  /** First frame of the "down" (idle, facing the camera) range — avatar.ts's AVATAR_FRAME_RANGES.down.start — a standing-still portrait, not a walk-cycle frame. */
  const ICON_FRAME_INDEX = 18

  const initial = $derived(name.trim().charAt(0).toUpperCase() || '?')
</script>

{#if spriteType}
  <div
    class='icon'
    style:background-image='url({AVATAR_IDLE_URL[spriteType]})'
    style:background-position='-{ICON_FRAME_INDEX * FRAME_WIDTH}px 0'
  ></div>
{:else}
  <div class='icon initial'>{initial}</div>
{/if}

<style>
  /* Kept at exactly 32x64 CSS px: an integer 1:1 mapping is what keeps `pixelated` crisp. */
  .icon { width: 32px; height: 64px; background-repeat: no-repeat; image-rendering: pixelated; flex-shrink: 0; }
  .initial { display: flex; align-items: center; justify-content: center; border-radius: 6px; background: #e8a9c9; color: #3a2030; font-size: 20px; font-weight: 600; }
</style>
