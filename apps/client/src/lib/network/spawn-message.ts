import * as v from 'valibot'

export interface SpawnPoint {
  x: number
  y: number
}

const spawnSchema = v.object({ x: v.pipe(v.number(), v.finite()), y: v.pipe(v.number(), v.finite()) })

/** The server's `spawn` message (issue #254): where it placed this person. `undefined` when the payload is not a point. */
export function parseSpawn(payload: unknown): SpawnPoint | undefined {
  const result = v.safeParse(spawnSchema, payload)
  return result.success ? result.output : undefined
}
