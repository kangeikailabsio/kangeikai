<script lang='ts'>
  import type { MediaControls } from '$lib/av/media-controls'
  import type { ScreenShareQualityTier } from '$lib/av/screen-share-quality'
  import type { GuestProfile } from '$lib/entry/guest-profile-schema'
  import type { ConnectionState, RoomConnection } from '$lib/network/room-connection'
  import type { AvatarPresence } from '@kangeikai/shared'
  import AvatarVideoOverlay from '$lib/av/avatar-video-overlay.svelte'
  import BusyOverlay from '$lib/av/busy-overlay.svelte'
  import ConnectionQualityIndicator from '$lib/av/connection-quality-indicator.svelte'
  import { screenShareOverlayState } from '$lib/av/screen-share-overlay-state.svelte'
  import ScreenShareOverlay from '$lib/av/screen-share-overlay.svelte'
  import ScreenShareQualityPopover from '$lib/av/screen-share-quality-popover.svelte'
  import { ScreenShareQualityStore } from '$lib/av/screen-share-quality-store'
  import EntryForm from '$lib/entry/entry-form.svelte'
  import { GuestProfileStore } from '$lib/entry/guest-profile-store'
  import FpsDisplay from '$lib/game/fps-display.svelte'
  import { CONNECTION_QUALITY_CHANGED_EVENT, LOCAL_PRESENCE_EVENT, MEDIA_CONTROLS_READY_EVENT, OfficeScene, ROOM_CONNECTION_READY_EVENT, ROOM_JOIN_FAILED_EVENT, ROOM_JOINED_EVENT, SCREEN_SHARE_ENDED_EVENT } from '$lib/game/scenes/office-scene'
  import ConnectionStatusBanner from '$lib/network/connection-status-banner.svelte'
  import AvatarProfilePanel from '$lib/people/avatar-profile-panel.svelte'
  import { avatarProfileState } from '$lib/people/avatar-profile-state.svelte'
  import FollowIndicator from '$lib/people/follow-indicator.svelte'
  import { followState } from '$lib/people/follow-state.svelte'
  import MembersSidebar from '$lib/people/members-sidebar.svelte'
  import { rosterState } from '$lib/people/roster-state.svelte'
  import Toast from '$lib/ui/toast.svelte'
  import { ConnectionQuality } from 'livekit-client'
  import Phaser from 'phaser'
  import { onDestroy } from 'svelte'

  let gameContainer: HTMLDivElement
  // $state so FpsDisplay (issue #130), passed this by reference, re-renders correctly if it
  // ever changes while mounted — not just relying on the {#if guestProfile && !connecting} block
  // remounting at exactly the right time.
  let game: Phaser.Game | undefined = $state()

  const guestProfileStore = new GuestProfileStore()
  const screenShareQualityStore = new ScreenShareQualityStore()

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
  let shareUnsupported = $state(false)
  // True only from the moment the quality popover is confirmed until setScreenShareEnabled(true)
  // resolves/rejects — guards against re-clicking "Share screen" while the native picker from a
  // previous, still-pending attempt is open (issue #115's grill).
  let shareCapturing = $state(false)
  // Pre-fills the quality popover with the last-saved choice (issue #111's grill, extended for
  // "share audio too" by #113).
  const savedScreenShareSettings = screenShareQualityStore.load()
  let screenShareQualityChoice: ScreenShareQualityTier = $state(savedScreenShareSettings.tier)
  let screenShareAudioChoice = $state(savedScreenShareSettings.shareAudio)
  let screenSharePopoverOpen = $state(false)
  let localPresence: AvatarPresence = $state('available')
  let membersOpen = $state(false)
  let unwireRoster: (() => void) | undefined
  // Drives ConnectionStatusBanner — 'connecting' covers the SDK's own automatic reconnect
  // retries (RoomConnection's `onDrop`), 'disconnected' means those retries gave up and the
  // server has genuinely removed the session (issue #146: previously silent, so a dropped
  // person kept looking present to themselves with no indication anything was wrong).
  let connectionState: ConnectionState = $state('connecting')
  let unwireConnectionStatus: (() => void) | undefined
  // Drives ConnectionQualityIndicator (issue #132) — updated by CONNECTION_QUALITY_CHANGED_EVENT,
  // fired from whichever LiveKit room MediaControls currently points at (office, or a private
  // room while one is connected), including once immediately on every room switch.
  let connectionQuality: ConnectionQuality = $state(ConnectionQuality.Unknown)

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
    rosterState.setLocalSpriteType(profile.avatarType)
    avatarProfileState.close()
    followState.stop()
    game.events.on(ROOM_CONNECTION_READY_EVENT, (roomConnection: RoomConnection) => {
      unwireRoster = rosterState.connect(roomConnection)
      unwireConnectionStatus = roomConnection.onConnectionStateChange((state) => {
        connectionState = state
      })
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
      shareUnsupported = controls.screenShareUnsupported
    })

    game.events.on(CONNECTION_QUALITY_CHANGED_EVENT, (quality: ConnectionQuality) => {
      connectionQuality = quality
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
      unwireConnectionStatus?.()
      rosterState.reset()
      membersOpen = false
      avatarProfileState.close()
      followState.stop()
    })
  }

  onDestroy(() => {
    game?.destroy(true)
    unwireRoster?.()
    unwireConnectionStatus?.()
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

  /**
   * Stopping a share needs no quality choice — it goes straight through. Starting one opens the
   * quality popover instead (issue #111's grill: the popover always appears, pre-selected with
   * the last saved choice); the actual `setScreenShareEnabled(true, tier)` call happens in
   * `confirmScreenShareQuality` once the person picks.
   */
  async function toggleScreenShare(): Promise<void> {
    if (localPresence === 'busy' || !mediaControls) {
      return
    }
    if (shareEnabled) {
      await mediaControls.setScreenShareEnabled(false)
      shareEnabled = mediaControls.screenShareEnabled
      return
    }
    screenSharePopoverOpen = true
  }

  async function confirmScreenShareQuality(tier: ScreenShareQualityTier, shareAudio: boolean): Promise<void> {
    screenSharePopoverOpen = false
    screenShareQualityChoice = tier
    screenShareAudioChoice = shareAudio
    screenShareQualityStore.save({ tier, shareAudio })
    if (!mediaControls) {
      return
    }
    shareCapturing = true
    try {
      await mediaControls.setScreenShareEnabled(true, tier, shareAudio)
    }
    finally {
      shareCapturing = false
    }
    shareEnabled = mediaControls.screenShareEnabled
    // Starting a share jumps straight into the full-screen view (#94's grill: "quando
    // compartilhar irá abrir um overlay sobre a tela"); stopping never auto-closes it — the
    // grid's own empty-check (screen-share-overlay.svelte) handles that once it actually empties.
    if (shareEnabled) {
      screenShareOverlayState.set(true)
    }
  }

  function cancelScreenShareQuality(): void {
    screenSharePopoverOpen = false
  }

  async function toggleBusy(): Promise<void> {
    const officeScene = game?.scene.getScene('office') as OfficeScene | undefined
    await officeScene?.toggleBusyPresence()
  }

  function goToAvatar(sessionId: string): void {
    const officeScene = game?.scene.getScene('office') as OfficeScene | undefined
    officeScene?.walkToAvatar(sessionId)
  }

  function toggleFollowAvatar(sessionId: string): void {
    const officeScene = game?.scene.getScene('office') as OfficeScene | undefined
    officeScene?.toggleFollowAvatar(sessionId)
  }

  /** The indicator's own stop button (issue #160) — one of the three ways to stop, independent of the profile panel. */
  function stopFollowing(): void {
    if (!followState.sessionId) {
      return
    }
    const officeScene = game?.scene.getScene('office') as OfficeScene | undefined
    officeScene?.toggleFollowAvatar(followState.sessionId)
  }
</script>

<div class='game-container' bind:this={gameContainer}>
  {#if guestProfile && !connecting}
    <AvatarVideoOverlay />
    <ScreenShareOverlay />
    <BusyOverlay active={localPresence === 'busy'} />
    <MembersSidebar open={membersOpen} />
    <AvatarProfilePanel onGoTo={goToAvatar} onToggleFollow={toggleFollowAvatar} />
    <FollowIndicator onStop={stopFollowing} />
    <FpsDisplay {game} />
    <ConnectionQualityIndicator quality={connectionQuality} />
    <Toast />
    <ConnectionStatusBanner state={connectionState} />
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
      disabled={!mediaControls || shareUnsupported || shareCapturing || localPresence === 'busy'}
      title={localPresence === 'busy' ? 'Turn off Busy to use Share screen' : undefined}
      onclick={toggleScreenShare}
    >
      {shareUnsupported ? '🖥️ Share unavailable' : shareEnabled ? '🖥️ Stop sharing' : '🖥️ Share screen'}
    </button>
    <button
      type='button'
      aria-pressed={localPresence === 'busy'}
      disabled={shareEnabled && localPresence !== 'busy'}
      title={shareEnabled && localPresence !== 'busy' ? 'Stop sharing your screen to use Busy' : localPresence === 'busy' ? 'Turn off Busy' : 'Turn on Busy'}
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
  {#if screenSharePopoverOpen}
    <ScreenShareQualityPopover
      selected={screenShareQualityChoice}
      audioSelected={screenShareAudioChoice}
      onConfirm={confirmScreenShareQuality}
      onCancel={cancelScreenShareQuality}
    />
  {/if}
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
