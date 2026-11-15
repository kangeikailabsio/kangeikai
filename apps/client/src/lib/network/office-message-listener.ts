import type { OfficePayload, ToClientMessageName } from '@kangeikai/shared'
import { parseOfficeMessage } from '@kangeikai/shared'

/** The part of a Colyseus `Room` this module needs, so tests can use a plain fake. */
export interface MessageSource {
  onMessage: (type: string, callback: (payload: unknown) => void) => unknown
}

/**
 * Listens to a server→client message of the office protocol. The payload is checked against the
 * message's schema first: one that does not match is dropped with a warning and the handler never
 * sees it, so a bad or out-of-date server cannot push garbage into the game.
 */
export function listenToOfficeMessage<N extends ToClientMessageName>(
  source: MessageSource,
  name: N,
  handler: (payload: OfficePayload<N>) => void,
  warn: (message: string) => void = message => console.warn(message),
): void {
  source.onMessage(name, (raw) => {
    const payload = parseOfficeMessage(name, raw)
    if (payload === undefined) {
      warn(`kangeikai: ignored a "${name}" message from the server with an unexpected payload`)
      return
    }
    handler(payload)
  })
}
