import process from 'node:process'
import { WebSocketTransport } from '@colyseus/ws-transport'
import { Server } from 'colyseus'
import { createAuth } from './auth/auth'
import { loadAuthConfig } from './auth/auth-config'
import { createAuthenticator } from './auth/authenticator'
import { createDb } from './db/client'
import { registerAccountRoutes } from './http/account-routes'
import { registerAuthRoutes } from './http/auth-route'
import { registerLiveKitTokenRoute } from './http/livekit-token'
import { OfficeRoom, setOfficeRoomAuthenticator } from './rooms/office-room'

const PORT = Number(process.env.PORT ?? 2567)

async function main(): Promise<void> {
  // Fails fast (listing every missing or invalid variable) instead of booting without auth.
  const authConfig = loadAuthConfig(process.env)
  const { db } = createDb(authConfig.databaseUrl)
  const auth = createAuth(authConfig, db)
  setOfficeRoomAuthenticator(createAuthenticator(authConfig.secret, db))

  const server = new Server({
    transport: new WebSocketTransport(),
    express: (app) => {
      registerAuthRoutes(app, auth, authConfig)
      registerAccountRoutes(app, auth, authConfig, db)
      registerLiveKitTokenRoute(app)
    },
  })

  server.define('office', OfficeRoom)

  await server.listen(PORT)
  console.warn(`kangeikai server listening on ws://localhost:${PORT}`)
}

void main()
