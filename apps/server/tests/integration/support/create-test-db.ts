import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { runMigrations } from '../../../src/db/migrate'

/**
 * Starts a throwaway PostgreSQL container and applies the project's migrations to it, so
 * integration tests need only Docker: no compose stack, no `DATABASE_URL`, and the developer's
 * own database is never touched. Same image as `docker-compose.dev.yml`. Stop it in `afterAll`.
 */
export async function createTestDb(): Promise<StartedPostgreSqlContainer> {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start()
  await runMigrations(container.getConnectionUri())
  return container
}
