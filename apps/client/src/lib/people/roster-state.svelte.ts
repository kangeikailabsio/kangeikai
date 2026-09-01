import type { RoomConnection } from '$lib/network/room-connection'
import type { RosterPerson } from '$lib/people/roster'
import type { AvatarPresence } from '@kangeikai/shared'
import { sortRoster } from '$lib/people/roster'

const LOCAL_SESSION_ID = 'local'

/**
 * Reactive bridge between `RoomConnection` (event-driven, one callback per remote
 * add/change/remove) and `members-sidebar.svelte` — unlike `video-overlay-state.svelte.ts`
 * this isn't refreshed every frame, since a roster list has no reason to be frame-driven.
 */
function createRosterState() {
  let localName = $state('')
  let localPresence = $state<AvatarPresence>('available')
  let hasLocal = $state(false)
  let remote = $state<RosterPerson[]>([])

  return {
    get people(): RosterPerson[] {
      const local: RosterPerson[] = hasLocal
        ? [{ sessionId: LOCAL_SESSION_ID, name: localName, presence: localPresence, isLocal: true }]
        : []
      return sortRoster([...local, ...remote])
    },
    setLocalName(name: string): void {
      localName = name
      hasLocal = true
    },
    setLocalPresence(presence: AvatarPresence): void {
      localPresence = presence
    },
    /** Wires up to a freshly-joined room; call the returned function on leave/join-failure. */
    connect(roomConnection: RoomConnection): () => void {
      const offAdd = roomConnection.onRemoteAvatarAdd((sessionId, avatar) => {
        remote = [
          ...remote.filter(person => person.sessionId !== sessionId),
          { sessionId, name: avatar.displayName, presence: avatar.presence, isLocal: false },
        ]
      })
      const offChange = roomConnection.onRemoteAvatarChange((sessionId, avatar) => {
        remote = remote.map(person =>
          person.sessionId === sessionId
            ? { ...person, name: avatar.displayName, presence: avatar.presence }
            : person,
        )
      })
      const offRemove = roomConnection.onRemoteAvatarRemove((sessionId) => {
        remote = remote.filter(person => person.sessionId !== sessionId)
      })

      return () => {
        offAdd()
        offChange()
        offRemove()
      }
    },
    reset(): void {
      hasLocal = false
      remote = []
    },
  }
}

export const rosterState = createRosterState()
