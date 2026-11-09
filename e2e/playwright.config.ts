import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'
import { CLIENT_URL } from './support/env'
import { launchArgs, webServer } from './support/stack'

export default defineConfig({
  testDir: './tests',
  // One worker: every test shares the one database and the dev LiveKit server's `office` room.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  globalTeardown: './global-teardown.ts',
  use: {
    baseURL: CLIENT_URL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    permissions: ['microphone', 'camera'],
    launchOptions: { args: launchArgs },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer,
})
