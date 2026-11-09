import type { PlaywrightTestConfig } from '@playwright/test'
import { ADMIN_DATABASE_URL, CLIENT_PORT, CLIENT_URL, E2E_DATABASE_NAME, e2eDatabaseUrl, SERVER_PORT, SERVER_URL } from './env'

/**
 * The isolated stack every Playwright config of this package runs against (the test suite and the
 * landing capture, issues #227 and #242): its own server and client on ports of their own and a
 * database recreated on every run. Needs the compose stack up (`pnpm dev:infra`): PostgreSQL for
 * the accounts, LiveKit for the calls.
 */
export const webServer: NonNullable<PlaywrightTestConfig['webServer']> = [
  {
    command: 'node support/prepare-database.mjs && pnpm --filter @kangeikai/server exec tsx src/index.ts',
    url: `${SERVER_URL}/api/auth/ok`,
    timeout: 90_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    env: {
      ADMIN_DATABASE_URL,
      E2E_DATABASE_NAME,
      PORT: String(SERVER_PORT),
      DATABASE_URL: e2eDatabaseUrl(),
      BETTER_AUTH_SECRET: 'e2e-better-auth-secret-at-least-32-characters',
      BETTER_AUTH_URL: SERVER_URL,
      CLIENT_ORIGIN: CLIENT_URL,
      GOOGLE_CLIENT_ID: 'e2e-google-client-id',
      GOOGLE_CLIENT_SECRET: 'e2e-google-client-secret',
      SESSION_SIGNING_SECRET: 'e2e-session-signing-secret',
      LIVEKIT_URL: 'ws://localhost:7880',
      LIVEKIT_API_KEY: 'devkey',
      LIVEKIT_API_SECRET: 'secret',
    },
  },
  {
    command: `pnpm --filter @kangeikai/client exec vite dev --port ${CLIENT_PORT} --strictPort`,
    url: CLIENT_URL,
    timeout: 90_000,
    reuseExistingServer: false,
    env: {
      PUBLIC_AUTH_URL: SERVER_URL,
      PUBLIC_COLYSEUS_URL: `ws://localhost:${SERVER_PORT}`,
      PUBLIC_LIVEKIT_TOKEN_ENDPOINT: `${SERVER_URL}/livekit-token`,
      // Turns on the test hook (`window.__kangeikaiE2E`); a production build leaves it out.
      VITE_E2E: 'true',
    },
  },
]

/** Chromium's fake camera and microphone: the media state is real, nothing needs hardware. */
export const launchArgs = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
