import * as v from 'valibot'

/**
 * Literal lists mirror packages/shared/src/avatar.ts's AvatarDirection/AvatarMotionState/
 * AvatarSpriteType unions — keep both in sync if those change (contracts/office-room-
 * protocol.md's "Stability" section).
 */
const directionSchema = v.picklist(['up', 'down', 'left', 'right'])
const motionStateSchema = v.picklist(['idle', 'walking', 'sprinting'])
export const spriteTypeSchema = v.picklist(['man', 'woman'])
const presenceSchema = v.picklist(['available', 'busy'])

/**
 * Mirrors packages/shared/src/character.ts's `CharacterPieceRef`/`CharacterSelection` shape —
 * this only checks the *shape* (plausible non-negative integers), not that a given style/variant
 * actually exists in the asset pack, since the server has no access to the pieces themselves
 * (issue #167's deliberate packages/shared-vs-client split: only the client has the images to
 * validate a selection against). Same trust model already accepted for reported position
 * (docs/deferred-scope.md) — this field is purely cosmetic, so the stakes are lower still.
 */
const characterPieceRefSchema = v.object({
  style: v.pipe(v.number(), v.integer(), v.minValue(0)),
  variant: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
})
export const characterSelectionSchema = v.object({
  body: v.pipe(v.number(), v.integer(), v.minValue(0)),
  eyes: v.pipe(v.number(), v.integer(), v.minValue(0)),
  outfit: characterPieceRefSchema,
  hairstyle: characterPieceRefSchema,
  accessory: v.nullable(characterPieceRefSchema),
})

/**
 * Client→server join payload (contracts/office-room-protocol.md's OfficeJoinOptions). Who the person
 * is (name, avatar) is no longer sent: `OfficeRoom.onAuth` derives it from the account behind
 * `ticket` (issue #232), so a client cannot claim another identity.
 */
export const officeJoinOptionsSchema = v.object({
  /** Short-lived pass from `POST /api/session-ticket` (see auth/session-ticket.ts). */
  ticket: v.pipe(v.string(), v.nonEmpty()),
  /** Busy is a per-tab choice the person made before this join (it survives a reload), so it stays client-reported. */
  presence: v.optional(presenceSchema, 'available'),
})

/** Client→server "updateState" message payload (contracts/office-room-protocol.md). */
export const updateStatePayloadSchema = v.object({
  x: v.pipe(v.number(), v.finite()),
  y: v.pipe(v.number(), v.finite()),
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
