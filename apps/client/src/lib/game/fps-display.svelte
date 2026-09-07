<script lang='ts'>
  import type Phaser from 'phaser'
  import { fpsDisplayState } from '$lib/game/fps-display-state.svelte'

  interface Props {
    game: Phaser.Game | undefined
  }

  const { game }: Props = $props()

  let fps = $state(0)
  let frameId: number | undefined

  /**
   * `game.loop.actualFps` is already an exponential moving average (Phaser's own smoothing) —
   * no extra averaging needed here, just read it each frame while the overlay is showing.
   */
  function poll(): void {
    if (game) {
      fps = Math.round(game.loop.actualFps)
    }
    frameId = requestAnimationFrame(poll)
  }

  $effect(() => {
    if (!fpsDisplayState.enabled) {
      return
    }
    frameId = requestAnimationFrame(poll)
    return () => {
      if (frameId !== undefined) {
        cancelAnimationFrame(frameId)
      }
    }
  })
</script>

{#if fpsDisplayState.enabled}
  <div class='fps-display'>{fps} FPS</div>
{/if}

<style>
  .fps-display {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 30;
    padding: 4px 8px;
    border-radius: 6px;
    background: rgb(17 24 39 / 80%);
    color: #fff;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
</style>
