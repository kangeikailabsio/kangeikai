// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }

  interface ImportMetaEnv {
    /** `true` only in the build the end-to-end tests run against (issue #227); see `lib/game/e2e-hook.ts`. */
    readonly VITE_E2E?: string
  }
}

export {}
