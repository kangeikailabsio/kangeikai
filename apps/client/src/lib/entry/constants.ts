/** Shared with the room protocol so client and server enforce the same display-name limit. */
export { MAX_NAME_LENGTH } from '@kangeikai/shared'

/** Single `sessionStorage` key the busy/available picklist is stored under (per-tab presence). */
export const BUSY_PRESENCE_STORAGE_KEY = 'kangeikai:busy-presence'
