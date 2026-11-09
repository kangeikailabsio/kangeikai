import type { Application } from 'express'
import type { Auth } from '../auth/auth'
import type { AuthConfig } from '../auth/auth-config'
import { toNodeHandler } from 'better-auth/node'
import { accountCors } from './cors'

/**
 * Mounts better-auth under `/api/auth/*` (issue #231). CORS is limited to these routes and to the
 * configured web client origins, with credentials, because the session cookie has to travel from
 * the site to this server (a different origin: another port in dev, a sibling subdomain in prod).
 *
 * Must be registered before any body-parsing middleware: better-auth reads the raw request body.
 */
export function registerAuthRoutes(app: Application, auth: Auth, config: AuthConfig): void {
  app.all('/api/auth/*splat', ...accountCors(config), toNodeHandler(auth))
}
