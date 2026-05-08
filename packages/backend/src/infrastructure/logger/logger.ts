import pino from 'pino'
import { env } from '../../config/env.js'

const transport = env.NODE_ENV === 'development'
  ? { target: 'pino-pretty', options: { colorize: true } }
  : undefined

export const logger = pino({
  level: env.LOG_LEVEL,
  transport,
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'req.headers["stripe-signature"]',
      'steamApiKey',
      // Stripe SDK errors include a `raw` property with the request payload —
      // strip it so signed event bodies don't appear in 500 logs.
      'err.raw',
      '*.raw',
    ],
    censor: '[REDACTED]',
  },
})

export const dbLogger = logger.child({ module: 'database' })
export const authLogger = logger.child({ module: 'auth' })
export const steamLogger = logger.child({ module: 'steam' })
export const socketLogger = logger.child({ module: 'socket' })
export const epicLogger = logger.child({ module: 'epic' })
export const gogLogger = logger.child({ module: 'gog' })
