<script lang='ts'>
  import type { ScreenShareQualityTier } from '$lib/av/screen-share-quality'
  import { SCREEN_SHARE_QUALITY_LABELS, SCREEN_SHARE_QUALITY_TIERS } from '$lib/av/screen-share-quality'

  interface Props {
    /** Pre-selected tier — the last saved choice (issue #111's grill: always pre-filled, never blank). */
    selected: ScreenShareQualityTier
    /** Pre-checked "share audio too" state — the last saved choice (issue #113). */
    audioSelected: boolean
    onConfirm: (tier: ScreenShareQualityTier, shareAudio: boolean) => void
    onCancel: () => void
  }

  const { selected, audioSelected, onConfirm, onCancel }: Props = $props()

  let choice: ScreenShareQualityTier = $state(selected)
  let shareAudio: boolean = $state(audioSelected)

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      onCancel()
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class='popover' role='dialog' aria-label='Screen share quality'>
  <fieldset>
    <legend>Share quality</legend>
    {#each SCREEN_SHARE_QUALITY_TIERS as tier (tier)}
      <label>
        <input type='radio' name='screen-share-quality' value={tier} checked={choice === tier} onchange={() => (choice = tier)} />
        {SCREEN_SHARE_QUALITY_LABELS[tier]}
      </label>
    {/each}
  </fieldset>
  <label>
    <input type='checkbox' checked={shareAudio} onchange={event => (shareAudio = event.currentTarget.checked)} />
    Share audio too
  </label>
  <div class='actions'>
    <button type='button' class='cancel' onclick={onCancel}>Cancel</button>
    <button type='button' class='confirm' onclick={() => onConfirm(choice, shareAudio)}>Share</button>
  </div>
</div>

<style>
  .popover {
    position: fixed;
    bottom: 68px;
    left: 50%;
    z-index: 31;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 16px;
    border-radius: 10px;
    background: rgb(17 24 39 / 96%);
    color: #fff;
    font-size: 14px;
    transform: translateX(-50%);
  }

  fieldset {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 0;
    border: none;
  }

  legend {
    padding: 0 0 4px;
    font-weight: 600;
  }

  label {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .actions button {
    padding: 6px 14px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
  }

  .cancel {
    background: rgb(255 255 255 / 15%);
    color: #fff;
  }

  .confirm {
    background: #fff;
    color: #111827;
    font-weight: 600;
  }
</style>
