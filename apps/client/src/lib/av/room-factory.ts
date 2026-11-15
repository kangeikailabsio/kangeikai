import type { Room } from 'livekit-client'
import { Room as LiveKitRoom } from 'livekit-client'

/**
 * How a controller gets the LiveKit `Room` it owns. Production uses `createLiveKitRoom`; a test
 * passes a function that returns a fake, so the controller can be driven without the SDK (issue #263).
 */
export type RoomFactory = () => Room

export const createLiveKitRoom: RoomFactory = () => new LiveKitRoom()
