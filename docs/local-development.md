# Local development

Everything the app needs next to it runs from one compose file: LiveKit (voice/video) and
PostgreSQL (accounts).

```sh
pnpm install

# env files (the .env.example values match docker-compose.dev.yml)
cp apps/server/.env.example apps/server/.env
cp apps/client/.env.example apps/client/.env

# LiveKit + PostgreSQL, then the tables and two dev accounts (safe to re-run)
pnpm dev:infra

pnpm dev:server   # Colyseus + auth on http://localhost:2567
pnpm dev:client   # SvelteKit on http://localhost:5173
```

`pnpm dev:infra` is the same as running `docker compose -f docker-compose.dev.yml up -d --wait`,
`pnpm --filter @kangeikai/server db:migrate` and `pnpm --filter @kangeikai/server db:seed` in order.
Run `db:migrate` again after pulling a new migration.

## Dev accounts

`db:seed` creates two accounts, skipping any that already exist:

| Email | Password | Avatar |
| --- | --- | --- |
| `ana@dev.test` | `dev-password-123` | woman |
| `bruno@dev.test` | `dev-password-123` | man |

The seed refuses to run unless `DATABASE_URL` points at a local database (`localhost`,
`127.0.0.1` or the compose service), because the password is public.

The server refuses to start when an auth variable is missing and lists every one that is. Email
and password works with the placeholder Google values; the "Continue with Google" button needs a
real OAuth client (https://console.cloud.google.com/apis/credentials) whose redirect URI is
`<BETTER_AUTH_URL>/api/auth/callback/google`.

`docker compose -f docker-compose.dev.yml down -v` also wipes the database.

## Tests

The server's database integration tests use [Testcontainers](https://testcontainers.com): each
test file starts its own throwaway PostgreSQL container (`postgres:17-alpine`, the same image as
the compose file), applies the migrations, and empties the tables between tests. They only need
Docker running: no compose stack and no `DATABASE_URL`, and your own database is never touched.

## End-to-end tests

The Playwright suite in `e2e/` drives the real app with several people at once (sign up, the room,
private calls with fake cameras and microphones). It needs the compose stack running:

```sh
pnpm dev:infra
pnpm --filter @kangeikai/e2e install:browsers   # once: downloads Chromium
pnpm test:e2e
```

- It starts its own server (port 2667) and client (port 5273), so it does not collide with
  `pnpm dev:server` / `pnpm dev:client`, and it uses a database of its own (`kangeikai_e2e`),
  recreated at the start of every run and dropped at the end. Your own database is never touched.
- The client of the test build is made with `VITE_E2E=true`, which exposes
  `window.__kangeikaiE2E.teleport(x, y)` so a test can put an avatar in a private zone without
  walking there. A production build leaves that code out.
- Assertions are on the DOM and visible state, never on canvas pixels.
- Failures keep a trace and a video: `pnpm --filter @kangeikai/e2e exec playwright show-report`.
- `E2E_POSTGRES_URL` overrides the PostgreSQL the suite creates its database on.
- The suite shares the dev LiveKit server with `pnpm dev:client`; avoid being in the same call at the same time.

## Landing page clips

The videos on the landing page are recorded by a script, so they can be refreshed whenever the
interface changes (issue #242). It needs the same things as the e2e suite (`pnpm dev:infra`, Chromium
installed) plus `ffmpeg`.

```sh
pnpm capture:landing                                     # records every clip, then encodes them
pnpm --filter @kangeikai/e2e capture:record -g hero      # one clip only (a Playwright --grep)
pnpm --filter @kangeikai/e2e capture:encode              # encodes what was recorded
```

- The scripts are in `e2e/capture/`, one file per clip. They play a scene with a few signed-in people
  on the e2e stack (own server, client and database), and film one of them: the camera follows that
  avatar. Avatars have fixed looks (`capture/support/looks.ts`), so a clip looks the same every time.
- `encode.mjs` trims each recording to its scene and writes `<clip>.mp4`, `<clip>.webm` and
  `<clip>-poster.jpg` to `apps/client/static/landing/`, with a size budget of about 1.5 MB per file.
- A clip stays in a place that is in no private zone when it is about distance: inside a private zone
  everybody is in the same call whatever the distance. The scripts check that the scene starts clean
  (the right people in the room, far enough apart, no video tiles) and fail otherwise.
- `landing-content.ts` names the clips; a unit test checks that every clip it names exists in
  `static/landing/`. A feature without a clip shows a placeholder.

## Changing the auth setup

Auth tables are generated from `apps/server/src/auth/auth-options.ts`:

```sh
pnpm --filter @kangeikai/server db:generate-auth-schema   # rewrites src/db/schema.ts
pnpm --filter @kangeikai/server db:generate                # new SQL migration in apps/server/drizzle
pnpm --filter @kangeikai/server db:migrate
```

## Production notes

- Set `BETTER_AUTH_SECRET` to a real random value (at least 32 characters).
- `CLIENT_ORIGIN` is the exact origin of the site (`https://...`), comma-separated if there are
  several. Only those origins may call the auth routes with cookies.
- Site and server on sibling subdomains (for example `app.example.com` and
  `server.app.example.com`): set `COOKIE_DOMAIN` to the site's host (`app.example.com`) so the
  session cookie is shared. Cookies are `Secure` over https, so serve both over https.
