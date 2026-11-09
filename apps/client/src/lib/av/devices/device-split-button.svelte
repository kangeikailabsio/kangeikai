<script lang='ts'>
  import type { DeviceKind } from '$lib/av/devices/device-choice-store'
  import type { MediaFailureKind } from '$lib/av/devices/device-error'
  import type { DeviceOption } from '$lib/av/devices/device-list'
  import type { DeviceMenuContent } from '$lib/av/devices/device-menu-model'
  import { listDevices, watchDevices } from '$lib/av/devices/device-list'
  import { deviceMenuContent } from '$lib/av/devices/device-menu-model'
  import { onDestroy, tick } from 'svelte'

  interface Props {
    device: DeviceKind
    /** The text of the main part, which keeps toggling the device on and off. */
    label: string
    /** The main part: off while busy, with no controls yet, or when the device cannot work at all. */
    toggleDisabled: boolean
    /** The chevron: off while busy or with no controls, but open when the device failed, to say why. */
    menuDisabled: boolean
    title?: string
    failure: MediaFailureKind | undefined
    loadChoice: () => { audioinput?: string, videoinput?: string }
    onToggle: () => void
    onSelect: (deviceId: string) => void | Promise<void>
  }

  const { device, label, toggleDisabled, menuDisabled, title, failure, loadChoice, onToggle, onSelect }: Props = $props()

  const noun = $derived(device === 'audioinput' ? 'microphone' : 'camera')

  let open = $state(false)
  let options: DeviceOption[] = $state([])
  let root: HTMLDivElement | undefined = $state()
  let chevron: HTMLButtonElement | undefined = $state()
  let stopWatching: (() => void) | undefined

  const content: DeviceMenuContent = $derived(deviceMenuContent({ options, choice: loadChoice(), device, failure }))

  async function refresh(): Promise<void> {
    options = await listDevices(device)
  }

  async function openMenu(): Promise<void> {
    open = true
    await refresh()
    stopWatching?.()
    stopWatching = watchDevices(() => void refresh())
    await tick()
    focusItem(0)
  }

  function closeMenu(restoreFocus = false): void {
    open = false
    stopWatching?.()
    stopWatching = undefined
    if (restoreFocus)
      chevron?.focus()
  }

  function items(): HTMLButtonElement[] {
    return root ? [...root.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')] : []
  }

  function focusItem(index: number): void {
    const list = items()
    if (list.length === 0)
      return
    // The current device first, so opening and pressing Enter keeps what is selected.
    const current = list.findIndex(item => item.getAttribute('aria-checked') === 'true')
    list[index === 0 && current > 0 ? current : (index + list.length) % list.length]?.focus()
  }

  function handleMenuKeydown(event: KeyboardEvent): void {
    const list = items()
    const at = list.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      list[(at + 1) % list.length]?.focus()
    }
    else if (event.key === 'ArrowUp') {
      event.preventDefault()
      list[(at - 1 + list.length) % list.length]?.focus()
    }
    else if (event.key === 'Escape') {
      event.preventDefault()
      closeMenu(true)
    }
    else if (event.key === 'Tab') {
      closeMenu()
    }
  }

  function handleWindowPointerdown(event: PointerEvent): void {
    if (open && root && !root.contains(event.target as Node))
      closeMenu()
  }

  async function choose(deviceId: string): Promise<void> {
    closeMenu(true)
    await onSelect(deviceId)
  }

  // Busy turns the menu off while it is open.
  $effect(() => {
    if (menuDisabled && open)
      closeMenu()
  })

  onDestroy(() => stopWatching?.())
</script>

<svelte:window onpointerdown={handleWindowPointerdown} />

<div class='split' bind:this={root}>
  <button type='button' class='main' disabled={toggleDisabled} {title} onclick={onToggle}>
    {label}
  </button>
  <button
    type='button'
    class='chevron'
    aria-label={`Choose ${noun}`}
    aria-haspopup='menu'
    aria-expanded={open}
    disabled={menuDisabled}
    {title}
    bind:this={chevron}
    onclick={() => (open ? closeMenu() : void openMenu())}
  >
    ▾
  </button>
  {#if open}
    <!-- Keys are handled on the menu itself: it only takes them while one of its items has focus. -->
    <div class='menu' role='menu' aria-label={`${noun} devices`} tabindex='-1' onkeydown={handleMenuKeydown}>
      {#if content.kind === 'devices'}
        {#each content.entries as entry (entry.deviceId)}
          <button type='button' role='menuitemradio' aria-checked={entry.current} onclick={() => void choose(entry.deviceId)}>
            <span class='mark' aria-hidden='true'>{entry.current ? '✓' : ''}</span>{entry.label}
          </button>
        {/each}
      {:else}
        <p class='note' role='status'>{content.text}</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .split {
    position: relative;
    display: flex;
  }

  .split > button {
    padding: 8px 16px;
    border: none;
    background: rgb(0 0 0 / 70%);
    color: #fff;
    cursor: pointer;
  }

  .main {
    border-radius: 8px 0 0 8px;
  }

  .chevron {
    padding-inline: 8px !important;
    border-left: 1px solid rgb(255 255 255 / 20%) !important;
    border-radius: 0 8px 8px 0;
  }

  .split > button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .menu {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 0;
    z-index: 31;
    display: flex;
    min-width: 220px;
    max-width: 320px;
    flex-direction: column;
    padding: 4px;
    border-radius: 8px;
    background: rgb(0 0 0 / 88%);
    color: #fff;
  }

  .menu button {
    display: flex;
    gap: 8px;
    padding: 8px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    text-align: left;
  }

  .menu button:hover,
  .menu button:focus-visible {
    background: rgb(255 255 255 / 15%);
  }

  .mark {
    width: 1em;
    flex: none;
  }

  .note {
    margin: 0;
    padding: 8px;
    font-size: 0.9em;
  }
</style>
