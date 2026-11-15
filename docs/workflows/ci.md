# Continuous integration

What runs on every pull request, and how to run the same things locally.

## Summary

`.github/workflows/ci.yml` runs on every pull request (into any branch, so `epic/*` branches are
covered) and on every push to `main`. A newer push to the same pull request cancels the run in
progress; runs on `main` always finish. `release-please.yml` is separate and unchanged.

All jobs share `.github/actions/setup`: pnpm at the version in `packageManager`, Node 24, and
`pnpm install --frozen-lockfile` with the pnpm store cached.

| Job | What it runs | Locally |
| --- | --- | --- |
| `check` | ESLint and the type checks (`svelte-check` for the client, `tsc` for the rest) | `pnpm lint` and `pnpm check` |
| `build` | The client bundle (with placeholder `PUBLIC_*` values, since they are baked in at build time), a check that `index.html` and `200.html` exist, and the server bundle | `pnpm build` and `pnpm --filter @kangeikai/server build` |
| `unit` | Unit tests of the client, shared and pool packages with coverage, and the server's unit tests | `pnpm test:unit`, `pnpm test:coverage` |
| `integration` | The server's whole suite with coverage: Colyseus rooms, the LiveKit token route and the auth routes against PostgreSQL from Testcontainers (Docker is on the runner) | `pnpm --filter @kangeikai/server test:coverage` |
| `e2e` | The Playwright suite against PostgreSQL and LiveKit from `docker-compose.dev.yml`, split into four groups of spec files that run in parallel, each on its own runner with its own stack; Chromium is cached; the report, traces and videos are uploaded when a test fails | `pnpm dev:infra`, then `pnpm test:e2e` (or `pnpm test:e2e tests/presence.spec.ts`) |

## The e2e groups

The e2e tests share one `office` room and the dev LiveKit server, so they cannot run side by side on
one machine, and one after another they took about five minutes on a runner. The workflow splits the
spec files into four groups of about the same duration (the matrix in the `e2e` job), each running
on its own runner, which brings the job down to about the time of the slowest group. Each group shows
up as its own check, `e2e (<group name>)`.

A new spec file has to be added to a group in `.github/workflows/ci.yml`: the `check` job fails and
names the file if one is missing, so a test can never be left out by accident. Keep the groups
balanced by moving a spec to a shorter group, or by splitting a long file the way `private-room-*`
was split.

## Coverage

Each package that has tests has a `test:coverage` script (Vitest, v8) with thresholds of 90% for
lines, statements and functions and 85% for branches, set in its Vitest config. Only the logic
counts: the config of each package lists what it leaves out and why (the Phaser scene and views, the
`$state` stores, thin SDK adapters, entry points and generated code). That is the code the project
checks in a browser or with the e2e suite instead of unit tests (`AGENTS.md`).

When a threshold fails the job fails; the HTML report is uploaded as an artifact (`coverage-unit`,
`coverage-server`) and is also in `<package>/coverage/index.html` after a local run.

## Required checks

Branch protection is a repository setting, not part of the workflow. Suggested: require `check`,
`build`, `unit` and `integration` on `main`, and add the four `e2e (...)` checks once they have proved stable on
GitHub's runners (it depends on WebRTC between Chromium and a LiveKit container).

## Notes

- Actions are pinned to a major version (`@v4`). Pinning to a commit SHA is stricter and can be done
  with a dependency update tool later.
- The jobs run in parallel and each installs the dependencies from the cache. The integration and
  e2e jobs need Docker, which GitHub-hosted Ubuntu runners provide.
- Contributors need Docker only for `test:integration`, `test:coverage` of the server and `test:e2e`;
  `pnpm test:unit` needs nothing else.
