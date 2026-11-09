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

interface AuthErrorLike {
  status?: number
  code?: string
}

/**
 * Turns whatever the auth client reports into a message safe to show. Server text is never
 * echoed (it can leak internals); known cases get a specific, actionable sentence.
 */
export function describeAuthError(error: unknown): string {
  const { status, code } = (error && typeof error === 'object' ? error : {}) as AuthErrorLike

  if (error instanceof TypeError || status === 0)
    return 'Couldn\'t reach the server. Check your connection and try again.'
  if (code?.startsWith('USER_ALREADY_EXISTS'))
    return 'An account with this email already exists. Try signing in.'
  if (code === 'INVALID_EMAIL_OR_PASSWORD')
    return 'Wrong email or password.'
  if (status === 429)
    return 'Too many attempts. Wait a moment and try again.'
  return 'Something went wrong. Try again.'
}

/**
 * The message for the `?error=` code better-auth appends when a Google sign in fails and sends the
 * person back to the form (`errorCallbackURL`). The code is never shown as is. Empty when there is
 * no error. `account_not_linked` is the common one: better-auth refuses to attach Google to an
 * existing account whose email was never verified, and there is no email verification yet.
 */
export function describeOAuthError(code: string | null): string {
  if (!code)
    return ''
  if (code === 'account_not_linked')
    return 'An account with this email already exists. Sign in with your email and password instead.'
  if (code === 'access_denied')
    return 'Google sign-in was cancelled.'
  return 'Couldn\'t sign in with Google. Try again.'
}
