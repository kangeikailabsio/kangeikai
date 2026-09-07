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
      // `fallback` routes every path to index.html so the client-side router handles routing.
      adapter: adapter({ fallback: 'index.html' }),
    }),
  ],
  server: {
    fs: {
      // The active map's assets (map.tmj + tileset PNGs, active-map.ts) live in
      // packages/shared, not under apps/client, so the server can read the same map.tmj as the
      // client (issue #60) — SvelteKit's default fs.allow list doesn't reach outside
      // apps/client, so the dev server 403s on it (production `vite build` isn't affected, since
      // that restriction is dev-server-only) without this.
      allow: [path.resolve(import.meta.dirname, '../../packages/shared')],
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.spec.ts'],
  },
})
