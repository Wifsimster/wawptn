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

export interface BotSettings {
  persona_rotation_enabled: boolean
  friday_schedule: string
  wednesday_schedule: string
  schedule_timezone: string
  disabled_personas: string[]
  announce_persona_change: boolean
  persona_override: string | null
}

const DEFAULT_SETTINGS: BotSettings = {
  persona_rotation_enabled: true,
  friday_schedule: '0 21 * * 5',
  wednesday_schedule: '0 17 * * 3',
  schedule_timezone: 'Europe/Paris',
  disabled_personas: [],
  announce_persona_change: false,
  persona_override: null,
}

export async function getBotSettings(): Promise<BotSettings> {
  try {
    const settings = await backendApi<Partial<BotSettings>>('/api/discord/bot-settings')
    return { ...DEFAULT_SETTINGS, ...settings }
  } catch (err) {
    console.error('[api] Failed to fetch bot settings, using defaults:', err)
    return DEFAULT_SETTINGS
  }
}

export interface ApiPersona {
  id: string
  name: string
  systemPromptOverlay: string
  fridayMessages: string[]
  weekdayMessages: string[]
  backOnlineMessages: string[]
  emptyMentionReply: string
  introMessage: string
  embedColor: number
}

export async function getPersonas(): Promise<ApiPersona[]> {
  return backendApi<ApiPersona[]>('/api/discord/personas')
}
