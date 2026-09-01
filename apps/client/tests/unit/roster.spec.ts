import type { RosterPerson } from '$lib/people/roster'
import { sortRoster } from '$lib/people/roster'
import { describe, expect, it } from 'vitest'

function person(overrides: Partial<RosterPerson>): RosterPerson {
  return {
    sessionId: 'session',
    name: 'Name',
    presence: 'available',
    isLocal: false,
    ...overrides,
  }
}

describe('sortRoster', () => {
  it('pins the local person first regardless of presence', () => {
    const local = person({ sessionId: 'local', name: 'Zed', isLocal: true, presence: 'busy' })
    const available = person({ sessionId: 'a', name: 'Amy', presence: 'available' })

    const result = sortRoster([available, local])

    expect(result.map(p => p.sessionId)).toEqual(['local', 'a'])
  })

  it('groups everyone else with available before busy', () => {
    const busy = person({ sessionId: 'b', name: 'Bea', presence: 'busy' })
    const available = person({ sessionId: 'a', name: 'Amy', presence: 'available' })

    const result = sortRoster([busy, available])

    expect(result.map(p => p.sessionId)).toEqual(['a', 'b'])
  })

  it('sorts alphabetically, case-insensitively, within a presence group', () => {
    const bob = person({ sessionId: 'bob', name: 'bob', presence: 'available' })
    const alice = person({ sessionId: 'alice', name: 'Alice', presence: 'available' })

    const result = sortRoster([bob, alice])

    expect(result.map(p => p.sessionId)).toEqual(['alice', 'bob'])
  })

  it('returns an empty list unchanged', () => {
    expect(sortRoster([])).toEqual([])
  })
})
