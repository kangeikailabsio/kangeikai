/**
 * Everything the landing page (`routes/+page.svelte`) says and shows, in one place so the copy
 * and the media can be swapped without touching markup (issue #229).
 *
 * Media are short muted loops (issue #242): a `clip` name
 * stands for `static/landing/<clip>.mp4`, `<clip>.webm` and `<clip>-poster.jpg`. A feature without
 * a `clip` shows a placeholder until its clip exists.
 */

export interface LandingMedia {
  /** Name of the clip in `static/landing/`; leave undefined to show the placeholder. */
  clip?: string
  /** Describes what the clip shows — used as the placeholder label and as the video's accessible name. */
  alt: string
}

export interface LandingMediaSources {
  mp4: string
  webm: string
  poster: string
}

/** Public paths of a clip's files. */
export function mediaSources(clip: string): LandingMediaSources {
  return {
    mp4: `/landing/${clip}.mp4`,
    webm: `/landing/${clip}.webm`,
    poster: `/landing/${clip}-poster.jpg`,
  }
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
  media: { clip: 'hero', alt: 'A short tour of the office: someone walking out of the meeting room and along the desks, past colleagues at work' },
}

export const FEATURES: readonly LandingFeature[] = [
  {
    id: 'shared-map',
    title: 'One shared map',
    description: 'Everyone shares the same office. See who is around, who is busy, and walk over to say hi.',
    media: { clip: 'shared-map', alt: 'Avatars moving around the shared office, passing each other with their names above their heads' },
  },
  {
    id: 'proximity-chat',
    title: 'Voice and video by proximity',
    description: 'Get close to someone and you hear and see them. Walk away and the conversation fades out, like in a real room.',
    media: { clip: 'proximity-chat', alt: 'Two people walking up to someone, and a video tile for each appearing as they get close' },
  },
  {
    id: 'private-rooms',
    title: 'Private rooms',
    description: 'Step into a private zone to talk without being heard by the rest of the office.',
    media: { clip: 'private-rooms', alt: 'Two avatars stepping into a private zone, the rest of the office dimming and the call moving into it' },
  },
  {
    id: 'screen-share',
    title: 'Screen sharing',
    description: 'Share your screen with whoever is in the conversation, and open it full screen when you need the detail.',
    media: { alt: 'Sharing a screen and expanding it to full screen' },
  },
  {
    id: 'games',
    title: 'Games at the break table',
    description: 'Challenge a coworker to a game of pool without leaving the office.',
    media: { alt: 'Two avatars playing pool at a table' },
  },
  {
    id: 'your-avatar',
    title: 'Make it yours',
    description: 'Build your own character and keep it wherever you sign in.',
    media: { clip: 'your-avatar', alt: 'The character creator changing hair, outfit and eyes in the preview, then shuffling the whole look' },
  },
]

export const STEPS: readonly LandingStep[] = [
  { title: 'Create an account', description: 'Sign up with your email or with Google.' },
  { title: 'Pick your avatar', description: 'Choose a name and build your character.' },
  { title: 'Walk up and talk', description: 'Move near someone and the conversation starts on its own.' },
]
