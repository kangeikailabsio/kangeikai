<script lang='ts'>
  import { attentionModalState } from '$lib/ui/attention-modal-state.svelte'
</script>

{#if attentionModalState.fromDisplayName}
  <div class='attention-overlay' role='dialog' aria-modal='true' aria-label='Attention'>
    <div class='attention-modal'>
      <p>{attentionModalState.fromDisplayName} wants your attention 🔔</p>
      <button type='button' onclick={() => attentionModalState.dismiss()}>OK</button>
    </div>
  </div>
{/if}

<style>
  .attention-overlay {
    position: fixed;
    inset: 0;
    /* Above every other overlay (toasts, panels, popovers all sit at 40 or below) — while open,
       this blocks interaction with the rest of the screen (#158's grill), unlike the Hello
       toast, which never blocks anything. */
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgb(0 0 0 / 70%);
    pointer-events: auto;
  }

  .attention-modal {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 28px 32px;
    border-radius: 12px;
    background: rgb(17 24 39 / 98%);
    color: #fff;
    text-align: center;
  }

  .attention-modal p {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }

  .attention-modal button {
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
