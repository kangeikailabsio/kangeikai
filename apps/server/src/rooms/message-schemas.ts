import { MAX_NAME_LENGTH } from '@kangeikai/shared'
import * as v from 'valibot'

/**
 * Literal lists mirror packages/shared/src/avatar.ts's AvatarDirection/AvatarMotionState/
 * AvatarSpriteType unions — keep both in sync if those change (contracts/office-room-
 * protocol.md's "Stability" section).
 */
const directionSchema = v.picklist(['up', 'down', 'left', 'right'])
const motionStateSchema = v.picklist(['idle', 'walking', 'sprinting'])
const spriteTypeSchema = v.picklist(['man', 'woman'])
const presenceSchema = v.picklist(['available', 'busy'])
const displayNameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.transform(name => name.slice(0, MAX_NAME_LENGTH)),
  v.minLength(1, 'Display name is required'),
)

/** Client→server join payload (contracts/office-room-protocol.md's OfficeJoinOptions). */
export const officeJoinOptionsSchema = v.object({
  displayName: displayNameSchema,
  spriteType: spriteTypeSchema,
  presence: v.optional(presenceSchema, 'available'),
  /** Checked in `onAuth` against `ACCESS_CODE` (only enforced when that env var is set). */
  accessCode: v.string(),
})

/** Client→server "updateState" message payload (contracts/office-room-protocol.md). */
export const updateStatePayloadSchema = v.object({
  x: v.number(),
  y: v.number(),
  direction: directionSchema,
  motionState: motionStateSchema,
})

/** Client→server "setPresence" message payload. */
export const setPresencePayloadSchema = v.object({
  presence: presenceSchema,
})

/**
 * Client→server "interaction" message payload — a generic point-to-point nudge, not named
 * specifically for "Say Hello" (issue #157): a second point-to-point interaction ("chamar
 * atenção", a planned follow-up issue) reuses this exact same message/handler shape, just with
 * `kind: 'attention'` instead. Only `'hello'` is actually acted on by either side today.
 */
export const interactionPayloadSchema = v.object({
  kind: v.picklist(['hello', 'attention']),
  targetSessionId: v.string(),
})

export type OfficeJoinOptions = v.InferOutput<typeof officeJoinOptionsSchema>
export type UpdateStatePayload = v.InferOutput<typeof updateStatePayloadSchema>
export type SetPresencePayload = v.InferOutput<typeof setPresencePayloadSchema>
export type InteractionPayload = v.InferOutput<typeof interactionPayloadSchema>
