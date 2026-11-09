import * as v from 'valibot'

export interface AuthConfig {
  databaseUrl: string
  /** Signs sessions and cookies — better-auth refuses to run production without a strong one. */
  secret: string
  /** Where this server is reachable (origin only), used to build OAuth callback URLs. */
  baseUrl: string
  /** Origins of the web client allowed to call the auth routes with cookies (CORS and better-auth's trusted origins). */
  clientOrigins: string[]
  /** Set to share the session cookie across sibling subdomains (e.g. the site and an `api.` host); unset keeps it host-only (dev). */
  cookieDomain: string | undefined
  google: { clientId: string, clientSecret: string }
}

const MIN_SECRET_LENGTH = 32

const required = (name: string) => v.pipe(v.string(`${name} is required`), v.trim(), v.nonEmpty(`${name} is required`))

const envSchema = v.object({
  DATABASE_URL: v.pipe(required('DATABASE_URL'), v.regex(/^postgres(?:ql)?:\/\//, 'DATABASE_URL must be a postgres:// URL')),
  BETTER_AUTH_SECRET: v.pipe(required('BETTER_AUTH_SECRET'), v.minLength(MIN_SECRET_LENGTH, `BETTER_AUTH_SECRET must be at least ${MIN_SECRET_LENGTH} characters`)),
  BETTER_AUTH_URL: v.pipe(required('BETTER_AUTH_URL'), v.regex(/^https?:\/\//, 'BETTER_AUTH_URL must be an http(s) URL')),
  CLIENT_ORIGIN: required('CLIENT_ORIGIN'),
  COOKIE_DOMAIN: v.string(),
  GOOGLE_CLIENT_ID: required('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: required('GOOGLE_CLIENT_SECRET'),
})

/** Normalises a comma-separated list of origins: trimmed, path-less, no trailing slash, deduplicated. */
function parseOrigins(raw: string): string[] {
  const origins = raw.split(',').map(part => part.trim()).filter(Boolean).map((part) => {
    try {
      return new URL(part).origin
    }
    catch {
      throw new Error(`CLIENT_ORIGIN has an invalid origin: "${part}"`)
    }
  })
  return [...new Set(origins)]
}

/**
 * Reads the auth settings from the environment (issue #231). Fails fast with every problem at
 * once — a server that boots without a database or signing secret would only fail later, at the
 * first sign-in, far from the cause.
 */
export function loadAuthConfig(env: Record<string, string | undefined>): AuthConfig {
  // A missing key becomes an empty string so it reports "X is required", not valibot's generic "Invalid key".
  const input = Object.fromEntries(Object.keys(envSchema.entries).map(key => [key, env[key] ?? '']))
  const result = v.safeParse(envSchema, input)
  if (!result.success)
    throw new Error(`Invalid auth configuration:\n${result.issues.map(issue => `- ${issue.message}`).join('\n')}`)

  const { output } = result
  const cookieDomain = output.COOKIE_DOMAIN?.trim()
  return {
    databaseUrl: output.DATABASE_URL,
    secret: output.BETTER_AUTH_SECRET,
    baseUrl: new URL(output.BETTER_AUTH_URL).origin,
    clientOrigins: parseOrigins(output.CLIENT_ORIGIN),
    cookieDomain: cookieDomain || undefined,
    google: { clientId: output.GOOGLE_CLIENT_ID, clientSecret: output.GOOGLE_CLIENT_SECRET },
  }
}

/** CORS check for the auth routes: only the configured web client origins, plus requests that send no `Origin` (same-origin and non-browser callers). */
export function isAllowedOrigin(origin: string | undefined, config: Pick<AuthConfig, 'clientOrigins'>): boolean {
  return origin === undefined || config.clientOrigins.includes(origin)
}
