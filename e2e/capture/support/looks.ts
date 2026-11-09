import type { AvatarSpriteType, CharacterSelection } from '@kangeikai/shared'
import { existsSync } from 'node:fs'

export interface Look {
  spriteType: AvatarSpriteType
  selection: CharacterSelection
}

const PIECES = new URL('../../../apps/client/src/lib/assets/character-pieces/', import.meta.url)
const two = (n: number) => String(n).padStart(2, '0')

/** Fixed avatars, so a clip looks the same every time it is recorded (a new account would get a random one). */
export const LOOKS = {
  ana: { spriteType: 'woman', selection: { body: 3, eyes: 2, outfit: { style: 5, variant: 2 }, hairstyle: { style: 14, variant: 1 }, accessory: null } },
  bruno: { spriteType: 'man', selection: { body: 6, eyes: 5, outfit: { style: 12, variant: 1 }, hairstyle: { style: 3, variant: 3 }, accessory: null } },
  clara: { spriteType: 'woman', selection: { body: 2, eyes: 3, outfit: { style: 21, variant: 3 }, hairstyle: { style: 20, variant: 2 }, accessory: null } },
  davi: { spriteType: 'man', selection: { body: 8, eyes: 1, outfit: { style: 30, variant: 2 }, hairstyle: { style: 9, variant: 3 }, accessory: null } },
} satisfies Record<string, Look>

// A piece that does not exist would make the entry form fall back to a random avatar; fail loudly instead.
for (const [name, { selection }] of Object.entries(LOOKS)) {
  const files = [
    `body/body-${two(selection.body)}.png`,
    `eyes/eyes-${two(selection.eyes)}.png`,
    `outfit/outfit-${two(selection.outfit.style)}-${two(selection.outfit.variant ?? 1)}.png`,
    `hairstyle/hairstyle-${two(selection.hairstyle.style)}-${two(selection.hairstyle.variant ?? 1)}.png`,
  ]
  for (const file of files) {
    if (!existsSync(new URL(file, PIECES)))
      throw new Error(`Look "${name}" uses a piece that does not exist: ${file}`)
  }
}
