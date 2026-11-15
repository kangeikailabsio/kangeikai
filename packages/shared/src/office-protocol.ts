import * as v from 'valibot'
import { AVATAR_DIRECTIONS, AVATAR_MOTION_STATES, AVATAR_PRESENCES, AVATAR_SPRITE_TYPES } from './avatar'

/**
 * The office room's wire protocol, defined once: every message's name, direction and payload
 * schema. The server registers its handlers and the client its listeners from this table, so a
 * message cannot be renamed on one side only, and a payload is checked by the same schema that
 * describes it. (The pool keeps its own protocol in `@kangeikai/game-pool/protocol`.)
 */

const finiteNumber = v.pipe(v.number(), v.finite())
const nonNegativeInteger = v.pipe(v.number(), v.integer(), v.minValue(0))

export const directionSchema = v.picklist(AVATAR_DIRECTIONS)
export const motionStateSchema = v.picklist(AVATAR_MOTION_STATES)
export const spriteTypeSchema = v.picklist(AVATAR_SPRITE_TYPES)
export const presenceSchema = v.picklist(AVATAR_PRESENCES)

export const positionSchema = v.object({ x: finiteNumber, y: finiteNumber })

/**
 * Only checks the *shape* of a Character Creator selection (plausible non-negative integers), not
 * that a given style/variant exists in the asset pack: only the client has the images to check
 * that against (issue #167's split between `packages/shared` and the client). The field is purely
 * cosmetic, so the stakes are low.
 */
const characterPieceRefSchema = v.object({
  style: nonNegativeInteger,
  variant: v.optional(nonNegativeInteger),
})
export const characterSelectionSchema = v.object({
  body: nonNegativeInteger,
  eyes: nonNegativeInteger,
  outfit: characterPieceRefSchema,
  hairstyle: characterPieceRefSchema,
  accessory: v.nullable(characterPieceRefSchema),
})

/**
 * Client→server join payload (`joinOrCreate`, not a message). Who the person is (name, avatar) is
 * not sent: `OfficeRoom.onAuth` derives it from the account behind `ticket` (issue #232), so a
 * client cannot claim another identity.
 */
export const officeJoinOptionsSchema = v.object({
  /** Short-lived pass from `POST /api/session-ticket`. */
  ticket: v.pipe(v.string(), v.nonEmpty()),
  /** Busy is a per-tab choice the person made before this join (it survives a reload), so it stays client-reported. */
  presence: v.optional(presenceSchema, 'available'),
})

/**
 * A generic point-to-point nudge, not named for "Say Hello" (issue #157): a second interaction
 * ("chamar atenção") reuses the same message with `kind: 'attention'`. Only `'hello'` is acted
 * on by either side today.
 */
export const INTERACTION_KINDS = ['hello', 'attention'] as const
export type InteractionKind = (typeof INTERACTION_KINDS)[number]

export const OFFICE_MESSAGES = {
  /** The local avatar's position and motion. */
  updateState: {
    direction: 'toServer',
    schema: v.object({ x: finiteNumber, y: finiteNumber, direction: directionSchema, motionState: motionStateSchema }),
  },
  setPresence: {
    direction: 'toServer',
    schema: v.object({ presence: presenceSchema }),
  },
  interaction: {
    direction: 'toServer',
    schema: v.object({ kind: v.picklist(INTERACTION_KINDS), targetSessionId: v.string() }),
  },
  /** The server relays an `interaction` to its target. */
  interactionReceived: {
    direction: 'toClient',
    schema: v.object({ kind: v.picklist(INTERACTION_KINDS), fromSessionId: v.string(), fromDisplayName: v.string() }),
  },
  /** Where the server placed this person on joining (issue #254). */
  spawn: {
    direction: 'toClient',
    schema: positionSchema,
  },
  /** The server refused a movement and says where to go back to (issue #255). */
  correctPosition: {
    direction: 'toClient',
    schema: positionSchema,
  },
  /** Proves the session id came from `OfficeRoom.onJoin`; required by `/livekit-token`. */
  sessionProof: {
    direction: 'toClient',
    schema: v.object({ proof: v.pipe(v.string(), v.nonEmpty()) }),
  },
} as const

export type OfficeMessageName = keyof typeof OFFICE_MESSAGES
export type ToServerMessageName = { [N in OfficeMessageName]: (typeof OFFICE_MESSAGES)[N]['direction'] extends 'toServer' ? N : never }[OfficeMessageName]
export type ToClientMessageName = Exclude<OfficeMessageName, ToServerMessageName>

/** What a message carries once it has passed its schema. */
export type OfficePayload<N extends OfficeMessageName> = v.InferOutput<(typeof OFFICE_MESSAGES)[N]['schema']>

export type OfficeJoinOptions = v.InferOutput<typeof officeJoinOptionsSchema>

/** Anything that can send a named message: a Colyseus `Room` on the client, a `Client` on the server. */
export interface MessageSender {
  send: (type: string, payload: unknown) => void
}

export function sendToServer<N extends ToServerMessageName>(target: MessageSender, name: N, payload: OfficePayload<N>): void {
  target.send(name, payload)
}

export function sendToClient<N extends ToClientMessageName>(target: MessageSender, name: N, payload: OfficePayload<N>): void {
  target.send(name, payload)
}

/** The payload if it matches the message's schema, otherwise `undefined`. Never throws. */
export function parseOfficeMessage<N extends OfficeMessageName>(name: N, payload: unknown): OfficePayload<N> | undefined {
  const result = v.safeParse(OFFICE_MESSAGES[name].schema, payload)
  return result.success ? result.output as OfficePayload<N> : undefined
}
