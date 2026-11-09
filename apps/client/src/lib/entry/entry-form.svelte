<script lang='ts'>
  import type { MediaIntent } from '$lib/av/devices/media-intent'
  import type { CharacterProfile, Profile } from './profile-schema'
  import { DeviceChoiceStore } from '$lib/av/devices/device-choice-store'
  import { DevicePreview, idleSnapshot } from '$lib/av/devices/device-preview'
  import { createLocalTracks } from 'livekit-client'
  import { onDestroy, untrack } from 'svelte'
  import * as v from 'valibot'
  import { MAX_NAME_LENGTH } from './constants'
  import DeviceCheck from './device-check.svelte'
  import EntryAvatar from './entry-avatar.svelte'
  import { displayNameSchema } from './profile-schema'

  interface Props {
    /** The signed-in account's name and avatar, to pre-fill the form (issue #232). */
    initialProfile: Profile
    /**
     * Called with the validated profile once the person confirms (FR-009), and with the microphone
     * and camera state they left the switches in: that is how they enter the room (issue #246).
     */
    onConfirm: (profile: Profile, media: MediaIntent) => void
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

  // The live microphone and camera (issue #246). Independent of the room: it is stopped the moment a join starts,
  // and the room captures again with the devices chosen here.
  const choiceStore = new DeviceChoiceStore()
  let previewState = $state(idleSnapshot())
  const preview = new DevicePreview({
    createTracks: request => createLocalTracks(request) as never,
    loadChoice: () => choiceStore.load(),
    saveChoice: (kind, deviceId) => choiceStore.choose(kind, deviceId),
  }, (next) => { previewState = next })

  // Starts on its own, as soon as the form is there. While a join is in flight the devices are released, so the room can
  // have them (and the camera light goes off); if the join fails the form comes back and they start again.
  $effect(() => {
    if (pending)
      preview.stop()
    else
      void preview.start()
  })
  onDestroy(() => preview.stop())

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
    onConfirm({ displayName: nameResult.output, avatarType, character }, preview.intent())
  }
</script>

<div class='entry-overlay'>
  <form class='entry-form' onsubmit={handleSubmit}>
    <h1>Join the space</h1>

    <div class='entry-body'>
      <div class='identity'>
        <EntryAvatar bind:character {pending} />
        <div class='name-field'>
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
        </div>
      </div>

      <DeviceCheck {preview} snapshot={previewState} {pending} />
    </div>

    {#if error}
      <p class='error'>{error}</p>
    {:else if joinError}
      <p class='error'>{joinError}</p>
    {/if}

    <div class='entry-footer'>
      {#if onSignOut}
        <p class='account-line'>
          Not you?
          <button type='button' class='link' disabled={pending} onclick={onSignOut}>Sign out</button>
        </p>
      {:else}
        <span></span>
      {/if}
      <button type='submit' class='enter' disabled={pending}>
        {#if pending}
          <span class='spinner'></span> Connecting…
        {:else}
          Enter
        {/if}
      </button>
    </div>
  </form>
</div>

<style>
  .entry-overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow-y: auto;
    background: #1a1a1a;
  }

  .entry-form {
    display: flex;
    flex-direction: column;
    gap: 20px;
    width: 760px;
    max-width: calc(100vw - 32px);
    margin: auto;
    padding: 24px;
    border-radius: 12px;
    background: #262626;
    color: #fff;
  }

  h1 {
    margin: 0;
    font-size: 20px;
    text-align: center;
  }

  label {
    font-size: 14px;
  }

  .entry-body {
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr);
    gap: 28px;
    align-items: start;
  }

  .identity {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }

  .name-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  input[type='text'] {
    padding: 8px;
    border: 1px solid #4a4a4a;
    border-radius: 6px;
    background: #1a1a1a;
    color: #fff;
    font-size: 14px;
  }

  input[type='text']:disabled {
    opacity: 0.7;
  }

  .error {
    margin: 0;
    color: #f87171;
    font-size: 13px;
  }

  .entry-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
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

  .enter {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-width: 120px;
    padding: 10px 20px;
    border: 0;
    border-radius: 6px;
    background: #3b82f6;
    color: #fff;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
  }

  .enter:hover:not(:disabled) {
    background: #2563eb;
  }

  .enter:disabled {
    cursor: not-allowed;
    opacity: 0.8;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgb(255 255 255 / 40%);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 640px) {
    .entry-body {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
