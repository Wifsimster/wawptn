import knex, { Knex } from 'knex'
import path from 'path'
import { fileURLToPath } from 'url'
import { env } from '../../config/env.js'
import { dbLogger } from '../logger/logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const db: Knex = knex({
  client: 'pg',
  connection: env.DATABASE_URL,
  pool: {
    min: 2,
    max: 10,
    afterCreate: (_conn: unknown, done: (err?: Error) => void) => {
      dbLogger.debug('new connection created in pool')
      done()
    },
  },
  migrations: {
    directory: path.resolve(__dirname, '..', '..', '..', 'migrations'),
    extension: env.NODE_ENV === 'production' ? 'js' : 'ts',
  },
})

if (env.NODE_ENV === 'development') {
  db.on('query-error', (error, query) => {
    dbLogger.error({ sql: query.sql, error: String(error) }, 'query error')
  })
}

export async function testConnection(): Promise<boolean> {
  try {
    const start = Date.now()
    await db.raw('SELECT 1')
    dbLogger.info({ durationMs: Date.now() - start }, 'database connected')
    return true
  } catch (error) {
    dbLogger.error({ error: String(error) }, 'database connection failed')
    return false
  }
}

export async function closeConnection(): Promise<void> {
  dbLogger.info('closing database connection')
  await db.destroy()
}

export async function runMigrations(): Promise<boolean> {
  try {
    const start = Date.now()
    dbLogger.info('running database migrations')

    const [batchNo, migrations] = await db.migrate.latest()

    if (migrations.length === 0) {
      dbLogger.info({ durationMs: Date.now() - start }, 'database already up to date')
    } else {
      dbLogger.info({ batchNo, migrations, durationMs: Date.now() - start }, 'database migrations completed')
    }

    return true
  } catch (error) {
    dbLogger.error({ error: String(error) }, 'database migration failed')
    return false
  }
}
