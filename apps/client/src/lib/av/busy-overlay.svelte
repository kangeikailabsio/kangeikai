<script lang='ts'>
  interface Props {
    active: boolean
  }

  const { active }: Props = $props()
</script>

{#if active}
  <div class='busy-overlay' aria-hidden='true'></div>
  <div class='busy-banner' role='status' aria-live='polite'>You're busy</div>
{/if}

<style>
  .busy-overlay {
    position: absolute;
    inset: 0;
    z-index: 20;
    background: rgb(0 0 0 / 45%);
    pointer-events: auto;
  }

  .busy-banner {
    position: absolute;
    top: 16px;
    left: 50%;
    z-index: 21;
    padding: 8px 14px;
    border-radius: 999px;
    background: rgb(17 24 39 / 92%);
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.01em;
    pointer-events: none;
    transform: translateX(-50%);
  }
</style>
