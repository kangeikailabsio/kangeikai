/**
 * Whether two lists hold the same entries: same length, and each pair has the same keys with `===`
 * values (a track by identity). `OfficeScene` rebuilds the tile objects on every refresh, so the
 * entries are compared by what they hold, never by reference.
 */
export function sameEntries<T extends object>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((entry, index) => sameFields(entry, b[index]))
}

function sameFields(a: object, b: object): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...keys].every(key => (a as Record<string, unknown>)[key] === (b as Record<string, unknown>)[key])
}
