<script lang='ts'>
  import type { CharacterProfile, Profile } from './profile-schema'
  import { untrack } from 'svelte'
  import * as v from 'valibot'
  import { MAX_NAME_LENGTH } from './constants'
  import EntryAvatar from './entry-avatar.svelte'
  import { displayNameSchema } from './profile-schema'

  interface Props {
    /** The signed-in account's name and avatar, to pre-fill the form (issue #232). */
    initialProfile: Profile
    /** Called with the validated profile once the person confirms (FR-009). */
    onConfirm: (profile: Profile) => void
    /** Lets the person switch to another account; the link is hidden when this is not given. */
    onSignOut?: () => void
    /**
     * Set by the parent when saving the profile or joining the room failed — cleared as soon as
     * the person edits the name again.
     */
    joinError?: string
    /**
     * True while a submitted room join is in flight — disables the form and shows a spinner
     * on the submit button, rather than replacing this form with a separate loading screen.
     */
    pending?: boolean
  }

  const { initialProfile, onConfirm, onSignOut, joinError, pending = false }: Props = $props()

  // Read once at component creation: the form edits a copy and hands it back on submit.
  const { displayName: initialName, avatarType, character: initialCharacter } = untrack(() => initialProfile)

  let name = $state(initialName)
  let error = $state<string | undefined>()

  let character: CharacterProfile | undefined = $state(initialCharacter)

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
    onConfirm({ displayName: nameResult.output, avatarType, character })
  }
</script>

<div class='entry-overlay'>
  <form class='entry-form' onsubmit={handleSubmit}>
    <h1>Join the space</h1>

    <div class='entry-body'>
      <EntryAvatar bind:character {pending} />

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

    {#if onSignOut}
      <p class='account-line'>
        Not you?
        <button type='button' class='link' disabled={pending} onclick={onSignOut}>Sign out</button>
      </p>
    {/if}
  </form>
</div>

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

  .fields-column {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }

  .account-line {
    margin: 0;
    color: #9ca3af;
    font-size: 13px;
  }

  .link {
    padding: 0;
    border: 0;
    background: none;
    color: #93c5fd;
    cursor: pointer;
    font: inherit;
    text-decoration: underline;
  }

  .link:disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }

  input[type='text'] {
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
