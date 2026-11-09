import type { AvatarSpriteType } from '@kangeikai/shared'
import * as v from 'valibot'
import { MAX_NAME_LENGTH } from './constants'

const characterPieceRefSchema = v.object({
  style: v.number(),
  variant: v.optional(v.number()),
})

export const characterSelectionSchema = v.object({
  body: v.number(),
  eyes: v.number(),
  outfit: characterPieceRefSchema,
  hairstyle: characterPieceRefSchema,
  accessory: v.nullable(characterPieceRefSchema),
})

/** The composed idle/walk PNGs (data URLs), cached alongside the selection so loading a stored profile never needs to recompose from scratch — only regenerated when the selection actually changes (issue #167/#168's design decision). */
const characterSheetsSchema = v.object({
  idle: v.string(),
  walk: v.string(),
})

export const characterProfileSchema = v.object({
  selection: characterSelectionSchema,
  sheets: characterSheetsSchema,
})

export type CharacterProfile = v.InferOutput<typeof characterProfileSchema>

const AVATAR_TYPES = ['man', 'woman'] as const satisfies readonly AvatarSpriteType[]

/**
 * Strict field schema, reused directly for form-submission validation (FR-002) and wrapped
 * with `v.fallback()` below for lenient stored-profile loading. Only an empty/whitespace-only
 * name blocks (FR-002) — an overlong one is clamped to `MAX_NAME_LENGTH` rather than rejected
 * (quickstart.md's Edge Case scenario 8; FR-003 only requires a maximum be enforced, not that
 * exceeding it blocks entry).
 */
export const displayNameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.transform(name => name.slice(0, MAX_NAME_LENGTH)),
  v.minLength(1, 'Display name is required'),
)

/** Strict field schema — one of the two `AvatarSpriteType`s (feature 001). */
export const avatarTypeSchema = v.picklist(AVATAR_TYPES)

/**
 * What the entry form works with and the game is started from: the account's name and avatar
 * (issue #232). `character` is `undefined` for an account that never picked an avatar, in which
 * case the form generates one.
 */
export interface Profile {
  displayName: string
  avatarType: AvatarSpriteType
  character?: CharacterProfile
}
