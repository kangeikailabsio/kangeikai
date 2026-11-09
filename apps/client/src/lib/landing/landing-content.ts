/**
 * Everything the landing page (`routes/+page.svelte`) says and shows, in one place so the copy
 * and the media can be swapped without touching markup (issue #229).
 *
 * Media is a placeholder until `src` is set: drop the gif/video into `apps/client/static/landing/`
 * and set `src` to its path (e.g. `/landing/proximity-chat.mp4`).
 */

export type LandingMediaKind = 'gif' | 'video'

export interface LandingMedia {
  kind: LandingMediaKind
  /** Public path of the file. Leave undefined to show the placeholder. */
  src?: string
  /** Describes what the clip will show — used as the placeholder label and as alt text. */
  alt: string
}

export interface LandingFeature {
  id: string
  title: string
  description: string
  media: LandingMedia
}

export interface LandingStep {
  title: string
  description: string
}

export const GITHUB_URL = 'https://github.com/kangeikailabsio/kangeikai'
// The repository has no LICENSE file yet, so link the official text instead of a path that would 404.
export const LICENSE_URL = 'https://www.gnu.org/licenses/agpl-3.0.html'

export const HERO: { headline: string, subheadline: string, media: LandingMedia } = {
  headline: 'A virtual office you can walk around in',
  subheadline: 'Move your avatar across a shared 2D map and talk to whoever is nearby. Voice and video connect automatically by proximity — no calls to start.',
  media: { kind: 'video', alt: 'A short tour of the office: avatars walking up to each other and starting a conversation' },
}

export const FEATURES: readonly LandingFeature[] = [
  {
    id: 'shared-map',
    title: 'One shared map',
    description: 'Everyone shares the same office. See who is around, who is busy, and walk over to say hi.',
    media: { kind: 'gif', alt: 'Avatars moving around the shared office map' },
  },
  {
    id: 'proximity-chat',
    title: 'Voice and video by proximity',
    description: 'Get close to someone and you hear and see them. Walk away and the conversation fades out, like in a real room.',
    media: { kind: 'video', alt: 'Two avatars getting close and their video tiles appearing' },
  },
  {
    id: 'private-rooms',
    title: 'Private rooms',
    description: 'Step into a private zone to talk without being heard by the rest of the office.',
    media: { kind: 'gif', alt: 'Two avatars entering a private room and the call switching to it' },
  },
  {
    id: 'screen-share',
    title: 'Screen sharing',
    description: 'Share your screen with whoever is in the conversation, and open it full screen when you need the detail.',
    media: { kind: 'video', alt: 'Sharing a screen and expanding it to full screen' },
  },
  {
    id: 'games',
    title: 'Games at the break table',
    description: 'Challenge a coworker to a game of pool without leaving the office.',
    media: { kind: 'gif', alt: 'Two avatars playing pool at a table' },
  },
  {
    id: 'your-avatar',
    title: 'Make it yours',
    description: 'Build your own character and keep it wherever you sign in.',
    media: { kind: 'gif', alt: 'The character creator changing hair and clothes' },
  },
]

export const STEPS: readonly LandingStep[] = [
  { title: 'Create an account', description: 'Sign up with your email or with Google.' },
  { title: 'Pick your avatar', description: 'Choose a name and build your character.' },
  { title: 'Walk up and talk', description: 'Move near someone and the conversation starts on its own.' },
]
