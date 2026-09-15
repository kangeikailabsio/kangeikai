<script lang='ts'>
  import type { CharacterProfile } from '$lib/entry/guest-profile-schema'
  import type { AvatarDirection, CharacterSelection } from '@kangeikai/shared'
  import { buildCharacterManifest, resolvePieceUrl } from '$lib/character/character-pieces'
  import { extractPortrait } from '$lib/character/character-portrait'
  import { composeCharacterSheets } from '$lib/character/compose-character'
  import { isValidCharacterSelection, randomCharacterSelection, stylesOf, variantsOf } from '@kangeikai/shared'
  import { onMount, untrack } from 'svelte'

  interface Props {
    selection: CharacterSelection
    onSave: (profile: CharacterProfile) => void
    onClose: () => void
  }

  const { selection, onSave, onClose }: Props = $props()

  const manifest = buildCharacterManifest()
  const outfitStyles = stylesOf(manifest.outfit)
  const hairstyleStyles = stylesOf(manifest.hairstyle)
  const accessoryStyles = stylesOf(manifest.accessory)

  const PREVIEW_DIRECTIONS: { direction: AvatarDirection, label: string }[] = [
    { direction: 'down', label: 'Front' },
    { direction: 'right', label: 'Side' },
    { direction: 'up', label: 'Back' },
  ]

  function pad(value: number): string {
    return value.toString().padStart(2, '0')
  }

  // Fall back to a fresh random selection if the incoming one no longer matches the bundled
  // pieces (e.g. a stale localStorage value from before an asset change) — better than a modal
  // that opens with a piece that resolves to nothing. Read once with `untrack` — `working` is an
  // editable copy the modal owns from here on, not a live binding to the `selection` prop.
  //
  // `selection` arrives as a reactive $state proxy (it's read off the caller's own $state), and
  // structuredClone() can't clone that directly (DataCloneError) — $state.snapshot() strips the
  // reactivity into a plain object first, which also makes the extra structuredClone unnecessary.
  const working = $state<CharacterSelection>(
    untrack(() => {
      const plainSelection = $state.snapshot(selection)
      return isValidCharacterSelection(plainSelection, manifest) ? plainSelection : randomCharacterSelection(manifest)
    }),
  )

  let previewDirection: AvatarDirection = $state('down')
  let previewUrl: string | undefined = $state()
  let currentIdleSheet: string | undefined
  let composeToken = 0
  let saving = $state(false)

  async function updatePreviewFrame(): Promise<void> {
    if (!currentIdleSheet)
      return
    const token = composeToken
    const url = await extractPortrait(currentIdleSheet, previewDirection)
    if (token === composeToken)
      previewUrl = url
  }

  async function recompose(): Promise<void> {
    const token = ++composeToken
    const sheets = await composeCharacterSheets(working)
    if (token !== composeToken)
      return
    currentIdleSheet = sheets.idle
    await updatePreviewFrame()
  }

  onMount(() => {
    void recompose()
  })

  function rotate(direction: AvatarDirection): void {
    previewDirection = direction
    void updatePreviewFrame()
  }

  function setBody(style: number): void {
    working.body = style
    void recompose()
  }

  function setEyes(style: number): void {
    working.eyes = style
    void recompose()
  }

  function setOutfitStyle(style: number): void {
    working.outfit = { style, variant: variantsOf(manifest.outfit, style)[0] }
    void recompose()
  }

  function setOutfitVariant(variant: number): void {
    working.outfit = { ...working.outfit, variant }
    void recompose()
  }

  function setHairstyleStyle(style: number): void {
    working.hairstyle = { style, variant: variantsOf(manifest.hairstyle, style)[0] }
    void recompose()
  }

  function setHairstyleVariant(variant: number): void {
    working.hairstyle = { ...working.hairstyle, variant }
    void recompose()
  }

  function setAccessoryStyle(style: number | null): void {
    working.accessory = style === null ? null : { style, variant: variantsOf(manifest.accessory, style)[0] }
    void recompose()
  }

  function setAccessoryVariant(variant: number): void {
    if (working.accessory)
      working.accessory = { ...working.accessory, variant }
    void recompose()
  }

  function shuffle(): void {
    Object.assign(working, randomCharacterSelection(manifest))
    void recompose()
  }

  function outfitVariants(): number[] {
    return variantsOf(manifest.outfit, working.outfit.style)
  }

  function hairstyleVariants(): number[] {
    return variantsOf(manifest.hairstyle, working.hairstyle.style)
  }

  function accessoryVariants(): number[] {
    return working.accessory ? variantsOf(manifest.accessory, working.accessory.style) : []
  }

  /**
   * The accessory's display name (e.g. "dino snapback"), read back out of its filename since
   * the manifest itself only carries style/variant numbers. Any variant of the style has the
   * same name in its filename, so this resolves the first one rather than requiring a specific
   * variant to already be selected.
   */
  function accessoryLabel(style: number): string {
    const firstVariant = variantsOf(manifest.accessory, style)[0]
    const url = resolvePieceUrl('accessory', { style, variant: firstVariant })
    const match = url?.match(/accessory-\d+-(.+)-\d+\.png$/)
    return match ? match[1].replaceAll('-', ' ') : `Accessory ${pad(style)}`
  }

  async function handleSave(): Promise<void> {
    saving = true
    const sheets = await composeCharacterSheets(working)
    saving = false
    onSave({ selection: $state.snapshot(working), sheets })
  }
</script>

<div class='creator-overlay' role='dialog' aria-modal='true' aria-label='Character Creator'>
  <div class='creator-modal'>
    <h2>Edit your avatar</h2>

    <div class='preview'>
      {#if previewUrl}
        <img src={previewUrl} alt='Avatar preview' class='preview-image' />
      {:else}
        <div class='preview-placeholder'></div>
      {/if}
      <div class='rotate-controls'>
        {#each PREVIEW_DIRECTIONS as { direction, label } (direction)}
          <button type='button' class:active={previewDirection === direction} onclick={() => rotate(direction)}>
            {label}
          </button>
        {/each}
      </div>
    </div>

    <div class='slots'>
      <label>
        Body
        <select value={working.body} onchange={e => setBody(Number(e.currentTarget.value))}>
          {#each manifest.body as style (style)}
            <option value={style}>Body {pad(style)}</option>
          {/each}
        </select>
      </label>

      <label>
        Eyes
        <select value={working.eyes} onchange={e => setEyes(Number(e.currentTarget.value))}>
          {#each manifest.eyes as style (style)}
            <option value={style}>Eyes {pad(style)}</option>
          {/each}
        </select>
      </label>

      <label>
        Outfit style
        <select value={working.outfit.style} onchange={e => setOutfitStyle(Number(e.currentTarget.value))}>
          {#each outfitStyles as style (style)}
            <option value={style}>Outfit {pad(style)}</option>
          {/each}
        </select>
      </label>
      <label>
        Outfit variant
        <select value={working.outfit.variant} onchange={e => setOutfitVariant(Number(e.currentTarget.value))}>
          {#each outfitVariants() as variant (variant)}
            <option value={variant}>{pad(variant)}</option>
          {/each}
        </select>
      </label>

      <label>
        Hairstyle style
        <select value={working.hairstyle.style} onchange={e => setHairstyleStyle(Number(e.currentTarget.value))}>
          {#each hairstyleStyles as style (style)}
            <option value={style}>Hairstyle {pad(style)}</option>
          {/each}
        </select>
      </label>
      <label>
        Hairstyle variant
        <select value={working.hairstyle.variant} onchange={e => setHairstyleVariant(Number(e.currentTarget.value))}>
          {#each hairstyleVariants() as variant (variant)}
            <option value={variant}>{pad(variant)}</option>
          {/each}
        </select>
      </label>

      <label>
        Accessory
        <select
          value={working.accessory ? working.accessory.style : ''}
          onchange={e => setAccessoryStyle(e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
        >
          <option value=''>None</option>
          {#each accessoryStyles as style (style)}
            <option value={style}>{accessoryLabel(style)}</option>
          {/each}
        </select>
      </label>
      {#if working.accessory}
        <label>
          Accessory variant
          <select value={working.accessory.variant} onchange={e => setAccessoryVariant(Number(e.currentTarget.value))}>
            {#each accessoryVariants() as variant (variant)}
              <option value={variant}>{pad(variant)}</option>
            {/each}
          </select>
        </label>
      {/if}
    </div>

    <div class='actions'>
      <button type='button' class='shuffle' onclick={shuffle}>Shuffle</button>
      <div class='actions-right'>
        <button type='button' class='cancel' onclick={onClose}>Cancel</button>
        <button type='button' class='save' disabled={saving} onclick={handleSave}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .creator-overlay {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgb(0 0 0 / 60%);
  }

  .creator-modal {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: min(420px, calc(100vw - 32px));
    max-height: calc(100vh - 32px);
    overflow-y: auto;
    padding: 24px;
    border-radius: 12px;
    background: #262626;
    color: #fff;
  }

  h2 {
    margin: 0;
    font-size: 16px;
  }

  .preview {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .preview-image {
    width: 64px;
    height: 128px;
    image-rendering: pixelated;
  }

  .preview-placeholder {
    width: 64px;
    height: 128px;
    border-radius: 6px;
    background: #1a1a1a;
  }

  .rotate-controls {
    display: flex;
    gap: 6px;
  }

  .rotate-controls button {
    padding: 4px 10px;
    border: 1px solid #4a4a4a;
    border-radius: 6px;
    background: transparent;
    color: #fff;
    font-size: 12px;
    cursor: pointer;
  }

  .rotate-controls button.active {
    border-color: #e8a9c9;
    background: #e8a9c9;
    color: #3a2030;
  }

  .slots {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
  }

  select {
    padding: 6px;
    border: 1px solid #4a4a4a;
    border-radius: 6px;
    background: #1a1a1a;
    color: #fff;
    font-size: 13px;
  }

  .actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .actions-right {
    display: flex;
    gap: 8px;
  }

  button.shuffle,
  button.cancel {
    padding: 8px 14px;
    border: 1px solid #4a4a4a;
    border-radius: 6px;
    background: transparent;
    color: #fff;
    font-size: 13px;
    cursor: pointer;
  }

  button.save {
    padding: 8px 14px;
    border: none;
    border-radius: 6px;
    background: #e8a9c9;
    color: #3a2030;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  button.save:disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }
</style>
