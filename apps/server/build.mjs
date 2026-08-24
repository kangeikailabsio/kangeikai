import { readFileSync } from 'node:fs'
import process from 'node:process'
import { build } from 'esbuild'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)))

// Bundle workspace packages (e.g. @kangeikai/shared) since they ship raw
// TypeScript with no build step; keep real npm dependencies external.
const external = Object.keys(pkg.dependencies).filter(name => !name.startsWith('@kangeikai/'))

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

async function main() {
  await build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    sourcemap: true,
    outfile: 'dist/index.js',
    external,
  })
}
