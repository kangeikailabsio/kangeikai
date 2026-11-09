import { describe, expect, it } from 'vitest'
import { DEV_USER_PASSWORD, DEV_USERS, isLocalDatabaseUrl } from '../../src/db/seed-users'

describe('isLocalDatabaseUrl (issue #231 seed)', () => {
  it('accepts a local database', () => {
    expect(isLocalDatabaseUrl('postgres://kangeikai:kangeikai@localhost:5432/kangeikai')).toBe(true)
    expect(isLocalDatabaseUrl('postgres://u:p@127.0.0.1:5432/db')).toBe(true)
    expect(isLocalDatabaseUrl('postgres://u:p@postgres:5432/db')).toBe(true)
  })

  it('refuses anything that is not local, including lookalike hosts', () => {
    expect(isLocalDatabaseUrl('postgres://u:p@db.example.com:5432/db')).toBe(false)
    expect(isLocalDatabaseUrl('postgres://u:p@localhost.example.com:5432/db')).toBe(false)
    expect(isLocalDatabaseUrl('postgres://u:p@10.0.0.5:5432/db')).toBe(false)
  })

  it('refuses a value that is not a url', () => {
    expect(isLocalDatabaseUrl('not a url')).toBe(false)
    expect(isLocalDatabaseUrl('')).toBe(false)
  })
})

describe('dev users', () => {
  it('has unique emails on a reserved test domain and a password that meets the minimum length', () => {
    const emails = DEV_USERS.map(dev => dev.email)

    expect(new Set(emails).size).toBe(emails.length)
    expect(emails.every(email => email.endsWith('@dev.test'))).toBe(true)
    expect(DEV_USER_PASSWORD.length).toBeGreaterThanOrEqual(8)
  })
})
