import { classifyMediaError } from '$lib/av/devices/device-error'
import { describe, expect, it } from 'vitest'

const named = (name: string) => Object.assign(new Error(name), { name })

describe('classifyMediaError (issue #245)', () => {
  it.each(['NotAllowedError', 'SecurityError', 'PermissionDeniedError'])('treats %s as a blocked permission', (name) => {
    expect(classifyMediaError(named(name))).toBe('blocked')
  })

  it.each(['NotFoundError', 'DevicesNotFoundError', 'OverconstrainedError'])('treats %s as no such device', (name) => {
    expect(classifyMediaError(named(name))).toBe('not-found')
  })

  it.each(['NotReadableError', 'TrackStartError'])('treats %s as a device in use', (name) => {
    expect(classifyMediaError(named(name))).toBe('in-use')
  })

  it('treats anything else, including a cancelled publication and non-errors, as unknown', () => {
    expect(classifyMediaError(new Error('Cancelled publication by calling unpublish'))).toBe('unknown')
    expect(classifyMediaError(named('AbortError'))).toBe('unknown')
    expect(classifyMediaError('boom')).toBe('unknown')
    expect(classifyMediaError(null)).toBe('unknown')
    expect(classifyMediaError(undefined)).toBe('unknown')
  })
})
