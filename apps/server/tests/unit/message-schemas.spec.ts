import { MAX_NAME_LENGTH } from '@kangeikai/shared'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { officeJoinOptionsSchema } from '../../src/rooms/message-schemas'

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
})
