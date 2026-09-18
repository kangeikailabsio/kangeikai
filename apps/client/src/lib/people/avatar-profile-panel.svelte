<script lang='ts'>
  import { connectionQualityDisplayState } from '$lib/av/connection-quality-display-state.svelte'
  import { fpsDisplayState } from '$lib/game/fps-display-state.svelte'
  import AvatarPortrait from '$lib/people/avatar-portrait.svelte'
  import { avatarProfileState } from '$lib/people/avatar-profile-state.svelte'
  import { rosterState } from '$lib/people/roster-state.svelte'

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
      <AvatarPortrait spriteType={person.spriteType} name={person.name} />
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
        <label class='option'>
          <input type='checkbox' checked={connectionQualityDisplayState.enabled} onchange={event => connectionQualityDisplayState.set(event.currentTarget.checked)} />
          Show connection quality
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
