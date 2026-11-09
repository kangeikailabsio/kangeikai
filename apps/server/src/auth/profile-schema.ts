import { MAX_NAME_LENGTH } from '@kangeikai/shared'
import * as v from 'valibot'
import { characterSelectionSchema, spriteTypeSchema } from '../rooms/message-schemas'

/**
 * What a person may change about their own account's avatar (`PUT /api/profile`, issue #232).
 * Same bounds as the sign-up form: a name over the limit is rejected, not silently cut.
 */
export const profileUpdateSchema = v.object({
  displayName: v.pipe(v.string(), v.trim(), v.nonEmpty('Display name is required'), v.maxLength(MAX_NAME_LENGTH, `Use at most ${MAX_NAME_LENGTH} characters`)),
  spriteType: spriteTypeSchema,
  characterSelection: v.optional(characterSelectionSchema),
})

export type ProfileUpdate = v.InferOutput<typeof profileUpdateSchema>
