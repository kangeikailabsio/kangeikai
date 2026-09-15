<script lang='ts'>
  import type { CharacterProfile, GuestProfile } from './guest-profile-schema'
  import CharacterCreatorModal from '$lib/character/character-creator-modal.svelte'
  import { extractPortrait } from '$lib/character/character-portrait'
  import { generateRandomCharacterProfile } from '$lib/character/character-profile'
  import { onMount } from 'svelte'
  import * as v from 'valibot'
  import { MAX_NAME_LENGTH } from './constants'
  import { generateDefaultName } from './default-name'
  import { displayNameSchema } from './guest-profile-schema'
  import { GuestProfileStore } from './guest-profile-store'

  interface Props {
    /**
     * Called with the validated profile and the (possibly empty) access code once the person
     * confirms (FR-009) — the server decides whether the code is actually required.
     */
    onConfirm: (profile: GuestProfile, accessCode: string) => void
    /**
     * Set by the parent when a previous attempt's room join was rejected (e.g. wrong access
     * code) — cleared as soon as the person edits the code again.
     */
    joinError?: string
    /**
     * True while a submitted room join is in flight — disables the form and shows a spinner
     * on the submit button, rather than replacing this form with a separate loading screen.
     */
    pending?: boolean
  }

  const { onConfirm, joinError, pending = false }: Props = $props()

  // Read once at component creation — pre-fills a returning visitor's previous choice (FR-005,
  // US2), or a friendly generated name for a first-time visitor (FR-006, US3) when nothing is
  // stored.
  const storedProfile = new GuestProfileStore().load()

  let name = $state(storedProfile?.displayName ?? generateDefaultName())
  // Not editable here any more (issue #168 replaces this toggle with the Character Creator
  // below) — kept as-is and passed straight through, since it's still what the map renders
  // from until issue #170 wires that up to `character` instead (issue #169's fallback decision).
  const avatarType = storedProfile?.avatarType ?? 'man'
  // Never persisted — it's a shared room lock, not part of the guest's identity/appearance.
  let accessCode = $state('')
  let error = $state<string | undefined>()

  // Undefined only until the first-visit random avatar finishes composing (onMount below) — the
  // form can't submit without one (see handleSubmit).
  let character: CharacterProfile | undefined = $state(storedProfile?.character)
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

  function handleSubmit(event: SubmitEvent): void {
    event.preventDefault()

    const nameResult = v.safeParse(displayNameSchema, name)
    if (!nameResult.success) {
      error = 'Please enter a name.'
      return
    }

    if (!character) {
      error = 'Your avatar is still being generated — try again in a moment.'
      return
    }

    error = undefined
    onConfirm({ displayName: nameResult.output, avatarType, character }, accessCode)
  }
</script>

<div class='entry-overlay'>
  <form class='entry-form' onsubmit={handleSubmit}>
    <h1>Join the space</h1>

    <div class='entry-body'>
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

      <div class='fields-column'>
        <label for='entry-name'>Name</label>
        <input
          id='entry-name'
          type='text'
          autocomplete='off'
          maxlength={MAX_NAME_LENGTH}
          bind:value={name}
          disabled={pending}
          oninput={() => (error = undefined)}
        />

        <label for='entry-access-code'>Access code (if you have one)</label>
        <input
          id='entry-access-code'
          type='password'
          autocomplete='off'
          bind:value={accessCode}
          disabled={pending}
          oninput={() => (error = undefined)}
        />

        {#if error}
          <p class='error'>{error}</p>
        {:else if joinError}
          <p class='error'>{joinError}</p>
        {/if}

        <button type='submit' disabled={pending}>
          {#if pending}
            <span class='spinner'></span> Connecting…
          {:else}
            Enter
          {/if}
        </button>
      </div>
    </div>
  </form>
</div>

{#if editingAvatar && character}
  <CharacterCreatorModal
    selection={character.selection}
    onSave={handleCharacterSave}
    onClose={() => (editingAvatar = false)}
  />
{/if}

<style>
  .entry-overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #1a1a1a;
  }

  .entry-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 380px;
    max-width: calc(100vw - 32px);
    padding: 24px;
    border-radius: 12px;
    background: #262626;
    color: #fff;
  }

  h1 {
    margin: 0;
    font-size: 18px;
  }

  label {
    font-size: 14px;
  }

  .entry-body {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
  }

  .avatar-column {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .fields-column {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
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

  input[type='text'],
  input[type='password'] {
    padding: 8px;
    border: 1px solid #4a4a4a;
    border-radius: 6px;
    background: #1a1a1a;
    color: #fff;
    font-size: 14px;
  }

  .error {
    margin: 0;
    color: #f87171;
    font-size: 13px;
  }

  button[type='submit'] {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px;
    border: none;
    border-radius: 6px;
    background: #e8a9c9;
    color: #3a2030;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }

  button[type='submit']:disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgb(58 32 48 / 30%);
    border-top-color: #3a2030;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
