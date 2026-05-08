import type { Knex } from 'knex'
import 'dotenv/config'

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'pg',
    connection: process.env['DATABASE_URL'] || 'postgresql://wawptn:wawptn_secret@localhost:5432/wawptn',
    migrations: {
      directory: './migrations',
      extension: 'ts',
    },
    seeds: {
      directory: './seeds',
    },
  },

  production: {
    client: 'pg',
    connection: process.env['DATABASE_URL'],
    pool: {
      min: parseInt(process.env['DB_POOL_MIN'] || '2', 10),
      max: parseInt(process.env['DB_POOL_MAX'] || '10', 10),
    },
    migrations: {
      directory: './migrations',
      extension: 'js',
    },
  },
}

export default config
