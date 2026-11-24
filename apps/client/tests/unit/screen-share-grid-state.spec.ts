import type { ScreenShareGridTile } from '$lib/av/screen-share-grid-state.svelte'
import type { LocalVideoTrack } from 'livekit-client'
import { screenShareGridState } from '$lib/av/screen-share-grid-state.svelte'
import { beforeEach, describe, expect, it } from 'vitest'

const trackA = { id: 'a' } as unknown as LocalVideoTrack
const trackB = { id: 'b' } as unknown as LocalVideoTrack

function tile(sessionId: string, overrides: Partial<ScreenShareGridTile> = {}): ScreenShareGridTile {
  return { sessionId, name: sessionId, isLocal: false, videoTrack: trackA, ...overrides }
}

describe('screenShareGridState (issue #281)', () => {
  beforeEach(() => screenShareGridState.set([]))

  it('keeps the current tiles when the same ones arrive in new objects', () => {
    screenShareGridState.set([tile('a'), tile('b')])
    const before = screenShareGridState.tiles

    screenShareGridState.set([tile('a'), tile('b')])

    expect(screenShareGridState.tiles).toBe(before)
  })

  it('keeps an empty grid empty', () => {
    const before = screenShareGridState.tiles

    screenShareGridState.set([])

    expect(screenShareGridState.tiles).toBe(before)
  })

  it.each([
    ['a new tile', [tile('a'), tile('b'), tile('c')]],
    ['a removed tile', [tile('a')]],
    ['a different order', [tile('b'), tile('a')]],
    ['a changed name', [tile('a', { name: 'Ana' }), tile('b')]],
    ['a changed isLocal', [tile('a', { isLocal: true }), tile('b')]],
    ['a different video track', [tile('a', { videoTrack: trackB }), tile('b')]],
    ['a track that went away', [tile('a', { videoTrack: undefined }), tile('b')]],
    ['another session in the same place', [tile('a'), tile('z')]],
  ])('replaces the tiles on %s', (_, next) => {
    screenShareGridState.set([tile('a'), tile('b')])
    const before = screenShareGridState.tiles

    screenShareGridState.set(next)

    expect(screenShareGridState.tiles).not.toBe(before)
    expect(screenShareGridState.tiles.map(t => t.sessionId)).toEqual(next.map(t => t.sessionId))
  })
})
