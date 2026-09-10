<script lang='ts'>
  import { helloToastState } from '$lib/ui/hello-toast-state.svelte'
</script>

{#if helloToastState.fromDisplayName}
  <div class='hello-toast' role='status'>
    <span>{helloToastState.fromDisplayName} says hello 👋</span>
    <button type='button' class='close' onclick={() => helloToastState.dismiss()} aria-label='Dismiss'>×</button>
  </div>
{/if}

<style>
  .hello-toast {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 40;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-radius: 8px;
    background: rgb(0 0 0 / 80%);
    color: #fff;
    font-size: 14px;
  }

  .close {
    padding: 0 4px;
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
</style>
