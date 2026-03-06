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
      min: 2,
      max: 10,
    },
    migrations: {
      directory: './migrations',
      extension: 'ts',
    },
  },
}

export default config
