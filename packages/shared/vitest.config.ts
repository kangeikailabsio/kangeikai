import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      // Everything in src is logic: nothing to leave out.
      include: ['src/**/*.ts'],
      // `index.ts` only re-exports.
      exclude: ['src/index.ts'],
      reporter: ['text-summary', 'html'],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
})
