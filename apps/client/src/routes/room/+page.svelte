<script lang='ts'>
  import type { AccountUser } from '$lib/account/account-profile'
  import type { MediaIntent } from '$lib/av/devices/media-intent'
  import type { MediaControls } from '$lib/av/media-controls'
  import type { ScreenShareQualityTier } from '$lib/av/screen-share-quality'
  import type { Profile } from '$lib/entry/profile-schema'
  import type { ConnectionState, InteractionReceivedPayload, RoomConnection } from '$lib/network/room-connection'
  import type { AvatarPresence } from '@kangeikai/shared'
  import { goto } from '$app/navigation'
  import { AccountApiError, createAccountApi, describeAccountError } from '$lib/account/account-api'
  import { profileFieldsFromUser, profileUpdateBody } from '$lib/account/account-profile'
  import { AUTH_URL, authClient } from '$lib/auth/auth-client'
  import { SIGN_IN_PATH } from '$lib/auth/auth-routes'
  import AvatarVideoOverlay from '$lib/av/avatar-video-overlay.svelte'
  import BusyOverlay from '$lib/av/busy-overlay.svelte'
  import ConnectionQualityIndicator from '$lib/av/connection-quality-indicator.svelte'
  import { screenShareOverlayState } from '$lib/av/screen-share-overlay-state.svelte'
  import ScreenShareOverlay from '$lib/av/screen-share-overlay.svelte'
  import ScreenShareQualityPopover from '$lib/av/screen-share-quality-popover.svelte'
  import { ScreenShareQualityStore } from '$lib/av/screen-share-quality-store'
  import { composeCharacterSheets } from '$lib/character/compose-character'
  import EntryForm from '$lib/entry/entry-form.svelte'
  import FpsDisplay from '$lib/game/fps-display.svelte'
  import { gameSessionState } from '$lib/game/games/game-session-state.svelte'
  import PoolKickModal from '$lib/game/games/pool-kick-modal.svelte'
  import PoolOverlay from '$lib/game/games/pool-overlay.svelte'
  import { ATTENTION_RECEIVED_EVENT, CONNECTION_QUALITY_CHANGED_EVENT, HELLO_RECEIVED_EVENT, LOCAL_PRESENCE_EVENT, MEDIA_CONTROLS_READY_EVENT, OfficeScene, ROOM_CONNECTION_READY_EVENT, ROOM_JOIN_FAILED_EVENT, ROOM_JOINED_EVENT, SCREEN_SHARE_ENDED_EVENT } from '$lib/game/scenes/office-scene'
  import ConnectionStatusBanner from '$lib/network/connection-status-banner.svelte'
  import AvatarProfilePanel from '$lib/people/avatar-profile-panel.svelte'
  import { avatarProfileState } from '$lib/people/avatar-profile-state.svelte'
  import FollowIndicator from '$lib/people/follow-indicator.svelte'
  import { followState } from '$lib/people/follow-state.svelte'
  import MembersSidebar from '$lib/people/members-sidebar.svelte'
  import { rosterState } from '$lib/people/roster-state.svelte'
  import { attentionModalState } from '$lib/ui/attention-modal-state.svelte'
  import AttentionModal from '$lib/ui/attention-modal.svelte'
  import { helloToastState } from '$lib/ui/hello-toast-state.svelte'
  import HelloToast from '$lib/ui/hello-toast.svelte'
  import { playNotificationSound } from '$lib/ui/notification-sound'
  import Toast from '$lib/ui/toast.svelte'
  import { ConnectionQuality } from 'livekit-client'
  import Phaser from 'phaser'
  import { onDestroy, onMount } from 'svelte'

  let gameContainer: HTMLDivElement
  // $state so FpsDisplay (issue #130), passed this by reference, re-renders correctly if it
  // ever changes while mounted — not just relying on the {#if activeProfile && !connecting} block
  // remounting at exactly the right time.
  let game: Phaser.Game | undefined = $state()

  const accountApi = createAccountApi(AUTH_URL)
  const screenShareQualityStore = new ScreenShareQualityStore()

  // The signed-in account's name and avatar, which pre-fill the entry form (issue #232). `checking`
  // until the session is known; `unreachable` when the server could not be asked at all.
  let accountProfile: Profile | undefined = $state()
  let sessionState: 'checking' | 'ready' | 'unreachable' = $state('checking')
  // The profile the game was started with — set once entry is confirmed.
  let activeProfile: Profile | undefined = $state()
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

  /**
   * Better-auth's client types do not know the extra `user` columns (`spriteType`,
   * `characterSelection`), so they are read through `AccountUser`. Composing the sheets can fail
   * (a piece that no longer exists); the form then simply generates a fresh avatar.
   */
  async function loadAccountProfile(): Promise<void> {
    sessionState = 'checking'
    try {
      const { data, error } = await authClient.getSession()
      if (error) {
        sessionState = 'unreachable'
        return
      }
      if (!data) {
        await goto(SIGN_IN_PATH, { replaceState: true })
        return
      }

      const fields = profileFieldsFromUser(data.user as AccountUser)
      const character = fields.selection
        ? await composeCharacterSheets(fields.selection).then(sheets => ({ selection: fields.selection!, sheets }), () => undefined)
        : undefined
      accountProfile = { displayName: fields.displayName, avatarType: fields.avatarType, character }
      sessionState = 'ready'
    }
    catch {
      sessionState = 'unreachable'
    }
  }

  onMount(() => {
    void loadAccountProfile()
  })

  async function signOut(): Promise<void> {
    const { error } = await authClient.signOut()
    if (error) {
      joinError = 'Couldn\'t sign out. Try again.'
      return
    }
    await goto(SIGN_IN_PATH)
  }

  /**
   * Saves the confirmed profile to the account, gets a join ticket, and only then mounts the game
   * (FR-009) — see `EntryForm` below. The form stays up (pending) during the two requests.
   */
  async function handleEntryConfirm(profile: Profile, media: MediaIntent): Promise<void> {
    joinError = undefined
    connecting = true

    let ticket: string
    try {
      await accountApi.saveProfile(profileUpdateBody(profile))
      ticket = await accountApi.fetchSessionTicket()
    }
    catch (error) {
      connecting = false
      if (error instanceof AccountApiError && error.kind === 'unauthorized')
        await goto(SIGN_IN_PATH)
      else
        joinError = describeAccountError(error)
      return
    }

    accountProfile = profile
    activeProfile = profile

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

    game.scene.add('office', OfficeScene, true, {
      displayName: profile.displayName,
      spriteType: profile.avatarType,
      ticket,
      customAvatarSheets: profile.character?.sheets,
      initialMedia: media,
    })

    rosterState.reset()
    rosterState.setLocalName(profile.displayName)
    rosterState.setLocalSpriteType(profile.avatarType)
    avatarProfileState.close()
    followState.stop()
    helloToastState.dismiss()
    attentionModalState.dismiss()
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

    // "Say Hello" (issue #157).
    game.events.on(HELLO_RECEIVED_EVENT, (payload: InteractionReceivedPayload) => {
      helloToastState.show(payload.fromDisplayName)
      playNotificationSound('hello')
    })

    // "Chamar atenção" (issue #158) — office-scene.ts only emits this once its camera shake has
    // already finished, so the modal never appears simultaneously with the shake.
    game.events.on(ATTENTION_RECEIVED_EVENT, (payload: InteractionReceivedPayload) => {
      attentionModalState.show(payload.fromDisplayName)
      playNotificationSound('attention')
    })

    // Most likely an expired or rejected ticket (OfficeRoom.onAuth) — there's no meaningful
    // in-game state to show, so tear down and let the person try again from the entry form. If
    // the session itself is gone, go back to sign in instead.
    game.events.on(ROOM_JOIN_FAILED_EVENT, () => {
      game?.destroy(true)
      game = undefined
      activeProfile = undefined
      connecting = false
      joinError = 'Could not join — try again.'
      void authClient.getSession().then(({ data, error }) => {
        if (!data && !error)
          void goto(SIGN_IN_PATH)
      })
      unwireRoster?.()
      unwireConnectionStatus?.()
      rosterState.reset()
      membersOpen = false
      avatarProfileState.close()
      followState.stop()
      helloToastState.dismiss()
      attentionModalState.dismiss()
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

  function sendHello(sessionId: string): void {
    const officeScene = game?.scene.getScene('office') as OfficeScene | undefined
    officeScene?.sendHello(sessionId)
  }

  function sendAttention(sessionId: string): void {
    const officeScene = game?.scene.getScene('office') as OfficeScene | undefined
    officeScene?.sendAttention(sessionId)
  }
</script>

<div class='game-container' bind:this={gameContainer}>
  {#if activeProfile && !connecting}
    <AvatarVideoOverlay />
    <ScreenShareOverlay />
    <BusyOverlay active={localPresence === 'busy'} />
    <MembersSidebar open={membersOpen} />
    <AvatarProfilePanel onGoTo={goToAvatar} onToggleFollow={toggleFollowAvatar} onSayHello={sendHello} onGetAttention={sendAttention} />
    <FollowIndicator onStop={stopFollowing} />
    {#if gameSessionState.open}<PoolOverlay />{/if}
    <FpsDisplay {game} />
    <ConnectionQualityIndicator quality={connectionQuality} />
    <Toast />
    <HelloToast />
    <AttentionModal />
    <PoolKickModal />
    <ConnectionStatusBanner state={connectionState} />
  {/if}
</div>

{#if sessionState !== 'ready' || !accountProfile}
  <div class='session-screen' role={sessionState === 'unreachable' ? 'alert' : 'status'}>
    {#if sessionState === 'unreachable'}
      <p>Couldn't reach the server.</p>
      <button type='button' onclick={loadAccountProfile}>Try again</button>
    {:else}
      <span class='session-spinner' aria-hidden='true'></span>
      <p>Checking your session…</p>
    {/if}
  </div>
{:else if !activeProfile || connecting}
  <EntryForm initialProfile={accountProfile} onConfirm={handleEntryConfirm} onSignOut={signOut} {joinError} pending={connecting} />
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
  .session-screen {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    background: #1a1a1a;
    color: #d1d5db;
    font-size: 14px;
  }

  .session-screen button {
    padding: 8px 16px;
    border: 1px solid #4a4a4a;
    border-radius: 6px;
    background: transparent;
    color: #fff;
    cursor: pointer;
    font: inherit;
  }

  .session-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid #4a4a4a;
    border-top-color: #fff;
    border-radius: 50%;
    animation: session-spin 0.8s linear infinite;
  }

  @keyframes session-spin {
    to {
      transform: rotate(360deg);
    }
  }

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
