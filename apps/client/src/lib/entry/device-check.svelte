<script lang='ts'>
  import type { DeviceKind } from '$lib/av/devices/device-choice-store'
  import type { DeviceOption } from '$lib/av/devices/device-list'
  import type { DevicePreview, PreviewKind, PreviewSnapshot } from '$lib/av/devices/device-preview'
  import type { LocalVideoTrack } from 'livekit-client'
  import { attachVideoTrack } from '$lib/av/attach-video-track'
  import { DeviceChoiceStore } from '$lib/av/devices/device-choice-store'
  import { listDevices, resolveDevice, watchDevices } from '$lib/av/devices/device-list'
  import { deviceStatusText } from '$lib/av/devices/device-status-text'
  import { onMount } from 'svelte'

  interface Props {
    preview: DevicePreview
    snapshot: PreviewSnapshot
    pending?: boolean
  }

  const { preview, snapshot, pending = false }: Props = $props()

  // What was chosen on an earlier visit, shown while a device is off or failed and has no live track to read.
  const saved = new DeviceChoiceStore().load()
  const chosen = $state<Record<DeviceKind, string | undefined>>({ audioinput: saved.audioinput, videoinput: saved.videoinput })
  let options = $state<Record<DeviceKind, DeviceOption[]>>({ audioinput: [], videoinput: [] })

  async function refresh(): Promise<void> {
    const [audioinput, videoinput] = await Promise.all([listDevices('audioinput'), listDevices('videoinput')])
    options = { audioinput, videoinput }
  }

  // Labels only exist once the browser has granted permission, so the lists are read again whenever a device starts or fails.
  $effect(() => {
    void snapshot.microphone.status
    void snapshot.camera.status
    void refresh()
  })

  onMount(() => watchDevices(() => void refresh()))

  function selectedId(kind: PreviewKind, deviceKind: DeviceKind): string {
    const active = snapshot[kind].track?.mediaStreamTrack.getSettings().deviceId
    return active ?? resolveDevice(options[deviceKind], chosen[deviceKind]) ?? ''
  }

  function choose(deviceKind: DeviceKind, deviceId: string): void {
    chosen[deviceKind] = deviceId
    void preview.selectDevice(deviceKind, deviceId)
  }

  const cameraStatus = $derived(snapshot.camera.status)
  const cameraTrack = $derived(snapshot.camera.track as LocalVideoTrack | undefined)
</script>

{#snippet deviceRow(kind: PreviewKind, deviceKind: DeviceKind, label: string)}
  {@const device = snapshot[kind]}
  {@const list = options[deviceKind]}
  <div class='device-row'>
    <label for='device-{kind}'>{label}</label>
    <select
      id='device-{kind}'
      aria-label='{label} device'
      disabled={pending || list.length === 0 || device.status === 'blocked'}
      value={selectedId(kind, deviceKind)}
      onchange={event => choose(deviceKind, event.currentTarget.value)}
    >
      {#if list.length === 0}
        <option value=''>Default</option>
      {/if}
      {#each list as option (option.deviceId)}
        <option value={option.deviceId}>{option.label}</option>
      {/each}
    </select>
    <button
      type='button'
      role='switch'
      class='switch'
      aria-checked={device.wanted}
      aria-label={label}
      disabled={pending}
      onclick={() => void preview.setWanted(kind, !device.wanted)}
    >
      <span class='knob'></span>
    </button>
  </div>
  {#if deviceStatusText(kind, device.status)}
    <p class='device-note' role='status'>{deviceStatusText(kind, device.status)}</p>
  {/if}
{/snippet}

<div class='device-check'>
  <div class='camera-preview' aria-label='Camera preview'>
    {#if cameraStatus === 'on' && cameraTrack}
      <video use:attachVideoTrack={cameraTrack} autoplay playsinline muted></video>
    {:else}
      <span class='camera-placeholder'>
        {#if cameraStatus === 'starting'}
          Starting camera…
        {:else if cameraStatus === 'off'}
          Camera off
        {:else}
          Camera unavailable
        {/if}
      </span>
    {/if}
  </div>

  {@render deviceRow('camera', 'videoinput', 'Camera')}
  {@render deviceRow('microphone', 'audioinput', 'Microphone')}
</div>

<style>
  .device-check {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }

  .camera-preview {
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    aspect-ratio: 16 / 9;
    border-radius: 8px;
    background: #1a1a1a;
  }

  .camera-preview video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transform: scaleX(-1);
  }

  .camera-placeholder {
    padding: 12px;
    color: #9ca3af;
    font-size: 13px;
    text-align: center;
  }

  .device-row {
    display: grid;
    grid-template-columns: 84px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
  }

  label {
    font-size: 14px;
  }

  select {
    min-width: 0;
    padding: 8px;
    border: 1px solid #4a4a4a;
    border-radius: 6px;
    background: #1a1a1a;
    color: #fff;
    font: inherit;
    font-size: 13px;
    text-overflow: ellipsis;
  }

  select:disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }

  select:focus-visible,
  .switch:focus-visible {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
  }

  .switch {
    position: relative;
    width: 40px;
    height: 22px;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: #4a4a4a;
    cursor: pointer;
    transition: background 0.15s;
  }

  .switch[aria-checked='true'] {
    background: #3b82f6;
  }

  .switch:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.15s;
  }

  .switch[aria-checked='true'] .knob {
    transform: translateX(18px);
  }

  .device-note {
    margin: -4px 0 0;
    color: #fca5a5;
    font-size: 12px;
  }
</style>
