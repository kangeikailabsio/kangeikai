import { MAX_NAME_LENGTH } from '@kangeikai/shared'
import * as v from 'valibot'

/**
 * Literal lists mirror packages/shared/src/avatar.ts's AvatarDirection/AvatarMotionState/
 * AvatarSpriteType unions — keep both in sync if those change (contracts/office-room-
 * protocol.md's "Stability" section).
 */
const directionSchema = v.picklist(['up', 'down', 'left', 'right'])
const motionStateSchema = v.picklist(['idle', 'walking'])
const spriteTypeSchema = v.picklist(['man', 'woman'])
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

export type OfficeJoinOptions = v.InferOutput<typeof officeJoinOptionsSchema>
export type UpdateStatePayload = v.InferOutput<typeof updateStatePayloadSchema>
