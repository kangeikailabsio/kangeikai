import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        // Phaser drawing code (the table, the balls, the cue): its look is checked by hand in a browser,
        // never by asserting on canvas pixels (AGENTS.md), and the behaviour is covered by the e2e suite.
        'src/client.ts',
        'src/table-art.ts',
      ],
      reporter: ['text-summary', 'html'],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 90 },
    },
  },
})
