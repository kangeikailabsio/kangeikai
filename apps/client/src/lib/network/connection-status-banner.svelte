<script lang='ts'>
  import type { ConnectionState } from './room-connection'

  interface Props {
    state: ConnectionState
  }

  const { state }: Props = $props()
</script>

{#if state === 'connecting'}
  <div class='status connecting' role='status'>Reconnecting…</div>
{:else if state === 'disconnected'}
  <div class='status disconnected' role='alert'>You were disconnected. Refresh the page to reconnect.</div>
{/if}

<style>
  .status {
    position: fixed;
    top: 16px;
    left: 50%;
    z-index: 40;
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 14px;
    pointer-events: none;
    transform: translateX(-50%);
  }

  .connecting {
    background: rgb(0 0 0 / 80%);
    color: #fff;
  }

  .disconnected {
    background: #b91c1c;
    color: #fff;
  }
</style>
