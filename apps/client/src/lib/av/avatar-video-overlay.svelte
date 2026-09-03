<script lang='ts'>
  import { attachVideoTrack } from '$lib/av/attach-video-track'
  import { screenShareOverlayState } from '$lib/av/screen-share-overlay-state.svelte'
  import { isOverflowTile, videoOverlayState } from '$lib/av/video-overlay-state.svelte'

  function initial(name: string): string {
    return name.trim().charAt(0).toUpperCase() || '?'
  }
</script>

<div class='strip'>
  {#each videoOverlayState.tiles as tile (isOverflowTile(tile) ? 'overflow' : `${tile.sessionId}:${tile.kind}`)}
    {#if isOverflowTile(tile)}
      <div class='tile overflow'>
        <span class='overflow-count'>+{tile.overflowCount}</span>
      </div>
    {:else if tile.kind === 'screen'}
      <!-- Click to expand into the full-screen grid (#100) — the only interactive tile kind. -->
      <div
        class='tile clickable'
        class:speaking={tile.speaking}
        role='button'
        tabindex='0'
        onclick={() => screenShareOverlayState.set(true)}
        onkeydown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            screenShareOverlayState.set(true)
          }
        }}
      >
        <div class='tile-content'>
          {#if tile.videoTrack}
            <video
              use:attachVideoTrack={tile.videoTrack}
              autoplay
              playsinline
              muted={tile.isLocal}
            ></video>
          {/if}
          <span class='screen-badge' title='Sharing screen'>🖥️</span>
        </div>
        <span class='name-label'>{tile.isLocal ? 'You' : tile.name}</span>
      </div>
    {:else}
      <div class='tile' class:speaking={tile.speaking}>
        <div class='tile-content'>
          {#if tile.cameraEnabled && tile.videoTrack}
            <video
              use:attachVideoTrack={tile.videoTrack}
              autoplay
              playsinline
              muted={tile.isLocal}
              class:mirrored={tile.isLocal}
            ></video>
          {:else}
            <div class='placeholder'>
              <span class='avatar-circle'>
                {initial(tile.name)}
                <span class='mic-dot' class:on={tile.micEnabled}></span>
              </span>
            </div>
          {/if}
        </div>
        <span class='name-label'>{tile.isLocal ? 'You' : tile.name}</span>
      </div>
    {/if}
  {/each}
</div>

<style>
  .strip {
    position: absolute;
    top: 16px;
    left: 50%;
    display: flex;
    flex-wrap: nowrap;
    justify-content: center;
    gap: 12px;
    max-width: min(1200px, 92vw);
    pointer-events: none;
    transform: translateX(-50%);
  }

  /*
   * Fixed cap (MAX_REMOTE_VIDEO_TILES) keeps the tile count bounded, but the row must still
   * fit varying viewport widths without wrapping to a second line (that stacked over the game
   * view). flex-shrink + aspect-ratio (instead of a fixed height) lets tiles shrink together
   * down to min-width while staying in one row; growth is capped at 220px.
   */
  .tile {
    position: relative;
    width: 220px;
    min-width: 100px;
    aspect-ratio: 4 / 3;
    flex: 1 1 220px;
    border-radius: 12px;
    /*
     * Outset (not inset) box-shadow, on this OUTER element rather than `.tile-content` — an
     * inset shadow here would sit exactly where `.tile-content`'s opaque video/placeholder
     * fills the same edge-to-edge box, hiding it completely. This element intentionally has no
     * `overflow: hidden` of its own, so the outset ring isn't clipped either.
     */
    box-shadow: 0 0 0 2px transparent;
    transition: box-shadow 0.1s ease-out;
  }

  /* Gather-style speaking indicator, driven by LiveKit's built-in active-speaker detection. */
  .tile.speaking {
    box-shadow: 0 0 0 2px #3b82f6;
  }

  /* Only screen tiles are interactive (click/Enter/Space to expand, #100) — the strip itself
     stays `pointer-events: none` for every other tile kind. */
  .tile.clickable {
    cursor: pointer;
    pointer-events: auto;
  }

  .tile-content {
    width: 100%;
    height: 100%;
    overflow: hidden;
    border-radius: 12px;
    background: #000;
  }

  .tile video {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  /* Self-view convention (Zoom/Meet/etc.): mirror only your own preview, so it feels like
     looking in a mirror — remote participants still see the unmirrored, "true" video. */
  .tile video.mirrored {
    transform: scaleX(-1);
  }

  .placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    background: #1a1a1a;
  }

  .avatar-circle {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: #e8a9c9;
    color: #3a2030;
    font-size: 24px;
    font-weight: 600;
  }

  .mic-dot {
    position: absolute;
    right: -2px;
    bottom: -2px;
    width: 14px;
    height: 14px;
    border: 2px solid #1a1a1a;
    border-radius: 50%;
    background: #6b7280;
  }

  .mic-dot.on {
    background: #22c55e;
  }

  .screen-badge {
    position: absolute;
    top: 6px;
    right: 6px;
    padding: 2px 5px;
    border-radius: 4px;
    background: rgb(0 0 0 / 60%);
    font-size: 14px;
    line-height: 1.4;
  }

  .tile.overflow {
    display: flex;
    align-items: center;
    justify-content: center;
    background: #1a1a1a;
  }

  .overflow-count {
    color: #fff;
    font-size: 28px;
    font-weight: 600;
  }

  .name-label {
    position: absolute;
    bottom: 6px;
    left: 6px;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgb(0 0 0 / 60%);
    color: #fff;
    font-size: 12px;
  }
</style>
