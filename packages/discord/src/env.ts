import dotenv from 'dotenv'

dotenv.config()

export const env = {
  DISCORD_BOT_TOKEN: process.env['DISCORD_BOT_TOKEN'] || '',
  DISCORD_APPLICATION_ID: process.env['DISCORD_APPLICATION_ID'] || '',
  DISCORD_BOT_API_SECRET: process.env['DISCORD_BOT_API_SECRET'] || '',
  BACKEND_URL: process.env['BACKEND_URL'] || 'http://localhost:3000',
}

export function validateEnv(): void {
  const required = ['DISCORD_BOT_TOKEN', 'DISCORD_APPLICATION_ID', 'DISCORD_BOT_API_SECRET'] as const
  for (const key of required) {
    if (!env[key]) {
      throw new Error(`Missing required environment variable: ${key}`)
    }
  }
}
