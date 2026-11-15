import { describe, expect, it } from 'vitest'
import { CLOSE_CODE_SESSION_REPLACED } from '../src/close-codes'

describe('close codes', () => {
  it('uses the range WebSocket reserves for applications (4000 and up)', () => {
    expect(CLOSE_CODE_SESSION_REPLACED).toBeGreaterThanOrEqual(4000)
    expect(CLOSE_CODE_SESSION_REPLACED).toBeLessThanOrEqual(4999)
  })
})
