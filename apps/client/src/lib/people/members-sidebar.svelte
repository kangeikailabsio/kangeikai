<script lang='ts'>
  import { rosterState } from '$lib/people/roster-state.svelte'

  interface Props {
    open: boolean
  }

  const { open }: Props = $props()
</script>

{#if open}
  <div class='members-sidebar'>
    <div class='members-header'>Members ({rosterState.people.length})</div>
    <ul class='members-list'>
      {#each rosterState.people as person (person.sessionId)}
        <li class='member-row'>
          <span class='status-dot' class:busy={person.presence === 'busy'}></span>
          <span class='member-name'>{person.isLocal ? 'You' : person.name}</span>
        </li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .members-sidebar {
    position: fixed;
    top: 0;
    right: 0;
    z-index: 25;
    display: flex;
    flex-direction: column;
    width: 260px;
    height: 100dvh;
    background: rgb(17 24 39 / 92%);
    color: #fff;
  }

  .members-header {
    padding: 14px 16px;
    border-bottom: 1px solid rgb(255 255 255 / 12%);
    font-size: 14px;
    font-weight: 600;
  }

  .members-list {
    margin: 0;
    padding: 8px 0;
    overflow-y: auto;
    list-style: none;
  }

  .member-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 16px;
    font-size: 14px;
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

  .member-name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
</style>
