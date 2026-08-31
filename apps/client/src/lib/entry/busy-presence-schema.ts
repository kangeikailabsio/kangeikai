import type { AvatarPresence } from '@kangeikai/shared'
import * as v from 'valibot'

const PRESENCE_VALUES = ['available', 'busy'] as const satisfies readonly AvatarPresence[]

/**
 * Lenient schema for a stored `available` | `busy` picklist. Invalid or unexpected values
 * fall back to `'available'` rather than failing the parse — callers treat that the same as
 * an empty tab (no stored presence).
 */
export const busyPresenceSchema = v.fallback(v.picklist(PRESENCE_VALUES), 'available')

export type BusyPresence = v.InferOutput<typeof busyPresenceSchema>
