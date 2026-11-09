// The only pre-rendered route (issue #229): search engines and link previews read real content
// instead of the empty SPA shell. Everything else stays client-only (`ssr = false` in
// `+layout.ts`), and production is still plain static files with no Node runtime.
export const prerender = true
export const ssr = true
