import { env } from '../env.js'

interface ApiOptions {
  method?: string
  body?: unknown
  discordUserId?: string
}

export async function backendApi<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, discordUserId } = options

  const headers: Record<string, string> = {
    'Authorization': `Bot ${env.DISCORD_BOT_API_SECRET}`,
    'Content-Type': 'application/json',
  }

  if (discordUserId) {
    headers['X-Discord-User-Id'] = discordUserId
  }

  const res = await fetch(`${env.BACKEND_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error((error as { message?: string }).message || `API error ${res.status}`)
  }

  return res.json() as Promise<T>
}

export interface LinkedChannel {
  channelId: string
  groupName: string
}

export async function getLinkedChannels(): Promise<LinkedChannel[]> {
  return backendApi<LinkedChannel[]>('/api/discord/linked-channels')
}
