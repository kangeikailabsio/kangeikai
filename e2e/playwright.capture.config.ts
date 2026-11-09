import { defineConfig, devices } from '@playwright/test'
import { CLIENT_URL } from './support/env'
import { launchArgs, webServer } from './support/stack'

/**
 * Records the landing page clips (issue #242): the same isolated stack as the test suite, but the
 * "tests" in `capture/` are scripts that play a scene and leave a raw video behind. Run through
 * `pnpm capture:landing`; `capture/encode.mjs` turns the recordings into the files the page serves.
 */
export default defineConfig({
  testDir: './capture',
  testMatch: '**/*.capture.ts',
  workers: 1,
  fullyParallel: false,
  timeout: 180_000,
  reporter: 'list',
  outputDir: './capture-output/test-results',
  globalTeardown: './global-teardown.ts',
  use: {
    baseURL: CLIENT_URL,
    // A step that cannot find its element fails in seconds instead of waiting for the whole test to time out.
    actionTimeout: 20_000,
    permissions: ['microphone', 'camera'],
    launchOptions: { args: launchArgs },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer,
})
