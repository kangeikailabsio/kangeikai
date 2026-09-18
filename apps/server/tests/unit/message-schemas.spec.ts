import { MAX_NAME_LENGTH } from '@kangeikai/shared'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import {
  interactionPayloadSchema,
  officeJoinOptionsSchema,
  setPresencePayloadSchema,
  updateStatePayloadSchema,
} from '../../src/rooms/message-schemas'

const baseJoinOptions = {
  displayName: 'Alice',
  spriteType: 'woman' as const,
  accessCode: '',
}

describe('officeJoinOptionsSchema', () => {
  it('trims a display name', () => {
    const result = v.parse(officeJoinOptionsSchema, {
      displayName: '  Alice  ',
      spriteType: 'woman',
      accessCode: '',
    })

    expect(result.displayName).toBe('Alice')
  })

  it('clamps a display name to the shared maximum length', () => {
    const result = v.parse(officeJoinOptionsSchema, {
      displayName: 'x'.repeat(MAX_NAME_LENGTH + 10),
      spriteType: 'man',
      accessCode: '',
    })

    expect(result.displayName).toHaveLength(MAX_NAME_LENGTH)
  })

  it('rejects a blank display name', () => {
    const result = v.safeParse(officeJoinOptionsSchema, {
      displayName: '   ',
      spriteType: 'man',
      accessCode: '',
    })

    expect(result.success).toBe(false)
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
