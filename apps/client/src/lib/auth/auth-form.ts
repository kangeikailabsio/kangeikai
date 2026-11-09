import { MAX_NAME_LENGTH } from '@kangeikai/shared'
import * as v from 'valibot'

/** Mirrors better-auth's default password rule, which the server (issue #231) will enforce, so the form rejects what the server would. */
export const MIN_PASSWORD_LENGTH = 8
export const MAX_PASSWORD_LENGTH = 128

const emailSchema = v.pipe(
  v.string(),
  v.trim(),
  v.nonEmpty('Enter your email'),
  v.email('Enter a valid email address'),
)

const signInSchema = v.object({
  email: emailSchema,
  // Not length-checked on sign in: an account made under an older rule must still be able to log in.
  password: v.pipe(v.string(), v.nonEmpty('Enter your password')),
})

const signUpSchema = v.object({
  name: v.pipe(
    v.string(),
    v.trim(),
    v.nonEmpty('Enter your name'),
    v.maxLength(MAX_NAME_LENGTH, `Use at most ${MAX_NAME_LENGTH} characters`),
  ),
  email: emailSchema,
  // Passwords are never trimmed: surrounding spaces are part of the secret.
  password: v.pipe(
    v.string(),
    v.minLength(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`),
    v.maxLength(MAX_PASSWORD_LENGTH, `Use at most ${MAX_PASSWORD_LENGTH} characters`),
  ),
})

export type SignInInput = v.InferInput<typeof signInSchema>
export type SignInValue = v.InferOutput<typeof signInSchema>
export type SignUpInput = v.InferInput<typeof signUpSchema>
export type SignUpValue = v.InferOutput<typeof signUpSchema>

export type FormResult<TValue, TField extends string>
  = | { ok: true, value: TValue }
    | { ok: false, errors: Partial<Record<TField, string>> }

function validate<TSchema extends v.GenericSchema, TField extends string>(
  schema: TSchema,
  input: v.InferInput<TSchema>,
): FormResult<v.InferOutput<TSchema>, TField> {
  const result = v.safeParse(schema, input)
  if (result.success)
    return { ok: true, value: result.output }

  const errors: Partial<Record<TField, string>> = {}
  for (const issue of result.issues) {
    const field = issue.path?.[0]?.key as TField | undefined
    // First message per field wins: the schemas list the most basic rule first.
    if (field !== undefined && errors[field] === undefined)
      errors[field] = issue.message
  }
  return { ok: false, errors }
}

export function validateSignIn(input: SignInInput): FormResult<SignInValue, 'email' | 'password'> {
  return validate(signInSchema, input)
}

export function validateSignUp(input: SignUpInput): FormResult<SignUpValue, 'name' | 'email' | 'password'> {
  return validate(signUpSchema, input)
}
