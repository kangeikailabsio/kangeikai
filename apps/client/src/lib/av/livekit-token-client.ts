/** Mirrors contracts/livekit-token-endpoint.md's LiveKitTokenRequest — `room` is optional and defaults to the shared `office` room server-side; pass it to request a scoped room instead (e.g. a private zone's room). */
export interface LiveKitTokenRequest {
  /** MUST equal the participant's Colyseus sessionId (contract's "Stability" section). */
  identity: string
  name: string
  /** `RoomConnection.sessionProof` — proves `identity` came from a real `onJoin`. */
  proof: string
  room?: string
}

/** Mirrors contracts/livekit-token-endpoint.md's LiveKitTokenResponse. */
export interface LiveKitTokenResponse {
  token: string
  url: string
}

/** Fetches a scoped LiveKit token from the given `/livekit-token` endpoint. Shared by every controller that connects to a LiveKit room (`ProximityAudioController`, `PrivateRoomController`). */
export async function fetchLiveKitToken(tokenEndpoint: string, request: LiveKitTokenRequest): Promise<LiveKitTokenResponse> {
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(`kangeikai: failed to fetch LiveKit token (${response.status})`)
  }

  return response.json() as Promise<LiveKitTokenResponse>
}
