import type { Application, NextFunction, Request, Response } from 'express'
import type { Auth } from '../auth/auth'
import type { AuthConfig } from '../auth/auth-config'
import { toNodeHandler } from 'better-auth/node'
import cors from 'cors'
import { isAllowedOrigin } from '../auth/auth-config'

const CORS_HEADERS = [
  'Access-Control-Allow-Origin',
  'Access-Control-Allow-Headers',
  'Access-Control-Allow-Methods',
  'Access-Control-Allow-Credentials',
  'Access-Control-Max-Age',
]

/**
 * Colyseus puts its own CORS headers on every response before Express runs — an `Allow-Origin`
 * that echoes whoever asked, with credentials allowed. The `cors` middleware only adds headers,
 * so without this an origin outside the allowlist would still read the response. Clearing them here
 * leaves the allowlist as the only source for the auth routes (the game's matchmaking keeps
 * Colyseus's own behaviour).
 */
function clearInheritedCorsHeaders(_req: Request, res: Response, next: NextFunction): void {
  for (const header of CORS_HEADERS)
    res.removeHeader(header)
  next()
}

/**
 * Mounts better-auth under `/api/auth/*` (issue #231). CORS is limited to these routes and to the
 * configured web client origins, with credentials, because the session cookie has to travel from
 * the site to this server (a different origin: another port in dev, a sibling subdomain in prod).
 *
 * Must be registered before any body-parsing middleware: better-auth reads the raw request body.
 */
export function registerAuthRoutes(app: Application, auth: Auth, config: AuthConfig): void {
  const corsMiddleware = cors({
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin, config)),
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })

  app.all('/api/auth/*splat', clearInheritedCorsHeaders, corsMiddleware, toNodeHandler(auth))
}
