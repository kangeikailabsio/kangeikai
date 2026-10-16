import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { $lib: fileURLToPath(new URL('./src', import.meta.url)) } },
  // @colyseus/testing's Server overload always binds port 2568, ignoring its port argument.
  test: { fileParallelism: false },
})
