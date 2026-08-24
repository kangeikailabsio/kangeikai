/** Shared with the room protocol so client and server enforce the same display-name limit. */
export { MAX_NAME_LENGTH } from '@kangeikai/shared'

/** Single `localStorage` key the whole `GuestProfile` blob is stored under (data-model.md). */
export const GUEST_PROFILE_STORAGE_KEY = 'kangeikai:guest-profile'

/** Combined with a noun and a number by `generateDefaultName()` (FR-006, research.md). */
export const DEFAULT_NAME_ADJECTIVES = [
  'Quiet',
  'Curious',
  'Sunny',
  'Swift',
  'Gentle',
  'Bold',
  'Cheerful',
  'Calm',
] as const

/** Combined with an adjective and a number by `generateDefaultName()` (FR-006, research.md). */
export const DEFAULT_NAME_NOUNS = [
  'Fox',
  'Otter',
  'Sparrow',
  'Panda',
  'Heron',
  'Lynx',
  'Rabbit',
  'Owl',
] as const
