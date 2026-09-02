<script lang='ts'>
  import { toastState } from '$lib/ui/toast-state.svelte'
</script>

{#if toastState.message}
  <div class='toast' role='status'>{toastState.message}</div>
{/if}

<style>
  .toast {
    position: fixed;
    top: 16px;
    left: 50%;
    z-index: 40;
    padding: 10px 20px;
    border-radius: 8px;
    background: rgb(0 0 0 / 80%);
    color: #fff;
    font-size: 14px;
    pointer-events: none;
    transform: translateX(-50%);
  }
</style>
