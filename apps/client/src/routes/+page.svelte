<script lang='ts'>
  import type { MediaControls } from '$lib/av/media-controls'
  import type { GuestProfile } from '$lib/entry/guest-profile-schema'
  import type { RoomConnection } from '$lib/network/room-connection'
  import type { AvatarPresence } from '@kangeikai/shared'
  import AvatarVideoOverlay from '$lib/av/avatar-video-overlay.svelte'
  import BusyOverlay from '$lib/av/busy-overlay.svelte'
  import EntryForm from '$lib/entry/entry-form.svelte'
  import { GuestProfileStore } from '$lib/entry/guest-profile-store'
  import { LOCAL_PRESENCE_EVENT, MEDIA_CONTROLS_READY_EVENT, OfficeScene, ROOM_CONNECTION_READY_EVENT, ROOM_JOIN_FAILED_EVENT, ROOM_JOINED_EVENT, SCREEN_SHARE_ENDED_EVENT } from '$lib/game/scenes/office-scene'
  import MembersSidebar from '$lib/people/members-sidebar.svelte'
  import { rosterState } from '$lib/people/roster-state.svelte'
  import Toast from '$lib/ui/toast.svelte'
  import Phaser from 'phaser'
  import { onDestroy } from 'svelte'

  let gameContainer: HTMLDivElement
  let game: Phaser.Game | undefined

  const guestProfileStore = new GuestProfileStore()

  let guestProfile: GuestProfile | undefined = $state()
  // True from the moment the game is constructed until the Colyseus join actually succeeds —
  // keeps EntryForm mounted (pending) instead of revealing the map, so it never flashes
  // visible right before a possible access-code rejection (ROOM_JOIN_FAILED_EVENT).
  let connecting = $state(false)
  let joinError: string | undefined = $state()
  let mediaControls: MediaControls | undefined = $state()
  let micEnabled = $state(false)
  let cameraEnabled = $state(false)
  let shareEnabled = $state(false)
  let micUnavailable = $state(false)
  let cameraUnavailable = $state(false)
  let shareUnavailable = $state(false)
  let localPresence: AvatarPresence = $state('available')
  let membersOpen = $state(false)
  let unwireRoster: (() => void) | undefined

  /** Mounts the game only once entry is confirmed (FR-009) — see `EntryForm` below. */
  function handleEntryConfirm(profile: GuestProfile, accessCode: string): void {
    guestProfileStore.save(profile)
    joinError = undefined
    guestProfile = profile
    connecting = true

    game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: gameContainer,
      width: window.innerWidth,
      height: window.innerHeight,
      // Nearest-neighbor texture filtering, so the 32px-tile art stays crisp at any of the
      // camera's zoom levels (office-scene.ts's DEFAULT_ZOOM/MAX_ZOOM) instead of blurring like
      // photo content would.
      pixelArt: true,
      scale: {
        // Keeps the canvas (and, via CameraManager.onResize, the main camera) in sync with
        // gameContainer's size on every browser window resize (FR-006 Edge Case / T026).
        mode: Phaser.Scale.RESIZE,
      },
      scene: [],
    })

    game.scene.add('office', OfficeScene, true, { displayName: profile.displayName, spriteType: profile.avatarType, accessCode })

    rosterState.reset()
    rosterState.setLocalName(profile.displayName)
    game.events.on(ROOM_CONNECTION_READY_EVENT, (roomConnection: RoomConnection) => {
      unwireRoster = rosterState.connect(roomConnection)
    })

    // OfficeScene creates MediaControls only once its own LiveKit room connection resolves
    // (spec 003 FR-008's same gating, reused for media) — see office-scene.ts.
    game.events.on(MEDIA_CONTROLS_READY_EVENT, (controls: MediaControls) => {
      mediaControls = controls
      micEnabled = controls.microphoneEnabled
      cameraEnabled = controls.cameraEnabled
      shareEnabled = controls.screenShareEnabled
      micUnavailable = controls.microphoneUnavailable
      cameraUnavailable = controls.cameraUnavailable
      shareUnavailable = controls.screenShareUnavailable
    })

    // Fires both for our own "Share screen" toggle and for the browser's native "Stop
    // sharing" control — either way the track is gone, so the button always reflects it.
    game.events.on(SCREEN_SHARE_ENDED_EVENT, () => {
      shareEnabled = false
    })

    game.events.on(LOCAL_PRESENCE_EVENT, (presence: AvatarPresence) => {
      localPresence = presence
      rosterState.setLocalPresence(presence)
    })

    game.events.on(ROOM_JOINED_EVENT, () => {
      connecting = false
    })

    // Most likely a wrong/missing access code (OfficeRoom.onAuth) — there's no meaningful
    // in-game state to show, so tear down and let the person try again from the entry form.
    game.events.on(ROOM_JOIN_FAILED_EVENT, () => {
      game?.destroy(true)
      game = undefined
      guestProfile = undefined
      connecting = false
      joinError = 'Could not join — check the access code and try again.'
      unwireRoster?.()
      rosterState.reset()
      membersOpen = false
    })
  }

  onDestroy(() => {
    game?.destroy(true)
    unwireRoster?.()
  })

  async function toggleMicrophone(): Promise<void> {
    if (localPresence === 'busy' || !mediaControls) {
      return
    }
    await mediaControls.setMicrophoneEnabled(!micEnabled)
    micEnabled = mediaControls.microphoneEnabled
    micUnavailable = mediaControls.microphoneUnavailable
  }

  async function toggleCamera(): Promise<void> {
    if (localPresence === 'busy' || !mediaControls) {
      return
    }
    await mediaControls.setCameraEnabled(!cameraEnabled)
    cameraEnabled = mediaControls.cameraEnabled
    cameraUnavailable = mediaControls.cameraUnavailable
  }

  async function toggleScreenShare(): Promise<void> {
    if (localPresence === 'busy' || !mediaControls) {
      return
    }
    await mediaControls.setScreenShareEnabled(!shareEnabled)
    shareEnabled = mediaControls.screenShareEnabled
    shareUnavailable = mediaControls.screenShareUnavailable
  }

  async function toggleBusy(): Promise<void> {
    const officeScene = game?.scene.getScene('office') as OfficeScene | undefined
    await officeScene?.toggleBusyPresence()
  }
</script>

<div class='game-container' bind:this={gameContainer}>
  {#if guestProfile && !connecting}
    <AvatarVideoOverlay />
    <BusyOverlay active={localPresence === 'busy'} />
    <MembersSidebar open={membersOpen} />
    <Toast />
  {/if}
</div>

{#if !guestProfile || connecting}
  <EntryForm onConfirm={handleEntryConfirm} {joinError} pending={connecting} />
{:else}
  <div class='media-controls'>
    <button
      type='button'
      disabled={!mediaControls || micUnavailable || localPresence === 'busy'}
      title={localPresence === 'busy' ? 'Turn off Busy to use Mute' : undefined}
      onclick={toggleMicrophone}
    >
      {micUnavailable ? '🔇 Mic unavailable' : micEnabled ? '🎤 Mute' : '🔇 Unmute'}
    </button>
    <button
      type='button'
      disabled={!mediaControls || cameraUnavailable || localPresence === 'busy'}
      title={localPresence === 'busy' ? 'Turn off Busy to use Camera' : undefined}
      onclick={toggleCamera}
    >
      {cameraUnavailable ? '📷 Camera unavailable' : cameraEnabled ? '📷 Turn camera off' : '📷 Turn camera on'}
    </button>
    <button
      type='button'
      aria-pressed={shareEnabled}
      disabled={!mediaControls || shareUnavailable || localPresence === 'busy'}
      title={localPresence === 'busy' ? 'Turn off Busy to use Share screen' : undefined}
      onclick={toggleScreenShare}
    >
      {shareUnavailable ? '🖥️ Share unavailable' : shareEnabled ? '🖥️ Stop sharing' : '🖥️ Share screen'}
    </button>
    <button
      type='button'
      aria-pressed={localPresence === 'busy'}
      title={localPresence === 'busy' ? 'Turn off Busy' : 'Turn on Busy'}
      onclick={toggleBusy}
    >
      ⛔ Busy
    </button>
    <button
      type='button'
      aria-pressed={membersOpen}
      title={membersOpen ? 'Hide members list' : 'Show members list'}
      onclick={() => (membersOpen = !membersOpen)}
    >
      👥 Members
    </button>
  </div>
{/if}

<style>
  .game-container {
    position: relative;
    width: 100vw;
    height: 100dvh;
    overflow: hidden;
  }

  .media-controls {
    position: fixed;
    bottom: 16px;
    left: 50%;
    z-index: 30;
    display: flex;
    gap: 8px;
    transform: translateX(-50%);
  }

  .media-controls button {
    padding: 8px 16px;
    border: none;
    border-radius: 8px;
    background: rgb(0 0 0 / 70%);
    color: #fff;
    cursor: pointer;
  }

  .media-controls button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
</style>
