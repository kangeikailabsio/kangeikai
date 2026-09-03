<script lang='ts'>
  import { attachVideoTrack } from '$lib/av/attach-video-track'
  import { screenShareGridState } from '$lib/av/screen-share-grid-state.svelte'
  import { screenShareOverlayState } from '$lib/av/screen-share-overlay-state.svelte'

  function minimize(): void {
    screenShareOverlayState.set(false)
  }

  /**
   * Whether the grid has actually been populated at least once since this overlay opened.
   * Right after `+page.svelte` auto-opens for someone starting their own share, the grid can
   * still be empty for a frame or two — `OfficeScene.update()` only rebuilds
   * `screenShareGridState` once LiveKit's publish resolves and the next tick reads the new
   * track, which lags slightly behind `screenShareOverlayState.set(true)`. Without this guard,
   * the auto-close effect below would see "expanded, zero tiles" on that very first tick and
   * immediately snap itself shut before anyone ever saw it open.
   */
  let hasHadTiles = $state(false)

  /**
   * Auto-closes once the grid empties back out *after* having had tiles — everyone stopped
   * sharing, or *this* viewer walked out of proximity of the only presenter(s) left; both
   * collapse to "my own grid is now empty" (#94's grill Q13/Q19), since `screenShareGridState`
   * is already proximity-filtered per viewer. Never closes on the initial not-yet-populated
   * tick (see `hasHadTiles` above), and never re-opens on its own — minimizing manually must
   * stick even if the grid later refills.
   */
  $effect(() => {
    if (!screenShareOverlayState.expanded) {
      hasHadTiles = false
      return
    }
    if (screenShareGridState.tiles.length > 0) {
      hasHadTiles = true
    }
    else if (hasHadTiles) {
      screenShareOverlayState.set(false)
    }
  })
</script>

{#if screenShareOverlayState.expanded}
  <div class='backdrop' aria-hidden='true'></div>
  <div class='overlay' role='dialog' aria-label='Screen shares'>
    <button type='button' class='minimize-button' onclick={minimize}>
      Minimize
    </button>
    <div class='grid'>
      {#each screenShareGridState.tiles as tile (tile.sessionId)}
        <div class='tile'>
          {#if tile.videoTrack}
            <video
              use:attachVideoTrack={tile.videoTrack}
              autoplay
              playsinline
              muted={tile.isLocal}
            ></video>
          {/if}
          <span class='name-label'>{tile.isLocal ? 'You' : tile.name}</span>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  /* Same DOM-overlay-over-the-canvas pattern as busy-overlay.svelte, one layer up
     (z-index 25/26 vs. busy's 20/21) — .media-controls (z-index 30) stays on top and clickable
     either way, so Mute/Camera/Busy remain usable while a screen share is open. */
  .backdrop {
    position: absolute;
    inset: 0;
    z-index: 25;
    background: #000;
    pointer-events: auto;
  }

  .overlay {
    position: absolute;
    inset: 0;
    z-index: 26;
    display: flex;
    flex-direction: column;
    padding: 16px;
    pointer-events: auto;
  }

  .minimize-button {
    align-self: flex-end;
    padding: 8px 16px;
    border: none;
    border-radius: 8px;
    background: rgb(255 255 255 / 15%);
    color: #fff;
    cursor: pointer;
  }

  .grid {
    display: grid;
    flex: 1;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    grid-auto-rows: minmax(180px, 1fr);
    gap: 16px;
    margin-top: 16px;
    overflow: auto;
  }

  .tile {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-radius: 12px;
    background: #111;
  }

  .tile video {
    display: block;
    width: 100%;
    height: 100%;
    /* contain, not cover: cropping someone's shared screen would hide content — unlike a face
       in a camera tile, every pixel of a screen share can matter. */
    object-fit: contain;
  }

  .name-label {
    position: absolute;
    bottom: 10px;
    left: 10px;
    padding: 4px 10px;
    border-radius: 6px;
    background: rgb(0 0 0 / 60%);
    color: #fff;
    font-size: 14px;
  }
</style>
