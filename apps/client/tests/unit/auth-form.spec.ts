import { describeAuthError, describeOAuthError, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, validateSignIn, validateSignUp } from '$lib/auth/auth-form'
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

describe('describeAuthError (issue #232)', () => {
  it('explains a duplicate email and points to sign in', () => {
    expect(describeAuthError({ status: 422, code: 'USER_ALREADY_EXISTS' })).toBe('An account with this email already exists. Try signing in.')
    expect(describeAuthError({ status: 422, code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' })).toBe('An account with this email already exists. Try signing in.')
  })

  it('does not reveal whether the email or the password was wrong', () => {
    expect(describeAuthError({ status: 401, code: 'INVALID_EMAIL_OR_PASSWORD' })).toBe('Wrong email or password.')
  })

  it('reports rate limiting', () => {
    expect(describeAuthError({ status: 429 })).toBe('Too many attempts. Wait a moment and try again.')
  })

  it('reports an unreachable server for a network failure', () => {
    expect(describeAuthError({ status: 0, message: 'Failed to fetch' })).toBe('Couldn\'t reach the server. Check your connection and try again.')
    expect(describeAuthError(new TypeError('Failed to fetch'))).toBe('Couldn\'t reach the server. Check your connection and try again.')
  })

  it('falls back to a generic message and never echoes server text', () => {
    expect(describeAuthError({ status: 500, message: 'SELECT * FROM user failed' })).toBe('Something went wrong. Try again.')
    expect(describeAuthError(null)).toBe('Something went wrong. Try again.')
  })
})

describe('describeOAuthError (issue #232)', () => {
  it('shows nothing when the page was not reached through a failed Google sign in', () => {
    expect(describeOAuthError(null)).toBe('')
    expect(describeOAuthError('')).toBe('')
  })

  it('tells the person to use their password when the email already has a password account', () => {
    expect(describeOAuthError('account_not_linked')).toBe('An account with this email already exists. Sign in with your email and password instead.')
  })

  it('says so when the person cancelled at Google', () => {
    expect(describeOAuthError('access_denied')).toBe('Google sign-in was cancelled.')
  })

  it('falls back to a generic message for any other code and never echoes it', () => {
    expect(describeOAuthError('internal_server_error')).toBe('Couldn\'t sign in with Google. Try again.')
    expect(describeOAuthError('<script>alert(1)</script>')).toBe('Couldn\'t sign in with Google. Try again.')
  })
})
