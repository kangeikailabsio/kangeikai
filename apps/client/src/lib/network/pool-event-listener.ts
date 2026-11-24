import type { MessageSource } from '$lib/network/office-message-listener'
import type { PoolEvent } from '@kangeikai/game-pool/protocol'
import { POOL_EVENT, poolEventSchema } from '@kangeikai/game-pool/protocol'
import * as v from 'valibot'

/**
 * Listens to the pool events the server sends. Like the office messages (#260), an event that
 * does not match `poolEventSchema` is dropped with a warning and the handler never sees it, so a
 * bad or out-of-date server cannot push garbage into the table.
 */
export function listenToPoolEvents(
  source: MessageSource,
  handler: (event: PoolEvent) => void,
  warn: (message: string) => void = message => console.warn(message),
): void {
  source.onMessage(POOL_EVENT, (raw) => {
    if (!v.is(poolEventSchema, raw)) {
      warn('kangeikai: ignored a pool event from the server with an unexpected payload')
      return
    }
    handler(raw)
  })
}
