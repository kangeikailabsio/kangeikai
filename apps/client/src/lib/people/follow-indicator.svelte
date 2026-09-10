<script lang='ts'>
  import { followState } from '$lib/people/follow-state.svelte'
  import { rosterState } from '$lib/people/roster-state.svelte'

  interface Props {
    /** One of the three ways to stop a follow (issue #160) — the indicator's own stop button, independent of the profile panel being open. */
    onStop: () => void
  }

  const { onStop }: Props = $props()

  const followedName = $derived(rosterState.people.find(person => person.sessionId === followState.sessionId)?.name)
</script>

{#if followedName}
  <div class='follow-indicator'>
    <span>Following {followedName}</span>
    <button type='button' onclick={onStop} aria-label='Stop following'>Stop</button>
  </div>
{/if}

<style>
  .follow-indicator {
    position: fixed;
    top: 16px;
    left: 16px;
    z-index: 30;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    border-radius: 6px;
    background: rgb(17 24 39 / 80%);
    color: #fff;
    font-size: 12px;
  }

  .follow-indicator button {
    padding: 2px 8px;
    border: none;
    border-radius: 4px;
    background: rgb(255 255 255 / 15%);
    color: #fff;
    font-size: 12px;
    cursor: pointer;
  }

  .follow-indicator button:hover {
    background: rgb(255 255 255 / 25%);
  }
</style>
