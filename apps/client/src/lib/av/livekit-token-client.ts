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

/** How long the token request may take before it fails (issue #277). */
const TOKEN_FETCH_TIMEOUT_MS = 10_000

/** Fetches a scoped LiveKit token from the given `/livekit-token` endpoint. Shared by every controller that connects to a LiveKit room (`ProximityAudioController`, `PrivateRoomController`). */
export async function fetchLiveKitToken(tokenEndpoint: string, request: LiveKitTokenRequest): Promise<LiveKitTokenResponse> {
  // An AbortController instead of `AbortSignal.timeout`, so the deadline covers reading the body too and tests can drive it with fake timers.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TOKEN_FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`kangeikai: failed to fetch LiveKit token (${response.status})`)
    }

    return await (response.json() as Promise<LiveKitTokenResponse>)
  }
  finally {
    clearTimeout(timer)
  }
}
