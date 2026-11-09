import * as v from 'valibot'

export interface Position {
  x: number
  y: number
}

const positionSchema = v.object({ x: v.pipe(v.number(), v.finite()), y: v.pipe(v.number(), v.finite()) })

/** A point the server sends (issue #254, #255): the `spawn` message, where it placed this person, and `correctPosition`, where it sends them back to. `undefined` when the payload is not a point. */
export function parsePosition(payload: unknown): Position | undefined {
  const result = v.safeParse(positionSchema, payload)
  return result.success ? result.output : undefined
}
