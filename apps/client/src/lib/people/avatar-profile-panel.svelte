<script lang='ts'>
  import type { AvatarSpriteType } from '@kangeikai/shared'
  import avatarManIdleUrl from '$lib/assets/sprites/avatar-man-idle.png?url'
  import avatarWomanIdleUrl from '$lib/assets/sprites/avatar-woman-idle.png?url'
  import { fpsDisplayState } from '$lib/game/fps-display-state.svelte'
  import { avatarProfileState } from '$lib/people/avatar-profile-state.svelte'
  import { rosterState } from '$lib/people/roster-state.svelte'

  const AVATAR_IDLE_URL: Record<AvatarSpriteType, string> = {
    man: avatarManIdleUrl,
    woman: avatarWomanIdleUrl,
  }

  /** Frame width mirrors office-scene.ts's AVATAR_FRAME_SIZE (height is set directly in CSS below). */
  const FRAME_WIDTH = 32
  /** First frame of the "down" (idle, facing the camera) range — avatar.ts's AVATAR_FRAME_RANGES.down.start — a standing-still portrait, not a walk-cycle frame. */
  const ICON_FRAME_INDEX = 18

  /**
   * `avatarProfileState.selected` is a sessionId, or the sentinel `'local'` for the player's own
   * avatar — which is also exactly `rosterState`'s own local entry's `sessionId` (both this hover/
   * click system and the roster independently settled on the same `'local'` convention), so a
   * plain lookup handles both cases with no special-casing.
   */
  const person = $derived(rosterState.people.find(candidate => candidate.sessionId === avatarProfileState.selected))

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      avatarProfileState.close()
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if person}
  <div class='avatar-profile-panel' role='dialog' aria-label='Avatar profile'>
    <button type='button' class='close' onclick={() => avatarProfileState.close()} aria-label='Close'>×</button>
    <div class='header'>
      <div
        class='icon'
        style:background-image='url({AVATAR_IDLE_URL[person.spriteType]})'
        style:background-position='-{ICON_FRAME_INDEX * FRAME_WIDTH}px 0'
      ></div>
      <div class='info'>
        <span class='name'>{person.name}</span>
        <span class='presence'>
          <span class='status-dot' class:busy={person.presence === 'busy'}></span>
          {person.presence === 'busy' ? 'Busy' : 'Available'}
        </span>
      </div>
    </div>
    <!-- Options land here (issue #127) — kept as a separate area from the header above. Only the
         local avatar's panel gets client-only preferences like "Show FPS" (issue #130); they're
         about the viewer, not the person being viewed, so they don't belong on a remote panel. -->
    {#if person.isLocal}
      <div class='options'>
        <label class='option'>
          <input type='checkbox' checked={fpsDisplayState.enabled} onchange={event => fpsDisplayState.set(event.currentTarget.checked)} />
          Show FPS
        </label>
      </div>
    {/if}
  </div>
{/if}

<style>
  .avatar-profile-panel {
    position: fixed;
    bottom: 16px;
    left: 16px;
    z-index: 30;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 36px 10px 10px;
    border-radius: 10px;
    background: rgb(17 24 39 / 96%);
    color: #fff;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .options {
    padding-top: 8px;
    border-top: 1px solid rgb(255 255 255 / 12%);
  }

  .option {
    display: flex;
    align-items: center;
    gap: 6px;
    color: rgb(255 255 255 / 85%);
    font-size: 13px;
    cursor: pointer;
  }

  .close {
    position: absolute;
    top: 4px;
    right: 6px;
    padding: 2px 6px;
    border: none;
    background: transparent;
    color: rgb(255 255 255 / 70%);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
  }

  .close:hover {
    color: #fff;
  }

  .icon {
    width: 32px;
    height: 64px;
    background-repeat: no-repeat;
    image-rendering: pixelated;
    flex-shrink: 0;
  }

  .info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .name {
    overflow: hidden;
    font-size: 14px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .presence {
    display: flex;
    align-items: center;
    gap: 6px;
    color: rgb(255 255 255 / 75%);
    font-size: 12px;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: #22c55e;
    flex-shrink: 0;
  }

  .status-dot.busy {
    background: #ef4444;
  }
</style>
