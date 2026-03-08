import pino from 'pino'
import { env } from '../../config/env.js'

const transport = env.NODE_ENV === 'development'
  ? { target: 'pino-pretty', options: { colorize: true } }
  : undefined

export const logger = pino({
  level: env.LOG_LEVEL,
  transport,
  redact: {
    paths: ['req.headers.cookie', 'req.headers.authorization', 'steamApiKey'],
    censor: '[REDACTED]',
  },
})

export const dbLogger = logger.child({ module: 'database' })
export const authLogger = logger.child({ module: 'auth' })
export const steamLogger = logger.child({ module: 'steam' })
export const socketLogger = logger.child({ module: 'socket' })
export const battlenetLogger = logger.child({ module: 'battlenet' })
export const epicLogger = logger.child({ module: 'epic' })
