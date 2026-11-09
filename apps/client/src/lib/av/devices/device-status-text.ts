import type { PreviewKind, PreviewStatus } from './device-preview'

/**
 * The line shown under a device that does not work, in terms of what the person can do about it
 * (issue #246). `undefined` while it works, is starting, or was switched off on purpose.
 */
export function deviceStatusText(kind: PreviewKind, status: PreviewStatus): string | undefined {
  const noun = kind
  const Noun = kind === 'camera' ? 'Camera' : 'Microphone'
  switch (status) {
    case 'blocked':
      return `${Noun} blocked. Allow it in your browser's site settings, then reload.`
    case 'not-found':
      return `No ${noun} found.`
    case 'in-use':
      return `${Noun} is in use by another app.`
    case 'unknown':
      return `Couldn't start the ${noun}.`
    default:
      return undefined
  }
}
