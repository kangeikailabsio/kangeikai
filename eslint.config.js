import antfu from '@antfu/eslint-config'

export default antfu(
  {
    type: 'app',
    typescript: true,
    svelte: true,
    formatters: false,
  },
  {
    // .claude/ holds Claude Code docs and tooling config (including illustrative code
    // snippets in fenced blocks) — not source code subject to the repo's lint rules.
    ignores: [
      '**/.svelte-kit/**',
      '**/dist/**',
      '**/build/**',
      // drizzle-kit's generated SQL migrations and snapshots (apps/server/drizzle).
      'apps/server/drizzle/**',
      '.claude/**',
    ],
  },
  {
    rules: {
      'unicorn/filename-case': ['error', { case: 'kebabCase' }],
    },
  },
  {
    // SvelteKit's reserved route filenames are framework-mandated, not a naming choice.
    files: ['**/src/routes/**/+*.{ts,js,svelte}'],
    rules: {
      'unicorn/filename-case': 'off',
    },
  },
  {
    // Conventional uppercase filenames mandated by GitHub/npm/Claude Code tooling, not a
    // project naming choice.
    files: ['**/AGENTS.md', '**/CLAUDE.md', '**/README.md', '**/README.*.md'],
    rules: {
      'unicorn/filename-case': 'off',
    },
  },
)
