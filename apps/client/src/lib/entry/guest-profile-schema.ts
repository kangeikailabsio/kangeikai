import type { AvatarSpriteType } from '@kangeikai/shared'
import * as v from 'valibot'
import { MAX_NAME_LENGTH } from './constants'
import { generateDefaultName } from './default-name'

const characterPieceRefSchema = v.object({
  style: v.number(),
  variant: v.optional(v.number()),
})

const characterSelectionSchema = v.object({
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
 * Lenient schema for parsing a stored `GuestProfile` (data-model.md): a per-field
 * `v.fallback()` recovers a corrupted/missing `displayName` or `avatarType` independently
 * (FR-008) rather than discarding the whole stored blob. A structurally invalid blob (not an
 * object at all) still fails `v.safeParse()` outright — there's nothing per-field to fall
 * back to — and callers treat that the same as "no stored profile".
 */
export const guestProfileSchema = v.object({
  displayName: v.fallback(displayNameSchema, () => generateDefaultName()),
  avatarType: v.fallback(avatarTypeSchema, 'man'),
  /**
   * Absent for a profile saved before the Character Creator existed, or if the stored blob is
   * corrupted — `avatarType` above is the fallback the map still renders from either way
   * (issue #169's deliberate non-removal, until issue #170 wires the map up to this instead).
   */
  character: v.fallback(v.optional(characterProfileSchema), undefined),
})

export type GuestProfile = v.InferOutput<typeof guestProfileSchema>
