<script lang='ts'>
  import type { LandingMedia } from '$lib/landing/landing-content'
  import { mediaSources } from '$lib/landing/landing-content'
  import { onMount } from 'svelte'

  /** The first thing on the page: its poster is requested with the HTML. Every other clip's poster waits until it is near the screen. */
  const { media, eager = false }: { media: LandingMedia, eager?: boolean } = $props()

  const sources = $derived(media.clip ? mediaSources(media.clip) : undefined)
  let video: HTMLVideoElement | undefined = $state()

  // Nothing is downloaded until a clip is close to the screen: the poster first (the `poster` attribute
  // has no lazy loading of its own), the video only once it is actually in view (`preload='none'`), and
  // it pauses again when it scrolls away. People who ask for less motion get the poster only (issue #242).
  onMount(() => {
    const element = video
    const clip = sources
    if (!element || !clip)
      return

    const stops: Array<() => void> = []

    if (!element.poster) {
      const near = new IntersectionObserver((entries) => {
        if (entries.some(entry => entry.isIntersecting)) {
          element.poster = clip.poster
          near.disconnect()
        }
      }, { rootMargin: '600px' })
      near.observe(element)
      stops.push(() => near.disconnect())
    }

    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const visible = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting)
            void element.play().catch(() => {})
          else
            element.pause()
        }
      }, { threshold: 0.4 })
      visible.observe(element)
      stops.push(() => visible.disconnect())
    }

    return () => stops.forEach(stop => stop())
  })
</script>

<div class='media'>
  {#if sources}
    <!-- WebM first (smaller), MP4 for the browsers that cannot play it. -->
    <video bind:this={video} poster={eager ? sources.poster : undefined} preload='none' muted loop playsinline aria-label={media.alt}>
      <source src={sources.webm} type='video/webm' />
      <source src={sources.mp4} type='video/mp4' />
    </video>
  {:else}
    <div class='placeholder' role='img' aria-label={media.alt}>
      <span class='kind'>Video</span>
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

  video {
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
