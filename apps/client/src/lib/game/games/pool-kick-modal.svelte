<script lang='ts'>
  import { gameSessionState as session } from '$lib/game/games/game-session-state.svelte'
</script>

{#if session.kickNotice}
  <div class='kick-overlay' role='alertdialog' aria-modal='true' aria-label='Removed from the match'>
    <div class='kick-modal'>
      <p>{session.kickNotice}</p>
      <button type='button' onclick={() => session.dismissKickNotice()}>OK</button>
    </div>
  </div>
{/if}

<style>
  .kick-overlay {
    position: fixed;
    inset: 0;
    /* Same level as the attention modal: it has to be seen, and it blocks the screen until dismissed. */
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgb(0 0 0 / 70%);
    pointer-events: auto;
  }

  .kick-modal {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    max-width: min(420px, calc(100vw - 32px));
    padding: 28px 32px;
    border-radius: 12px;
    background: rgb(17 24 39 / 98%);
    color: #fff;
    text-align: center;
  }

  .kick-modal p {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }

  .kick-modal button {
    padding: 8px 28px;
    border: none;
    border-radius: 8px;
    background: #fff;
    color: #111827;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }
</style>
