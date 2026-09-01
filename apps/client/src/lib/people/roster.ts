import type { AvatarPresence } from '@kangeikai/shared'

export interface RosterPerson {
  sessionId: string
  name: string
  presence: AvatarPresence
  isLocal: boolean
}

/**
 * Local first (there's only ever one), then everyone else grouped by presence — available
 * before busy — alphabetical within each group.
 */
export function sortRoster(people: RosterPerson[]): RosterPerson[] {
  const local = people.filter(person => person.isLocal)
  const others = [...people.filter(person => !person.isLocal)].sort((a, b) => {
    if (a.presence !== b.presence) {
      return a.presence === 'available' ? -1 : 1
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })

  return [...local, ...others]
}
