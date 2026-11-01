<script lang='ts'>
  import type { ShareStats } from '$lib/av/screen-share-stats'

  interface Props {
    stats: ShareStats | undefined
    open: boolean
    onToggle: () => void
  }

  const { stats, open, onToggle }: Props = $props()

  const level = $derived(stats?.level ?? 'checking')

  function fixed(value: number | undefined, digits = 0): string {
    return value === undefined ? '–' : value.toFixed(digits)
  }

  function mbps(kbps: number | undefined): string {
    return kbps === undefined ? '–' : `${(kbps / 1000).toFixed(2)} Mbps`
  }
</script>

<div class='stats-badge'>
  <button
    type='button'
    class='badge'
    aria-label='Screen share connection details'
    aria-expanded={open}
    onclick={onToggle}
  >
    <span class='bars {level}' aria-hidden='true'>
      <i></i><i></i><i></i>
    </span>
    {stats?.summary ?? 'Checking connection…'}
  </button>

  {#if open && stats}
    <div class='popover' role='dialog' aria-label='Screen share stats'>
      <p class='headline'>{stats.summary}</p>
      {#if stats.cause}
        <p class='cause'>{stats.cause}</p>
      {/if}
      <dl>
        <dt>Bitrate</dt>
        <dd>{mbps(stats.bitrateKbps)}</dd>
        <dt>Resolution</dt>
        <dd>{stats.width && stats.height ? `${stats.width}×${stats.height}` : '–'}</dd>
        <dt>Frame rate</dt>
        <dd>{fixed(stats.fps)} fps</dd>
        <dt>Packet loss</dt>
        <dd>{fixed(stats.lossPercent, 1)}%</dd>
        <dt>Latency</dt>
        <dd>{fixed(stats.rttMs)} ms</dd>
        <dt>Transport</dt>
        <dd>{stats.transport ?? '–'}</dd>
        {#if stats.role === 'receiver'}
          <dt>Jitter</dt>
          <dd>{fixed(stats.jitterMs, 1)} ms</dd>
          <dt>Dropped frames</dt>
          <dd>{fixed(stats.framesDropped)}</dd>
          <dt>Freezes</dt>
          <dd>{fixed(stats.freezeCount)}</dd>
        {:else}
          <dt>Limited by</dt>
          <dd>{stats.limitationReason && stats.limitationReason !== 'none' ? stats.limitationReason : 'nothing'}</dd>
          <dt>Available upload</dt>
          <dd>{mbps(stats.availableOutgoingKbps)}</dd>
        {/if}
      </dl>
    </div>
  {/if}
</div>

<style>
  .stats-badge {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 1;
  }

  .badge {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border: none;
    border-radius: 6px;
    background: rgb(0 0 0 / 60%);
    color: #fff;
    font-size: 12px;
    cursor: pointer;
  }

  .bars {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 12px;
  }

  .bars i {
    display: block;
    width: 3px;
    border-radius: 1px;
    background: #6b7280;
  }

  .bars i:nth-child(1) { height: 4px; }
  .bars i:nth-child(2) { height: 8px; }
  .bars i:nth-child(3) { height: 12px; }

  .bars.good i { background: #22c55e; }
  .bars.unstable i:nth-child(-n + 2) { background: #f59e0b; }
  .bars.poor i:nth-child(1) { background: #ef4444; }

  .popover {
    margin-top: 6px;
    min-width: 220px;
    padding: 10px 12px;
    border-radius: 8px;
    background: rgb(17 24 39 / 95%);
    color: #fff;
    font-size: 12px;
  }

  .headline {
    margin: 0;
    font-weight: 600;
    font-size: 13px;
  }

  .cause {
    margin: 4px 0 0;
    color: #fbbf24;
  }

  dl {
    display: grid;
    grid-template-columns: auto auto;
    gap: 2px 16px;
    margin: 8px 0 0;
  }

  dt {
    color: #9ca3af;
  }

  dd {
    margin: 0;
    text-align: right;
  }
</style>
