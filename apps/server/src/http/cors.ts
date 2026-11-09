import type { NextFunction, Request, RequestHandler, Response } from 'express'
import type { AuthConfig } from '../auth/auth-config'
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
 * leaves the allowlist as the only source for the account routes (the game's matchmaking keeps
 * Colyseus's own behaviour).
 */
function clearInheritedCorsHeaders(_req: Request, res: Response, next: NextFunction): void {
  for (const header of CORS_HEADERS)
    res.removeHeader(header)
  next()
}

/** CORS for the routes that use the session cookie: only the configured web client origins, with credentials. */
export function accountCors(config: AuthConfig): RequestHandler[] {
  return [
    clearInheritedCorsHeaders,
    cors({
      origin: (origin, callback) => callback(null, isAllowedOrigin(origin, config)),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  ]
}

/**
 * Cookie-authenticated routes that change something must come from the web client. Browsers always
 * send `Origin` on cross-origin writes, so one that is not allowed is refused; a request with no
 * `Origin` (curl, server to server) carries no ambient browser cookie to abuse. better-auth does the
 * same check for its own routes; this covers the ones in this folder.
 */
export function requireTrustedOrigin(config: AuthConfig): RequestHandler {
  return (req, res, next) => {
    if (!isAllowedOrigin(req.headers.origin, config)) {
      res.status(403).json({ message: 'Invalid origin', code: 'INVALID_ORIGIN' })
      return
    }
    next()
  }
}
