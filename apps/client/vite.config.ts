import path from 'node:path'
import adapter from '@sveltejs/adapter-static'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    sveltekit({
      compilerOptions: {
        // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
        runes: ({ filename }) =>
          filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
      },

      // SPA mode: static build, no Node runtime to serve the client (constitution Principle V).
      // `fallback` is what a static host serves for every path that is not a file, so the
      // client-side router handles routing. It must NOT be `index.html`: the landing page at `/`
      // is pre-rendered into `index.html` (issue #229), and the fallback would overwrite it.
      adapter: adapter({ fallback: '200.html' }),
    }),
  ],
  server: {
    fs: {
      // The active map's assets (map.tmj + tileset PNGs, active-map.ts) live in
      // packages/shared, not under apps/client, so the server can read the same map.tmj as the
      // client (issue #60) — SvelteKit's default fs.allow list doesn't reach outside
      // apps/client, so the dev server 403s on it (production `vite build` isn't affected, since
      // that restriction is dev-server-only) without this.
      allow: [path.resolve(import.meta.dirname, '../../packages')],
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      // What the unit tests cannot reach, and why. The app is checked by the Playwright suite (`e2e/`)
      // and, for how it looks, by hand in a browser (AGENTS.md: no assertions on canvas pixels).
      exclude: [
        // The Phaser scene and the views it owns: rendering and input glue.
        'src/lib/game/scenes/**',
        'src/lib/game/entities/**',
        'src/lib/game/games/table-glow.ts',
        'src/lib/character/compose-character.ts',
        'src/lib/character/character-portrait.ts',
        // Reactive stores (`$state`) the Svelte components read: they hold values and have no rules of their own.
        '**/*.svelte.ts',
        // Thin adapters over the Colyseus, LiveKit, better-auth and Vite SDKs.
        'src/lib/network/room-connection.ts',
        'src/lib/av/livekit-token-client.ts',
        'src/lib/av/attach-video-track.ts',
        'src/lib/game/map/active-map.ts',
        'src/lib/account/auth-client.ts',
        'src/lib/account/auth-routes.ts',
      ],
      reporter: ['text-summary', 'html'],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 90 },
    },
  },
})
