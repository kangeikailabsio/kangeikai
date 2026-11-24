import type { Room } from 'livekit-client'

/** How long `room.connect` may take before the attempt counts as failed (issue #277). */
export const ROOM_CONNECT_TIMEOUT_MS = 15_000

/**
 * `room.connect` with a deadline. A connect that never settles would leave the person with a
 * spinner and no error, so it fails like any other connect error (the private room then retries
 * and shows "Couldn't connect"). The room that timed out is disconnected, so a late success does
 * not leave a connected room that nothing tracks.
 */
export async function connectRoom(room: Room, url: string, token: string, timeoutMs: number = ROOM_CONNECT_TIMEOUT_MS): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  let timedOut = false
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true
      reject(new Error(`kangeikai: room.connect did not finish in ${timeoutMs} ms`))
    }, timeoutMs)
  })
  try {
    await Promise.race([room.connect(url, token), deadline])
  }
  catch (error) {
    if (timedOut)
      void Promise.resolve(room.disconnect()).catch(() => {})
    throw error
  }
  finally {
    clearTimeout(timer)
  }
}
