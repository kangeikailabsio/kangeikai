import type { CallPerson, CallTilesInput } from '$lib/av/call-tiles'
import type { ParticipantSnapshot, RoomSnapshot } from '$lib/av/room-snapshot'
import { CallTiles } from '$lib/av/call-tiles'
import { describe, expect, it } from 'vitest'

function participant(sessionId: string, overrides: Partial<ParticipantSnapshot> = {}): ParticipantSnapshot {
  return { sessionId, name: sessionId.toUpperCase(), cameraEnabled: false, micEnabled: true, speaking: false, cameraTrack: undefined, screenTrack: undefined, ...overrides }
}

function room(local: ParticipantSnapshot, ...others: ParticipantSnapshot[]): RoomSnapshot {
  return { local, remotes: new Map(others.map(other => [other.sessionId, other])) }
}

function person(displayName: string, distance: number, presence: CallPerson['presence'] = 'available'): CallPerson {
  return { displayName, distance, presence }
}

const track = { kind: 'video' } as unknown as NonNullable<ParticipantSnapshot['screenTrack']>

function input(overrides: Partial<CallTilesInput> & Pick<CallTilesInput, 'situation'>): CallTilesInput {
  return { localBusy: false, localSessionId: 'me', localName: 'Me', mediaConnecting: false, people: new Map(), now: 0, ...overrides }
}

describe('callTiles in the office', () => {
  it('shows "You" first and then each person nearby, with their camera and microphone state', () => {
    const { strip } = new CallTiles().compute(input({
      situation: { kind: 'office', room: room(participant('me', { name: 'Me' }), participant('ana', { name: 'Ana', cameraEnabled: true, micEnabled: false, speaking: true })), nearby: new Set(['ana']) },
      people: new Map([['ana', person('Ana', 30)]]),
    }))

    expect(strip).toHaveLength(2)
    expect(strip[0]).toMatchObject({ sessionId: 'me', isLocal: true, kind: 'camera' })
    expect(strip[1]).toMatchObject({ sessionId: 'ana', name: 'Ana', isLocal: false, kind: 'camera', cameraEnabled: true, micEnabled: false, speaking: true })
  })

  it('shows nothing while nobody is nearby', () => {
    const { strip, grid } = new CallTiles().compute(input({
      situation: { kind: 'office', room: room(participant('me')), nearby: new Set() },
    }))

    expect(strip).toEqual([])
    expect(grid).toEqual([])
  })

  it('leaves out someone connected to the office but not nearby', () => {
    const { strip } = new CallTiles().compute(input({
      situation: { kind: 'office', room: room(participant('me'), participant('ana'), participant('far')), nearby: new Set(['ana']) },
      people: new Map([['ana', person('Ana', 30)], ['far', person('Far', 900)]]),
    }))

    expect(strip.map(entry => ('sessionId' in entry ? entry.sessionId : '+'))).toEqual(['me', 'ana'])
  })

  it('leaves out a Busy remote, and does not turn them into a placeholder', () => {
    const { strip } = new CallTiles().compute(input({
      situation: { kind: 'office', room: room(participant('me'), participant('ana'), participant('bia')), nearby: new Set(['ana', 'bia']) },
      people: new Map([['ana', person('Ana', 30, 'busy')], ['bia', person('Bia', 40)]]),
    }))

    expect(strip.map(entry => ('sessionId' in entry ? entry.sessionId : '+'))).toEqual(['me', 'bia'])
  })

  it('shows nothing, strip and grid, when the local person is Busy', () => {
    const output = new CallTiles().compute(input({
      localBusy: true,
      situation: { kind: 'office', room: room(participant('me'), participant('ana')), nearby: new Set(['ana']) },
      people: new Map([['ana', person('Ana', 30)]]),
    }))

    expect(output).toEqual({ strip: [], grid: [] })
  })

  it('gives a person who shares their screen a second tile, ahead of the cameras, and puts it in the grid', () => {
    const { strip, grid } = new CallTiles().compute(input({
      situation: { kind: 'office', room: room(participant('me'), participant('ana', { screenTrack: track }), participant('bia')), nearby: new Set(['ana', 'bia']) },
      people: new Map([['ana', person('Ana', 90)], ['bia', person('Bia', 10)]]),
    }))

    expect(strip.slice(1).map(entry => ('sessionId' in entry ? `${entry.sessionId}:${'kind' in entry ? entry.kind : ''}` : '+'))).toEqual(['ana:screen', 'bia:camera', 'ana:camera'])
    expect(grid).toEqual([{ sessionId: 'ana', name: 'ANA', isLocal: false, videoTrack: track }])
  })

  it('adds a second "You" tile while the local person shares, and a lone presenter still sees it', () => {
    const { strip, grid } = new CallTiles().compute(input({
      situation: { kind: 'office', room: room(participant('me', { screenTrack: track })), nearby: new Set() },
    }))

    expect(strip).toHaveLength(1)
    expect(strip[0]).toMatchObject({ sessionId: 'me', isLocal: true, kind: 'screen' })
    expect(grid).toHaveLength(1)
  })

  it('orders the remotes closest first and folds the rest into a "+N" tile', () => {
    const others = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => participant(id))
    const people = new Map(others.map((other, index) => [other.sessionId, person(other.sessionId, 100 - index * 10)] as const))

    const { strip } = new CallTiles().compute(input({
      situation: { kind: 'office', room: room(participant('me'), ...others), nearby: new Set(others.map(other => other.sessionId)) },
      people,
    }))

    expect(strip.map(entry => ('sessionId' in entry ? entry.sessionId : `+${(entry as { overflowCount: number }).overflowCount}`))).toEqual(['me', 'f', 'e', 'd', 'c', '+2'])
  })

  it('shows the local tile as still connecting while the microphone and camera are set up, and no local share', () => {
    const { strip } = new CallTiles().compute(input({
      mediaConnecting: true,
      situation: { kind: 'office', room: room(participant('me', { screenTrack: track }), participant('ana')), nearby: new Set(['ana']) },
      people: new Map([['ana', person('Ana', 30)]]),
    }))

    expect(strip[0]).toMatchObject({ sessionId: 'me', isLocal: true, pending: true })
    expect(strip.some(entry => 'kind' in entry && entry.kind === 'screen')).toBe(false)
  })
})

describe('callTiles in a private room', () => {
  const occupants = ['ana', 'bia']

  it('shows everyone connected, near or far, and a placeholder for an occupant who has not connected yet', () => {
    const { strip } = new CallTiles().compute(input({
      situation: { kind: 'private', room: room(participant('me'), participant('ana')), occupants },
      people: new Map([['ana', person('Ana', 30)], ['bia', person('Bia', 40)]]),
    }))

    expect(strip[1]).toMatchObject({ sessionId: 'ana', kind: 'camera' })
    expect(strip[2]).toMatchObject({ sessionId: 'bia', name: 'Bia', pending: true, isLocal: false })
  })

  it('stops showing a placeholder after 15 seconds, and shows a real tile if the person connects later', () => {
    const tiles = new CallTiles()
    const situation = (connected: boolean) => ({ kind: 'private' as const, room: room(participant('me'), ...(connected ? [participant('bia')] : [])), occupants: ['bia'] })
    const people = new Map([['bia', person('Bia', 40)]])

    expect(tiles.compute(input({ situation: situation(false), people, now: 0 })).strip).toHaveLength(2)
    expect(tiles.compute(input({ situation: situation(false), people, now: 14_999 })).strip).toHaveLength(2)
    expect(tiles.compute(input({ situation: situation(false), people, now: 15_000 })).strip).toEqual([])
    expect(tiles.compute(input({ situation: situation(true), people, now: 20_000 })).strip[1]).toMatchObject({ sessionId: 'bia', kind: 'camera' })
  })

  it('times a placeholder from scratch again after a reset (a private room just connected)', () => {
    const tiles = new CallTiles()
    const pending = { kind: 'private' as const, room: room(participant('me')), occupants: ['bia'] }
    const people = new Map([['bia', person('Bia', 40)]])
    tiles.compute(input({ situation: pending, people, now: 0 }))
    expect(tiles.compute(input({ situation: pending, people, now: 15_000 })).strip).toEqual([])

    tiles.reset()

    expect(tiles.compute(input({ situation: pending, people, now: 16_000 })).strip).toHaveLength(2)
  })

  it('does not turn a Busy occupant into a placeholder', () => {
    const { strip } = new CallTiles().compute(input({
      situation: { kind: 'private', room: room(participant('me')), occupants: ['bia'] },
      people: new Map([['bia', person('Bia', 40, 'busy')]]),
    }))

    expect(strip).toEqual([])
  })

  it('clears the strip, and leaves the grid as it is, when the local person is Busy', () => {
    const output = new CallTiles().compute(input({
      localBusy: true,
      situation: { kind: 'private', room: room(participant('me'), participant('ana', { screenTrack: track })), occupants: ['ana'] },
      people: new Map([['ana', person('Ana', 30)]]),
    }))

    expect(output).toEqual({ strip: [], grid: null })
  })
})

describe('callTiles when the connection to the private room failed', () => {
  const people = new Map([['ana', person('Ana', 30)], ['bia', person('Bia', 40, 'busy')]])
  const base = { localSessionId: 'me', localName: 'Me', people }

  it('shows an error tile for the local person and a placeholder for each occupant who is not Busy', () => {
    const { strip, grid } = new CallTiles().compute(input({ ...base, situation: { kind: 'error', occupants: ['ana', 'bia'], retrying: false } }))

    expect(strip).toHaveLength(2)
    expect(strip[0]).toMatchObject({ sessionId: 'me', name: 'Me', isLocal: true, error: true })
    expect(strip[1]).toMatchObject({ sessionId: 'ana', name: 'Ana', pending: true })
    expect(grid).toEqual([])
  })

  it('turns the error into a spinner while "Try again" runs', () => {
    const { strip } = new CallTiles().compute(input({ ...base, situation: { kind: 'error', occupants: ['ana'], retrying: true } }))

    expect(strip[0]).toMatchObject({ sessionId: 'me', isLocal: true, pending: true })
  })

  it('shows nothing when the local person is Busy', () => {
    const output = new CallTiles().compute(input({ ...base, localBusy: true, situation: { kind: 'error', occupants: ['ana'], retrying: false } }))

    expect(output).toEqual({ strip: [], grid: [] })
  })
})
