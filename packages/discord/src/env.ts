import dotenv from 'dotenv'

dotenv.config()

export const env = {
  DISCORD_BOT_TOKEN: process.env['DISCORD_BOT_TOKEN'] || '',
  DISCORD_APPLICATION_ID: process.env['DISCORD_APPLICATION_ID'] || '',
  DISCORD_BOT_API_SECRET: process.env['DISCORD_BOT_API_SECRET'] || '',
  BACKEND_URL: process.env['BACKEND_URL'] || 'http://localhost:3000',
  /** Port the bot exposes its internal HTTP API on for backend → bot calls. */
  BOT_HTTP_PORT: parseInt(process.env['DISCORD_BOT_HTTP_PORT'] || '3001', 10),
  /** Bind address for the internal HTTP API. Default is loopback so that the
   *  API is not exposed outside the local network unless explicitly opted in. */
  BOT_HTTP_HOST: process.env['DISCORD_BOT_HTTP_HOST'] || '127.0.0.1',
}

export function validateEnv(): void {
  const required = ['DISCORD_BOT_TOKEN', 'DISCORD_APPLICATION_ID', 'DISCORD_BOT_API_SECRET'] as const
  for (const key of required) {
    if (!env[key]) {
      throw new Error(`Missing required environment variable: ${key}`)
    }
  }
}
