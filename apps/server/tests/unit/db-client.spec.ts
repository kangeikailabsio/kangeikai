import { describe, expect, it } from 'vitest'
import { createDb } from '../../src/db/client'

describe('createDb', () => {
  it('handles errors on idle connections instead of crashing the process', async () => {
    // pg's Pool emits "error" when the database drops an idle connection (restart, failover, DROP DATABASE);
    // with no listener Node treats it as an uncaught exception.
    const { pool } = createDb('postgres://user:pass@localhost:5432/db')

    expect(pool.listenerCount('error')).toBeGreaterThan(0)
    await pool.end()
  })
})
