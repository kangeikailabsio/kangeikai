import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { AVATAR_DIRECTIONS, AVATAR_MOTION_STATES, AVATAR_PRESENCES, AVATAR_SPRITE_TYPES } from '../src/avatar'
import {
  INTERACTION_KINDS,
  OFFICE_MESSAGES,
  officeJoinOptionsSchema,
  parseOfficeMessage,
} from '../src/office-protocol'

const interactionPayloadSchema = OFFICE_MESSAGES.interaction.schema
const setPresencePayloadSchema = OFFICE_MESSAGES.setPresence.schema
const updateStatePayloadSchema = OFFICE_MESSAGES.updateState.schema

const baseJoinOptions = { ticket: '42.1700000060000.signature' }

describe('updateStatePayloadSchema numbers (issue #255)', () => {
  it('refuses NaN and Infinity as positions', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(v.safeParse(updateStatePayloadSchema, { x: bad, y: 1, direction: 'up', motionState: 'idle' }).success).toBe(false)
      expect(v.safeParse(updateStatePayloadSchema, { x: 1, y: bad, direction: 'up', motionState: 'idle' }).success).toBe(false)
    }
  })
})

describe('officeJoinOptionsSchema', () => {
  it('requires a non-empty ticket', () => {
    expect(v.safeParse(officeJoinOptionsSchema, {}).success).toBe(false)
    expect(v.safeParse(officeJoinOptionsSchema, { ticket: '' }).success).toBe(false)
    expect(v.safeParse(officeJoinOptionsSchema, { ticket: 123 }).success).toBe(false)
    expect(v.parse(officeJoinOptionsSchema, baseJoinOptions).ticket).toBe(baseJoinOptions.ticket)
  })

  it('no longer accepts who the person is from the client: name and avatar are dropped', () => {
    const result = v.parse(officeJoinOptionsSchema, { ...baseJoinOptions, displayName: 'Mallory', spriteType: 'man', accessCode: 'x', guestId: 'g' })

    expect(result).toEqual({ ticket: baseJoinOptions.ticket, presence: 'available' })
  })

  it('defaults presence to available when omitted', () => {
    const result = v.parse(officeJoinOptionsSchema, baseJoinOptions)

    expect(result.presence).toBe('available')
  })

  it('accepts available and busy presence on join', () => {
    expect(v.parse(officeJoinOptionsSchema, { ...baseJoinOptions, presence: 'available' }).presence).toBe('available')
    expect(v.parse(officeJoinOptionsSchema, { ...baseJoinOptions, presence: 'busy' }).presence).toBe('busy')
  })

  it('rejects an invalid presence on join', () => {
    const result = v.safeParse(officeJoinOptionsSchema, {
      ...baseJoinOptions,
      presence: 'away',
    })

    expect(result.success).toBe(false)
  })
})

describe('setPresencePayloadSchema', () => {
  it('accepts only the presence picklist', () => {
    expect(v.parse(setPresencePayloadSchema, { presence: 'available' })).toEqual({ presence: 'available' })
    expect(v.parse(setPresencePayloadSchema, { presence: 'busy' })).toEqual({ presence: 'busy' })
  })

  it('rejects an invalid presence', () => {
    const result = v.safeParse(setPresencePayloadSchema, { presence: 'away' })

    expect(result.success).toBe(false)
  })
})

describe('interactionPayloadSchema', () => {
  it('accepts the hello kind', () => {
    const result = v.parse(interactionPayloadSchema, { kind: 'hello', targetSessionId: 'abc' })

    expect(result).toEqual({ kind: 'hello', targetSessionId: 'abc' })
  })

  it('accepts the attention kind, even though only hello is used by this issue', () => {
    const result = v.parse(interactionPayloadSchema, { kind: 'attention', targetSessionId: 'abc' })

    expect(result.kind).toBe('attention')
  })

  it('rejects an unknown kind', () => {
    const result = v.safeParse(interactionPayloadSchema, { kind: 'wave', targetSessionId: 'abc' })

    expect(result.success).toBe(false)
  })

  it('rejects a missing targetSessionId', () => {
    const result = v.safeParse(interactionPayloadSchema, { kind: 'hello' })

    expect(result.success).toBe(false)
  })
})

describe('updateStatePayloadSchema', () => {
  const baseUpdateState = {
    x: 10,
    y: 20,
    direction: 'down' as const,
    motionState: 'idle' as const,
  }

  it('does not include presence in the parsed output', () => {
    const result = v.parse(updateStatePayloadSchema, {
      ...baseUpdateState,
      presence: 'busy',
    })

    expect(result).toEqual(baseUpdateState)
    expect('presence' in result).toBe(false)
  })
})

describe('the office protocol table', () => {
  const samples = {
    updateState: { x: 10, y: 20, direction: 'left', motionState: 'walking' },
    setPresence: { presence: 'busy' },
    interaction: { kind: 'hello', targetSessionId: 'abc' },
    interactionReceived: { kind: 'attention', fromSessionId: 'abc', fromDisplayName: 'Ana' },
    spawn: { x: 300, y: 2300 },
    correctPosition: { x: 1, y: 2 },
    sessionProof: { proof: 'signature' },
  } as const

  it('has a sample for every message, so a new message cannot skip the contract tests', () => {
    expect(Object.keys(samples).sort()).toEqual(Object.keys(OFFICE_MESSAGES).sort())
  })

  it('round-trips every message through its own schema', () => {
    for (const name of Object.keys(OFFICE_MESSAGES) as (keyof typeof OFFICE_MESSAGES)[]) {
      expect(parseOfficeMessage(name, samples[name])).toEqual(samples[name])
    }
  })

  it('refuses a payload that belongs to another message', () => {
    expect(parseOfficeMessage('spawn', samples.sessionProof)).toBeUndefined()
    expect(parseOfficeMessage('sessionProof', samples.spawn)).toBeUndefined()
    expect(parseOfficeMessage('interaction', samples.interactionReceived)).toBeUndefined()
    expect(parseOfficeMessage('interactionReceived', samples.interaction)).toBeUndefined()
  })

  it('refuses anything that is not a payload, without throwing', () => {
    for (const name of Object.keys(OFFICE_MESSAGES) as (keyof typeof OFFICE_MESSAGES)[]) {
      for (const bad of [undefined, null, 'x', 42, [], {}])
        expect(parseOfficeMessage(name, bad)).toBeUndefined()
    }
  })

  it('refuses a position that is not finite', () => {
    expect(parseOfficeMessage('spawn', { x: Number.NaN, y: 1 })).toBeUndefined()
    expect(parseOfficeMessage('correctPosition', { x: 1, y: Number.POSITIVE_INFINITY })).toBeUndefined()
  })

  it('refuses an empty session proof', () => {
    expect(parseOfficeMessage('sessionProof', { proof: '' })).toBeUndefined()
  })

  it('declares a direction for every message', () => {
    for (const message of Object.values(OFFICE_MESSAGES))
      expect(['toServer', 'toClient']).toContain(message.direction)
  })
})

describe('the values the schemas allow come from avatar.ts, not from copies', () => {
  it('accepts every direction, motion state, presence and sprite, and nothing else', () => {
    for (const direction of AVATAR_DIRECTIONS)
      expect(parseOfficeMessage('updateState', { x: 0, y: 0, direction, motionState: 'idle' })).toBeDefined()
    for (const motionState of AVATAR_MOTION_STATES)
      expect(parseOfficeMessage('updateState', { x: 0, y: 0, direction: 'up', motionState })).toBeDefined()
    for (const presence of AVATAR_PRESENCES)
      expect(parseOfficeMessage('setPresence', { presence })).toBeDefined()
    for (const kind of INTERACTION_KINDS)
      expect(parseOfficeMessage('interaction', { kind, targetSessionId: 'a' })).toBeDefined()
    expect(AVATAR_SPRITE_TYPES.length).toBeGreaterThan(0)
    expect(parseOfficeMessage('updateState', { x: 0, y: 0, direction: 'north', motionState: 'idle' })).toBeUndefined()
  })
})
