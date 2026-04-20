import { env } from '../env.js'

interface ApiOptions {
  method?: string
  body?: unknown
  discordUserId?: string
}

/**
 * Error thrown by `backendApi` for non-2xx responses. Callers (notably the
 * `@mention` chat handler) need to distinguish between "LLM unavailable",
 * "premium required", "rate limit", etc. to pick the right user-facing
 * response instead of collapsing every failure into a generic message.
 */
export class BackendApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | undefined,
    message: string,
  ) {
    super(message)
    this.name = 'BackendApiError'
  }
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
    const payload = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
    throw new BackendApiError(
      res.status,
      payload.error,
      payload.message || res.statusText || `API error ${res.status}`,
    )
  }

  return res.json() as Promise<T>
}

/**
 * Per-group persona overrides shipped alongside each linked channel. When
 * a field is null/empty, the group inherits the global bot.* defaults.
 */
export interface GroupPersonaOverrides {
  rotationEnabled: boolean | null
  disabledPersonas: string[]
  personaOverride: string | null
  overrideExpiresAt: string | null
}

export interface LinkedChannel {
  /** Backend group UUID — the selection key for the per-group persona
   * hash. Always present on fresh rows; older rows that predate the
   * per-group persona refactor may be missing if the group was deleted. */
  groupId: string
  channelId: string
  /** Discord guild (server) ID — used by the per-guild scheduler to
   * route each channel through its own cron. Nullable for legacy rows
   * inserted before the backend started storing the guild id. */
  guildId: string | null
  groupName: string
  personaSettings: GroupPersonaOverrides
}

export async function getLinkedChannels(): Promise<LinkedChannel[]> {
  return backendApi<LinkedChannel[]>('/api/discord/linked-channels')
}

export interface GuildSettings {
  guildId: string
  friday_schedule: string
  wednesday_schedule: string
  schedule_timezone: string
  overrides: {
    friday_schedule: boolean
    wednesday_schedule: boolean
    schedule_timezone: boolean
  }
  updatedAt: string | null
}

export async function getGuildSettings(guildId: string): Promise<GuildSettings> {
  return backendApi<GuildSettings>(`/api/discord/guild-settings/${guildId}`)
}

export async function updateGuildSettings(
  guildId: string,
  body: {
    friday_schedule?: string | null
    wednesday_schedule?: string | null
    schedule_timezone?: string | null
    updatedByDiscordId?: string
  },
): Promise<void> {
  await backendApi(`/api/discord/guild-settings/${guildId}`, {
    method: 'PUT',
    body,
  })
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
