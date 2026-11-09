<script lang='ts'>
  import type { LandingMedia } from '$lib/landing/landing-content'

  const { media }: { media: LandingMedia } = $props()
</script>

<div class='media'>
  {#if media.src && media.kind === 'video'}
    <video src={media.src} autoplay loop muted playsinline aria-label={media.alt}></video>
  {:else if media.src}
    <img src={media.src} alt={media.alt} loading='lazy' />
  {:else}
    <div class='placeholder' role='img' aria-label={media.alt}>
      <span class='kind'>{media.kind === 'video' ? 'Video' : 'GIF'}</span>
      <span class='caption'>{media.alt}</span>
    </div>
  {/if}
</div>

<style>
  .media {
    overflow: hidden;
    width: 100%;
    aspect-ratio: 16 / 9;
    border: 1px solid #333;
    border-radius: 12px;
    background: #1f1f1f;
  }

  video,
  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    height: 100%;
    padding: 16px;
    color: #9ca3af;
    text-align: center;
  }

  .kind {
    padding: 2px 10px;
    border: 1px solid #4a4a4a;
    border-radius: 999px;
    color: #d1d5db;
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .caption {
    max-width: 36ch;
    font-size: 13px;
  }
</style>
