// Turns the raw recordings in capture-output/raw into what the landing page serves (issue #242):
// per clip an MP4 (H.264), a WebM (VP9) and a poster image, trimmed to the scene, muted, 1280x720.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const RAW = fileURLToPath(new URL('../capture-output/raw/', import.meta.url))
const OUT = fileURLToPath(new URL('../../apps/client/static/landing/', import.meta.url))
const BUDGET_BYTES = 1.5 * 1024 * 1024
const FPS = 24

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' })
}

const seconds = ms => (ms / 1000).toFixed(3)
const kb = file => `${(statSync(file).size / 1024).toFixed(0)} KB`

if (!existsSync(RAW)) {
  console.error('Nothing to encode: run `pnpm --filter @kangeikai/e2e capture:record` first.')
  process.exit(1)
}
mkdirSync(OUT, { recursive: true })

for (const file of readdirSync(RAW).filter(name => name.endsWith('.json')).sort()) {
  const meta = JSON.parse(readFileSync(join(RAW, file), 'utf8'))
  const source = join(RAW, `${meta.clip}.webm`)
  const { crop } = meta
  const filter = [
    crop ? `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}` : null,
    'scale=1280:720:flags=lanczos',
    `fps=${FPS}`,
  ].filter(Boolean).join(',')
  const trim = ['-ss', seconds(meta.startMs), '-to', seconds(meta.endMs), '-i', source]

  const mp4 = join(OUT, `${meta.clip}.mp4`)
  const webm = join(OUT, `${meta.clip}.webm`)
  const poster = join(OUT, `${meta.clip}-poster.jpg`)
  ffmpeg([...trim, '-vf', filter, '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4])
  ffmpeg([...trim, '-vf', filter, '-an', '-c:v', 'libvpx-vp9', '-crf', '34', '-b:v', '0', '-row-mt', '1', '-pix_fmt', 'yuv420p', webm])
  ffmpeg(['-ss', seconds(meta.startMs + meta.posterMs), '-i', source, '-vf', filter, '-frames:v', '1', '-q:v', '3', poster])

  const heavy = [mp4, webm].filter(path => statSync(path).size > BUDGET_BYTES)
  console.warn(`${meta.clip}: mp4 ${kb(mp4)}, webm ${kb(webm)}, poster ${kb(poster)}${heavy.length ? `  <-- over the ${BUDGET_BYTES / 1024 / 1024} MB budget` : ''}`)
}
