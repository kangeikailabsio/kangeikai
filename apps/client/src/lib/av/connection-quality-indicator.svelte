<script lang='ts'>
  import type { ConnectionQuality } from 'livekit-client'
  import { connectionQualityDisplayState } from '$lib/av/connection-quality-display-state.svelte'

  interface Props {
    quality: ConnectionQuality
  }

  const { quality }: Props = $props()

  /** Collapses LiveKit's 5-value enum to the simple good/poor/lost/unknown read the issue asked for — no bitrate/packet-loss numbers. */
  const LABELS: Record<ConnectionQuality, string> = {
    excellent: 'Good connection',
    good: 'Good connection',
    poor: 'Poor connection',
    lost: 'Connection lost',
    unknown: 'Checking connection…',
  }
</script>

{#if connectionQualityDisplayState.enabled}
  <div class='connection-quality-indicator'>
    <span class='dot' class:poor={quality === 'poor'} class:lost={quality === 'lost'} class:unknown={quality === 'unknown'}></span>
    {LABELS[quality]}
  </div>
{/if}

<style>
  .connection-quality-indicator {
    position: fixed;
    top: 48px;
    right: 16px;
    z-index: 30;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-radius: 6px;
    background: rgb(17 24 39 / 80%);
    color: #fff;
    font-size: 12px;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: #22c55e;
    flex-shrink: 0;
  }

  .dot.poor {
    background: #f59e0b;
  }

  .dot.lost {
    background: #ef4444;
  }

  .dot.unknown {
    background: #6b7280;
  }
</style>
