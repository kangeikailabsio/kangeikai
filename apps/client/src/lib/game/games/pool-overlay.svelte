<script lang='ts'>
  import { screenShareOverlayState } from '$lib/av/screen-share-overlay-state.svelte'
  import { gameSessionState as session } from '$lib/game/games/game-session-state.svelte'
  import AvatarPortrait from '$lib/people/avatar-portrait.svelte'
  import { createPoolRenderer } from '@kangeikai/game-pool/client'
  import { ballBodyCss, ballHueCss, groupOf, hasClearedGroup, toCssHex } from '@kangeikai/game-pool/core'
  import { FLOOR_EDGE } from '@kangeikai/game-pool/floor'
  import { onMount } from 'svelte'

  let host: HTMLDivElement
  let window_: HTMLDivElement
  let renderer: ReturnType<typeof createPoolRenderer> | undefined
  let power = $state(0.5)
  let reposition = $state(false)
  let confirmExit = $state(false)
  let now = $state(Date.now())
  const snapshot = $derived(session.snapshot)
  const seat = $derived(snapshot?.players.findIndex(player => player?.sessionId === session.sessionId) ?? -1)
  const active = $derived(snapshot?.phase === 'aiming' || snapshot?.phase === 'moving')
  const canInteract = $derived(Boolean(snapshot && session.connected && !session.closing && !confirmExit && !screenShareOverlayState.expanded && !snapshot.paused && snapshot.phase === 'aiming' && seat === snapshot.turn))
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
    return () => {
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
    if (screenShareOverlayState.expanded)
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
  <div class='pool-window' role='dialog' tabindex='-1' aria-label='Mesa de sinuca' bind:this={window_} onscroll={() => renderer?.refreshScale()}>
    <header>
      <div><h1>Sinuca <span>• {session.tableId}</span></h1><p>{seat < 0 ? 'Você está assistindo' : 'Bola 8 casual'} · {snapshot?.spectators ?? 0} espectador(es)</p></div>
      <button onclick={close} disabled={session.closing} aria-label='Fechar sinuca'>Fechar ×</button>
    </header>
    <!-- Ends on the canvas scene's own flat edge colour, so the seam between DOM and canvas is
         invisible whatever height the panels end up at. -->
    <div class='stage-top' style:background='linear-gradient(#15241f, {toCssHex(FLOOR_EDGE)})'>
      {#if snapshot}
        <div class='players'>
          {#each snapshot.players as player, index}
            <div class:current={active && snapshot.turn === index}>
              <AvatarPortrait spriteType={player?.spriteType} name={player?.name ?? ''} />
              <div class='who'>
                <strong>{player?.name ?? 'Vaga disponível'} {player?.ready ? '✓ Pronto' : ''}</strong>
                <span>{snapshot.groups[index] === 'solids' ? 'Lisas' : snapshot.groups[index] === 'stripes' ? 'Listradas' : 'Mesa aberta'}{player && !player.connected ? ' · Reconectando…' : ''}</span>
                {#if targets[index]}
                  <ul class='glyphs' aria-label='Bolas restantes'>
                    {#each targets[index]! as id (id)}{@render ballGlyph(id)}{/each}
                  </ul>
                  {#if targets[index]!.length === 1 && targets[index]![0] === 8}<small>Agora, bola 8</small>{/if}
                {:else}
                  <small>Grupos definidos após a saída</small>
                {/if}
              </div>
            </div>
          {/each}
        </div>
        <div class='status' aria-live='polite'>
          {#if !session.connected}Reconectando ao escritório…
          {:else if snapshot.paused}Aguardando reconexão do jogador…
          {:else if snapshot.phase === 'finished'}{snapshot.winner !== null ? `${snapshot.players[snapshot.winner]?.name ?? 'Jogador'} venceu! ` : ''}{snapshot.notice}
          {:else}{snapshot.notice}{/if}
          {#if remaining !== null}<strong>{remaining}s</strong>{/if}
        </div>
      {:else}<p class='status'>Abrindo mesa…</p>{/if}
    </div>
    <div class='canvas' bind:this={host}></div>
    <footer>
      {#if snapshot && !active}
        {#if seat < 0}
          <button class='primary' disabled={!session.connected || snapshot.players.every(Boolean)} onclick={() => session.send({ kind: 'sit', tableId: snapshot.tableId })}>Jogar</button>
        {:else}
          <button class='primary' disabled={!session.connected} onclick={() => session.send({ kind: 'ready', tableId: snapshot.tableId, ready: !snapshot.players[seat]?.ready })}>{snapshot.players[seat]?.ready ? 'Cancelar pronto' : 'Pronto'}</button>
          <button disabled={!session.connected} onclick={() => session.send({ kind: 'stand', tableId: snapshot.tableId })}>Liberar vaga</button>
        {/if}
      {:else if snapshot && seat >= 0}
        <label>Força <input type='range' min='0.01' max='1' step='0.01' bind:value={power} disabled={!canInteract} /></label>
        <button class='primary' disabled={!canInteract || placing || !snapshot.cuePlaced} onclick={() => renderer?.shoot(power)}>Tacada</button>
        {#if canInteract && snapshot.ballInHand}<button onclick={() => (reposition = !reposition)}>{placing ? 'Clique na mesa para posicionar' : 'Reposicionar branca'}</button>{/if}
      {/if}
      <small>{placing ? 'Posicione a branca em uma área livre.' : 'Clique na mesa para travar a mira, arraste para trás para puxar o taco e solte para bater. Ou ajuste a força e clique em Tacada.'}</small>
    </footer>
    {#if session.error}<p class='error' role='alert'>{session.error}</p>{/if}
    {#if confirmExit}
      <div class='confirmation' role='alertdialog' aria-label='Confirmar desistência' aria-modal='true'>
        <div><h2>Desistir da partida?</h2><p>O adversário vencerá esta partida.</p><button onclick={() => (confirmExit = false)}>Continuar jogando</button><button class='danger' onclick={resign}>Desistir e sair</button></div>
      </div>
    {/if}
  </div>
</div>

<style>
  /* Nearly opaque: the office scene stops rendering while this is open, so there is no dimmed map
     left behind it to show through — only the canvas it cleared. */
  .backdrop { position: fixed; inset: 0; z-index: 22; background: rgb(3 6 8 / 94%); display: flex; justify-content: center; align-items: center; padding: 16px 16px 80px; pointer-events: auto; }
  .pool-window { position: relative; width: min(1050px, 100%); max-height: 100%; overflow: auto; border: 1px solid #486357; border-radius: 18px; background: #15241f; color: #f3f5ec; box-shadow: 0 20px 80px #0008; padding: 18px; }
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
  /* aspect-ratio must stay exactly the renderer's logical 900x600 ratio: any mismatch makes
     Scale.FIT letterbox inside the element and the floor stops touching its edges.
     touch-action: none — .pool-window scrolls, so without it a touch drag pans the panel. */
  .canvas { width: 100%; aspect-ratio: 3 / 2; max-height: 64vh; position: relative; touch-action: none; }
  footer { flex-wrap: wrap; justify-content: flex-start; margin-top: 8px; } footer small { margin-left: auto; font-size: 12px; }
  label { display: flex; align-items: center; gap: 8px; } input { accent-color: #edce67; width: 150px; }
  button { cursor: pointer; color: #f5f5ec; background: #344d40; border: 1px solid #607267; border-radius: 8px; padding: 9px 14px; font: inherit; }
  button:disabled { opacity: 0.45; cursor: not-allowed; } button:focus-visible { outline: 2px solid #edce67; outline-offset: 3px; } .primary { background: #edce67; color: #17241e; font-weight: 700; }
  .error { color: #ffaaa2; } .confirmation { position: absolute; inset: 0; background: #000b; display: grid; place-items: center; padding: 20px; z-index: 1; } .confirmation > div { padding: 24px; background: #20332b; border-radius: 12px; } .confirmation button { margin: 12px 8px 0 0; } .danger { background: #8b3535; }
</style>
