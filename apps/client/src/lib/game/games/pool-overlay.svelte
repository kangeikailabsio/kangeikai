<script lang='ts'>
  import { screenShareOverlayState } from '$lib/av/screen-share-overlay-state.svelte'
  import { gameSessionState as session } from '$lib/game/games/game-session-state.svelte'
  import AvatarPortrait from '$lib/people/avatar-portrait.svelte'
  import { attentionModalState } from '$lib/ui/attention-modal-state.svelte'
  import { createPoolRenderer } from '@kangeikai/game-pool/client'
  import { ballBodyCss, ballHueCss, GAME_MODE_INFO, GAME_MODES, groupOf, hasClearedGroup, toCssHex } from '@kangeikai/game-pool/core'
  import { FLOOR_EDGE } from '@kangeikai/game-pool/floor'
  import { onMount } from 'svelte'

  let host: HTMLDivElement
  let window_: HTMLDivElement
  let renderer: ReturnType<typeof createPoolRenderer> | undefined
  let power = $state(0.5)
  let reposition = $state(false)
  let confirmExit = $state(false)
  let showRules = $state(false)
  let now = $state(Date.now())
  const snapshot = $derived(session.snapshot)
  const seat = $derived(snapshot?.players.findIndex(player => player?.sessionId === session.sessionId) ?? -1)
  const active = $derived(snapshot?.phase === 'aiming' || snapshot?.phase === 'moving')
  const canInteract = $derived(Boolean(snapshot && session.connected && !session.closing && !confirmExit && !screenShareOverlayState.expanded && !attentionModalState.open && !snapshot.paused && snapshot.phase === 'aiming' && seat === snapshot.turn))
  const placing = $derived(Boolean(snapshot?.ballInHand && (!snapshot.cuePlaced || reposition)))
  const remaining = $derived(snapshot?.paused ? Math.ceil(snapshot.remainingMs / 1000) : snapshot?.deadline ? Math.max(0, Math.ceil((snapshot.deadline - snapshot.serverTime - (now - session.receivedAt)) / 1000)) : null)
  /**
   * Each seat's remaining targets: `null` before the break settles the groups, `[8]` once the group
   * is cleared. Computed once per snapshot instead of filtering the ball array inline twice.
   */
  const targets = $derived.by<(number[] | null)[]>(() => {
    if (!snapshot)
      return [null, null]
    return [0, 1].map((index) => {
      const group = snapshot.groups[index]
      if (!group)
        return null
      if (hasClearedGroup(snapshot.balls, group))
        return [8]
      return snapshot.balls.filter(ball => !ball.pocketed && groupOf(ball.id) === group).map(ball => ball.id)
    })
  })

  onMount(() => {
    renderer = createPoolRenderer(host, {
      getState: () => session.snapshot,
      canInteract: () => canInteract,
      isPlacing: () => placing,
      getPower: () => power,
      setPower: (value) => {
        power = value
      },
      place: (x, y) => {
        if (!snapshot)
          return
        session.send({ kind: 'place', tableId: snapshot.tableId, matchId: snapshot.matchId, turnId: snapshot.turnId, x, y })
        reposition = false
      },
      shoot: (aimed, charged) => {
        if (!snapshot || !canInteract || placing || !snapshot.cuePlaced)
          return
        session.send({ kind: 'shoot', tableId: snapshot.tableId, matchId: snapshot.matchId, turnId: snapshot.turnId, angle: aimed, power: charged })
      },
    })
    const timer = setInterval(() => {
      now = Date.now()
    }, 100)
    // The ScaleManager only polls its parent every 500ms: a layout change (the mode selector
    // appearing, a resized window) would leave clicks mis-mapped until then.
    const resize = new ResizeObserver(() => renderer?.refreshScale())
    resize.observe(host)
    return () => {
      resize.disconnect()
      renderer?.destroy()
      clearInterval(timer)
    }
  })

  // A rejection that does not advance the turn would otherwise leave the cue locked for the rest of
  // it: the committed-shot lock has to be released whenever the server refuses a shot.
  $effect(() => {
    if (session.error)
      renderer?.unlock()
  })

  function close(): void {
    if (active && seat >= 0)
      confirmExit = true
    else
      session.close()
  }

  function keydown(event: KeyboardEvent): void {
    if (screenShareOverlayState.expanded || attentionModalState.open)
      return
    if (event.code === 'Escape') {
      event.preventDefault()
      // Registered at mount, so this runs before any listener the renderer adds on drag start —
      // the only place where cancelling the pull can win over closing the table.
      if (renderer?.charging())
        renderer.cancelCharge()
      else if (confirmExit)
        confirmExit = false
      else
        close()
    }
  }

  function resign(): void {
    confirmExit = false
    session.close()
  }
</script>

<svelte:window onkeydown={keydown} />

{#snippet ballGlyph(id: number)}
  <li class='glyph' class:eight={id === 8} style:background={ballBodyCss(id)}>
    {#if groupOf(id) === 'stripes'}<i class='band' style:background={ballHueCss(id)}></i>{/if}
    <span>{id}</span>
  </li>
{/snippet}

<div class='backdrop'>
  <!-- The ScaleManager only re-measures its parent every 500ms and never on scroll, so a scrolled
       window would otherwise mis-map pointer coordinates until the next poll. -->
  <div class='pool-window' role='dialog' tabindex='-1' aria-label='Pool table' bind:this={window_} onscroll={() => renderer?.refreshScale()}>
    <header>
      <div><h1>Pool <span>• {session.tableId}</span></h1><p>{snapshot ? GAME_MODE_INFO[snapshot.mode].label : ''}{seat < 0 ? ' · You are watching' : ''} · {snapshot?.spectators ?? 0} {snapshot?.spectators === 1 ? 'spectator' : 'spectators'}</p></div>
      <div class='actions'>
        <button onclick={() => (showRules = !showRules)} aria-expanded={showRules} disabled={!snapshot}>Rules</button>
        <button onclick={close} disabled={session.closing} aria-label='Close pool'>Close ×</button>
      </div>
    </header>
    {#if showRules && snapshot}
      <!-- A popover on purpose: a panel that pushed the canvas down would leave the ScaleManager with a stale offset. -->
      <aside class='rules' aria-label='Rules'><strong>{GAME_MODE_INFO[snapshot.mode].label}</strong><p>{GAME_MODE_INFO[snapshot.mode].description}</p></aside>
    {/if}
    <!-- Ends on the canvas scene's own flat edge colour, so the seam between DOM and canvas is
         invisible whatever height the panels end up at. -->
    <div class='stage-top' style:background='linear-gradient(#15241f, {toCssHex(FLOOR_EDGE)})'>
      {#if snapshot}
        <div class='players'>
          {#each snapshot.players as player, index}
            <div class:current={active && snapshot.turn === index}>
              <AvatarPortrait spriteType={player?.spriteType} name={player?.name ?? ''} />
              <div class='who'>
                <strong>{player?.name ?? 'Seat available'} {player?.ready ? '✓ Ready' : ''}</strong>
                <span>{snapshot.groups[index] === 'solids' ? 'Solids' : snapshot.groups[index] === 'stripes' ? 'Stripes' : 'Open table'}{player && !player.connected ? ' · Reconnecting…' : ''}</span>
                {#if targets[index]}
                  <ul class='glyphs' aria-label='Remaining balls'>
                    {#each targets[index]! as id (id)}{@render ballGlyph(id)}{/each}
                  </ul>
                  {#if targets[index]!.length === 1 && targets[index]![0] === 8}<small>Now, the 8 ball</small>{/if}
                {:else}
                  <small>Groups are set after the break</small>
                {/if}
              </div>
            </div>
          {/each}
        </div>
        <div class='status' aria-live='polite'>
          {#if !session.connected}Reconnecting to the office…
          {:else if snapshot.paused}Waiting for the player to reconnect…
          {:else if snapshot.phase === 'finished'}{snapshot.winner !== null ? `${snapshot.players[snapshot.winner]?.name ?? 'Player'} won! ` : ''}{snapshot.notice}
          {:else}{snapshot.notice}{/if}
          {#if remaining !== null}<strong>{remaining}s</strong>{/if}
        </div>
      {:else}<p class='status'>Opening table…</p>{/if}
    </div>
    <div class='canvas' bind:this={host}></div>
    {#if snapshot && !active && seat >= 0}
      <fieldset class='modes' disabled={!session.connected || seat !== snapshot.ownerSeat} title={seat === snapshot.ownerSeat ? undefined : 'Chosen by the table owner'}>
        <legend>Mode</legend>
        <div class='segments' role='radiogroup' aria-label='Game mode'>
          {#each GAME_MODES as mode (mode)}
            <label class='segment' class:selected={snapshot.mode === mode} title={GAME_MODE_INFO[mode].description}>
              <input class='visually-hidden' type='radio' name='game-mode' value={mode} checked={snapshot.mode === mode} onchange={() => session.send({ kind: 'setMode', tableId: snapshot.tableId, mode })} />
              {GAME_MODE_INFO[mode].label}
            </label>
          {/each}
        </div>
        <p class='mode-description'>{GAME_MODE_INFO[snapshot.mode].description}{seat === snapshot.ownerSeat ? '' : ' (Chosen by the table owner.)'}</p>
      </fieldset>
    {/if}
    <footer>
      {#if snapshot && !active}
        {#if seat < 0}
          <button class='primary' disabled={!session.connected || snapshot.players.every(Boolean)} onclick={() => session.send({ kind: 'sit', tableId: snapshot.tableId })}>Play</button>
          {#if snapshot.players.every(player => player === null)}
            <button disabled={!session.connected} onclick={() => session.send({ kind: 'playBot', tableId: snapshot.tableId })}>Play against the bot</button>
          {/if}
        {:else}
          <button class='primary' disabled={!session.connected} onclick={() => session.send({ kind: 'ready', tableId: snapshot.tableId, ready: !snapshot.players[seat]?.ready })}>{snapshot.players[seat]?.ready ? 'Cancel ready' : 'Ready'}</button>
          <button disabled={!session.connected} onclick={() => session.send({ kind: 'stand', tableId: snapshot.tableId })}>Leave seat</button>
        {/if}
      {:else if snapshot && seat >= 0}
        <label>Power <input type='range' min='0.01' max='1' step='0.01' bind:value={power} disabled={!canInteract} /></label>
        <button class='primary' disabled={!canInteract || placing || !snapshot.cuePlaced} onclick={() => renderer?.shoot(power)}>Shoot</button>
        {#if canInteract && snapshot.ballInHand}<button onclick={() => (reposition = !reposition)}>{placing ? 'Click the table to place it' : 'Reposition cue ball'}</button>{/if}
      {/if}
      <small>{placing ? 'Place the cue ball in a free area.' : 'Click the table to lock your aim, drag backwards to pull the cue and release to shoot. Or set the power and click Shoot.'}</small>
    </footer>
    {#if session.error}<p class='error' role='alert'>{session.error}</p>{/if}
    {#if confirmExit}
      <div class='confirmation' role='alertdialog' aria-label='Confirm resignation' aria-modal='true'>
        <div><h2>Resign the match?</h2><p>Your opponent will win this match.</p><button onclick={() => (confirmExit = false)}>Keep playing</button><button class='danger' onclick={resign}>Resign and leave</button></div>
      </div>
    {/if}
  </div>
</div>

<style>
  /* Nearly opaque: the office scene stops rendering while this is open, so there is no dimmed map
     left behind it to show through — only the canvas it cleared. */
  .backdrop { position: fixed; inset: 0; z-index: 22; background: rgb(3 6 8 / 94%); display: flex; justify-content: center; align-items: center; padding: 16px 16px 68px; pointer-events: auto; }
  .pool-window { --chrome: 450px; position: relative; width: min(1050px, 100%); max-height: 100%; overflow: auto; border: 1px solid #486357; border-radius: 18px; background: #15241f; color: #f3f5ec; box-shadow: 0 20px 80px #0008; padding: 18px; }
  header, footer, .players, .status { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  h1 { margin: 0; font-size: 22px; } h1 span, p, small { color: #b5c8bc; } h1 span { font-size: 14px; } p { margin: 5px 0; }
  .stage-top { margin: 16px -18px 0; padding: 0 18px; }
  /* A fixed height matters: a panel that grows or shrinks mid-match changes the canvas height, and
     the ScaleManager would keep a stale displayScale for up to 500ms and mis-map every click. */
  .players > div { display: flex; align-items: flex-start; gap: 10px; flex: 1; min-height: 84px; padding: 10px 14px; border: 1px solid #3b5147; border-radius: 10px; background: rgb(21 36 31 / 55%); }
  .players .current { border-color: #edce67; background: #34412a; }
  .who { display: grid; gap: 4px; min-width: 0; }
  .players span, .players small { font-size: 12px; } .status { min-height: 36px; font-size: 14px; } .status strong { color: #edce67; white-space: nowrap; }
  .glyphs { display: flex; flex-wrap: wrap; gap: 4px; min-height: 18px; margin: 2px 0 0; padding: 0; list-style: none; }
  .glyph { position: relative; display: grid; place-items: center; width: 18px; height: 18px; overflow: hidden; border-radius: 50%; box-shadow: 0 1px 2px #0006; }
  .glyph .band { position: absolute; inset: 4px 0; }
  .glyph span { position: relative; width: 10px; height: 10px; border-radius: 50%; background: #fffdf4; color: #17212b; font-size: 8px; font-weight: 700; line-height: 10px; text-align: center; }
  .glyph.eight { outline: 1px solid #edce67; outline-offset: 1px; }
  /* The canvas is the largest 3:2 box that fits the screen height once the other panels (--chrome,
     an estimate of their combined height) are taken out. It must keep exactly the renderer's logical
     900x600 ratio: any mismatch makes Scale.FIT letterbox inside the element and the floor stops
     touching its edges. Below 480px wide it stops shrinking and the window scrolls instead; the footer
     is sticky, so the main actions stay reachable even then.
     touch-action: none — .pool-window scrolls, so without it a touch drag pans the panel. */
  .canvas { width: min(100%, calc((100vh - var(--chrome)) * 1.5), calc((100dvh - var(--chrome)) * 1.5)); min-width: min(480px, 100%); margin: 8px auto 0; aspect-ratio: 3 / 2; position: relative; touch-action: none; }
  .actions { display: flex; gap: 8px; }
  .rules { position: absolute; top: 64px; right: 18px; z-index: 2; width: min(360px, calc(100% - 36px)); padding: 12px 14px; border: 1px solid #486357; border-radius: 10px; background: #20332b; box-shadow: 0 10px 30px #0008; }
  .rules p { margin: 6px 0 0; color: #f3f5ec; font-size: 13px; }
  .modes { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 12px; margin: 8px 0 0; padding: 0; border: 0; min-width: 0; }
  .modes legend { float: left; padding: 0; margin-right: 12px; font-size: 12px; color: #b5c8bc; }
  .modes:disabled { opacity: 0.75; }
  .segments { display: flex; border: 1px solid #607267; border-radius: 8px; overflow: hidden; }
  .segment { padding: 7px 14px; cursor: pointer; background: #344d40; }
  .segment + .segment { border-left: 1px solid #607267; }
  .segment.selected { background: #edce67; color: #17241e; font-weight: 700; }
  .segment:has(input:focus-visible) { outline: 2px solid #edce67; outline-offset: -2px; }
  .mode-description { flex: 1 1 260px; margin: 0; font-size: 12px; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  /* Short screens: trim the chrome around the canvas so the actions stay in view. */
  @media (max-height: 720px) {
    .backdrop { padding: 8px 8px 60px; }
    .pool-window { --chrome: 340px; padding: 8px 14px; border-radius: 12px; }
    h1 { font-size: 18px; } h1 span { font-size: 12px; } header p { margin: 1px 0 0; font-size: 12px; }
    .stage-top { margin: 6px -14px 0; padding: 0 14px; }
    .players small { display: none; }
    .glyphs { min-height: 14px; } .glyph { width: 14px; height: 14px; } .glyph span { width: 8px; height: 8px; font-size: 6px; line-height: 8px; }
    .status { min-height: 22px; font-size: 13px; }
    .canvas { margin-top: 4px; }
    .modes { margin-top: 4px; }
    .segment, button { padding-top: 6px; padding-bottom: 6px; }
    .pool-window footer { margin: 4px -14px 0; padding: 6px 14px; } footer small { display: none; }
  }
  /* Very short screens: only the buttons; the description is one click away under "Rules". */
  @media (max-height: 640px) { .mode-description { display: none; } }
  footer { flex-wrap: wrap; justify-content: flex-start; position: sticky; bottom: 0; z-index: 1; margin: 8px -18px 0; padding: 8px 18px; background: #15241f; } footer small { margin-left: auto; font-size: 12px; }
  label { display: flex; align-items: center; gap: 8px; } input { accent-color: #edce67; width: 150px; }
  button { cursor: pointer; color: #f5f5ec; background: #344d40; border: 1px solid #607267; border-radius: 8px; padding: 9px 14px; font: inherit; }
  button:disabled { opacity: 0.45; cursor: not-allowed; } button:focus-visible { outline: 2px solid #edce67; outline-offset: 3px; } .primary { background: #edce67; color: #17241e; font-weight: 700; }
  .error { color: #ffaaa2; } .confirmation { position: absolute; inset: 0; background: #000b; display: grid; place-items: center; padding: 20px; z-index: 1; } .confirmation > div { padding: 24px; background: #20332b; border-radius: 12px; } .confirmation button { margin: 12px 8px 0 0; } .danger { background: #8b3535; }
</style>
