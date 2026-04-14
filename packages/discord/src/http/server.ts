import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { Client } from 'discord.js'
import { env } from '../env.js'
import { isAuthorized } from './auth.js'
import {
  BotHandlerError,
  handleSessionClosed,
  handleSessionCreated,
  handleSessionUpdate,
} from './handlers.js'

/**
 * Internal HTTP API exposed by the Discord bot so the backend can ask it
 * to send/edit/close the interactive vote messages the webhook transport
 * can't carry. Binds to loopback by default (see env.BOT_HTTP_HOST) so the
 * only ambient trust boundary is the shared secret.
 *
 * Kept deliberately minimal — one route per verb, no router, no middleware
 * framework. Adding express here would be overkill for four endpoints.
 */

const MAX_BODY_BYTES = 64 * 1024

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let total = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > MAX_BODY_BYTES) {
        req.destroy()
        reject(new BotHandlerError(413, 'Request body too large'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8')
      if (!raw) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new BotHandlerError(400, 'Invalid JSON body'))
      }
    })
    req.on('error', (err) => reject(err))
  })
}

type Route = (client: Client, body: unknown) => Promise<unknown>

const routes: Record<string, Route> = {
  'POST /internal/session/created': (client, body) =>
    handleSessionCreated(client, body as Parameters<typeof handleSessionCreated>[1]),
  'POST /internal/session/updated': (client, body) =>
    handleSessionUpdate(client, body as Parameters<typeof handleSessionUpdate>[1]),
  'POST /internal/session/closed': (client, body) =>
    handleSessionClosed(client, body as Parameters<typeof handleSessionClosed>[1]),
}

export function startHttpApi(client: Client): void {
  const server = createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/internal/health') {
        sendJson(res, 200, { status: 'ok', ready: client.isReady() })
        return
      }

      if (!isAuthorized(req.headers['authorization'])) {
        sendJson(res, 401, { error: 'unauthorized', message: 'Invalid bot credentials' })
        return
      }

      const key = `${req.method ?? ''} ${req.url ?? ''}`
      const handler = routes[key]
      if (!handler) {
        sendJson(res, 404, { error: 'not_found', message: 'No such endpoint' })
        return
      }

      if (!client.isReady()) {
        sendJson(res, 503, { error: 'not_ready', message: 'Bot is not connected to Discord yet' })
        return
      }

      const body = await readJsonBody(req)
      const result = await handler(client, body)
      sendJson(res, 200, result)
    } catch (err) {
      if (err instanceof BotHandlerError) {
        sendJson(res, err.statusCode, { error: 'handler_error', message: err.message })
        return
      }
      console.error('[bot-http] unexpected error', err)
      sendJson(res, 500, { error: 'internal', message: 'Internal bot error' })
    }
  })

  server.listen(env.BOT_HTTP_PORT, env.BOT_HTTP_HOST, () => {
    console.log(`[bot-http] listening on ${env.BOT_HTTP_HOST}:${env.BOT_HTTP_PORT}`)
  })

  server.on('error', (err) => {
    console.error('[bot-http] server error', err)
  })
}
