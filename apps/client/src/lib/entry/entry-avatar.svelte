<script lang='ts'>
  import type { CharacterProfile } from './profile-schema'
  import CharacterCreatorModal from '$lib/character/character-creator-modal.svelte'
  import { extractPortrait } from '$lib/character/character-portrait'
  import { generateRandomCharacterProfile } from '$lib/character/character-profile'
  import { onMount } from 'svelte'

  interface Props {
    /**
     * The avatar being edited. `undefined` only until the first-time random avatar finishes
     * composing (below): the entry form cannot submit without one.
     */
    character: CharacterProfile | undefined
    pending?: boolean
  }

  let { character = $bindable(), pending = false }: Props = $props()

  let avatarPreviewUrl: string | undefined = $state()
  let editingAvatar = $state(false)

  async function refreshAvatarPreview(): Promise<void> {
    if (character) {
      avatarPreviewUrl = await extractPortrait(character.sheets.idle, 'down')
    }
  }

  onMount(() => {
    if (character) {
      void refreshAvatarPreview()
    }
    else {
      void generateRandomCharacterProfile().then((profile) => {
        character = profile
        void refreshAvatarPreview()
      })
    }
  })

  function handleCharacterSave(profile: CharacterProfile): void {
    character = profile
    editingAvatar = false
    void refreshAvatarPreview()
  }
</script>

<div class='avatar-column'>
  {#if avatarPreviewUrl}
    <img src={avatarPreviewUrl} alt='Your avatar' class='avatar-preview' />
  {:else}
    <div class='avatar-preview-placeholder'></div>
  {/if}
  <button type='button' disabled={pending || !character} onclick={() => (editingAvatar = true)}>
    {character ? 'Edit avatar' : 'Generating avatar…'}
  </button>
</div>

{#if editingAvatar && character}
  <CharacterCreatorModal
    selection={character.selection}
    onSave={handleCharacterSave}
    onClose={() => (editingAvatar = false)}
  />
{/if}

<style>
  .avatar-column {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .avatar-preview {
    width: 64px;
    height: 128px;
    image-rendering: pixelated;
  }

  .avatar-preview-placeholder {
    width: 64px;
    height: 128px;
    border-radius: 6px;
    background: #1a1a1a;
  }

  .avatar-column button {
    padding: 6px 10px;
    border: 1px solid #4a4a4a;
    border-radius: 6px;
    background: transparent;
    color: #fff;
    font-size: 12px;
    text-align: center;
    cursor: pointer;
  }

  .avatar-column button:disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }
</style>
