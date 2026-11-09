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
