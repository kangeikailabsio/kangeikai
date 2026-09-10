/**
 * Which remote avatar (issue #160) the local avatar is currently following, if any — mirrors
 * `avatarProfileState`'s shape (mutated directly by `office-scene.ts`, read by the panel button
 * and the fixed indicator). `undefined` whenever "Follow" isn't active, including target-left-
 * the-room auto-cancellation and the three explicit ways to stop.
 */
function createFollowState() {
  let sessionId = $state<string | undefined>(undefined)

  return {
    get sessionId(): string | undefined {
      return sessionId
    },
    start(target: string): void {
      sessionId = target
    },
    stop(): void {
      sessionId = undefined
    },
  }
}

export const followState = createFollowState()
