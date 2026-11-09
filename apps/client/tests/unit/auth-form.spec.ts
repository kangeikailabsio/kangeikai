import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, validateSignIn, validateSignUp } from '$lib/auth/auth-form'
import { MAX_NAME_LENGTH } from '@kangeikai/shared'
import { describe, expect, it } from 'vitest'

describe('validateSignIn (issue #230)', () => {
  it('accepts a valid email and any non-empty password, trimming the email', () => {
    expect(validateSignIn({ email: '  ana@example.com ', password: 'x' })).toEqual({
      ok: true,
      value: { email: 'ana@example.com', password: 'x' },
    })
  })

  it('does not enforce the password length rule on sign in (old passwords must still work)', () => {
    expect(validateSignIn({ email: 'ana@example.com', password: 'short' }).ok).toBe(true)
  })

  it('reports an empty email and an empty password separately', () => {
    expect(validateSignIn({ email: '  ', password: '' })).toEqual({
      ok: false,
      errors: { email: 'Enter your email', password: 'Enter your password' },
    })
  })

  it('rejects a malformed email', () => {
    const result = validateSignIn({ email: 'not-an-email', password: 'x' })

    expect(result).toEqual({ ok: false, errors: { email: 'Enter a valid email address' } })
  })
})

describe('validateSignUp (issue #230)', () => {
  const valid = { name: 'Ana', email: 'ana@example.com', password: 'a'.repeat(MIN_PASSWORD_LENGTH) }

  it('accepts valid input and trims name and email', () => {
    expect(validateSignUp({ ...valid, name: '  Ana  ', email: ' ana@example.com ' })).toEqual({ ok: true, value: valid })
  })

  it('requires a name, and rejects one longer than the avatar name limit', () => {
    expect(validateSignUp({ ...valid, name: '   ' })).toEqual({ ok: false, errors: { name: 'Enter your name' } })
    expect(validateSignUp({ ...valid, name: 'a'.repeat(MAX_NAME_LENGTH) }).ok).toBe(true)
    expect(validateSignUp({ ...valid, name: 'a'.repeat(MAX_NAME_LENGTH + 1) })).toEqual({
      ok: false,
      errors: { name: `Use at most ${MAX_NAME_LENGTH} characters` },
    })
  })

  it('enforces the password length boundaries', () => {
    expect(validateSignUp({ ...valid, password: 'a'.repeat(MIN_PASSWORD_LENGTH - 1) })).toEqual({
      ok: false,
      errors: { password: `Use at least ${MIN_PASSWORD_LENGTH} characters` },
    })
    expect(validateSignUp({ ...valid, password: 'a'.repeat(MAX_PASSWORD_LENGTH) }).ok).toBe(true)
    expect(validateSignUp({ ...valid, password: 'a'.repeat(MAX_PASSWORD_LENGTH + 1) })).toEqual({
      ok: false,
      errors: { password: `Use at most ${MAX_PASSWORD_LENGTH} characters` },
    })
  })

  it('does not trim the password', () => {
    const result = validateSignUp({ ...valid, password: '  spaced out  ' })

    expect(result).toEqual({ ok: true, value: { ...valid, password: '  spaced out  ' } })
  })

  it('reports every invalid field at once', () => {
    const result = validateSignUp({ name: '', email: 'x', password: '' })

    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(Object.keys(result.errors).sort()).toEqual(['email', 'name', 'password'])
  })
})
