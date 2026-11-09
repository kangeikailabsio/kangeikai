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

      prerender: {
        // The landing page links to /sign-in and /sign-up before those routes exist (issue #230).
        // Remove this once they do, so a genuinely broken link fails the build again.
        handleHttpError: ({ path, message }) => {
          if (path === '/sign-in' || path === '/sign-up')
            return
          throw new Error(message)
        },
      },
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
  },
})
