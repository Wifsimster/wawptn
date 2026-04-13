import cron, { type ScheduledTask } from 'node-cron'
import { EmbedBuilder, type Client, type TextChannel } from 'discord.js'
import {
  getLinkedChannels,
  getBotSettings,
  getGuildSettings,
  type BotSettings,
  type LinkedChannel,
} from './lib/api.js'
import { getTodayPersona, getDefaultPersona, getPersonaById, loadPersonasFromApi, startPersonaCacheRefresh } from './personas.js'

// ─── State ────────────────────────────────────────────────────────────────────

let currentSettings: BotSettings | null = null
let personaAnnounceTask: ScheduledTask | null = null

/**
 * Per-guild reminder tasks. Before Tom #2 the scheduler registered one
 * global Friday and one global Weekday cron and fanned out to every
 * linked channel. With per-guild overrides, we now register one cron
 * per (guild, schedule-kind) combination so `/wawptn-config set` can
 * give each server its own rhythm without affecting the others.
 *
 * Legacy channels without a guild_id (pre-migration rows) fall through
 * to the `null` bucket below, which uses the global defaults.
 */
interface GuildReminderTasks {
  friday: ScheduledTask | null
  weekday: ScheduledTask | null
}
const guildTasks = new Map<string | null, GuildReminderTasks>()

function getPersona() {
  // Admin override takes priority
  if (currentSettings?.persona_override) {
    const override = getPersonaById(currentSettings.persona_override)
    if (override) return override
  }
  if (currentSettings && !currentSettings.persona_rotation_enabled) {
    return getDefaultPersona()
  }
  const disabled = currentSettings?.disabled_personas ?? []
  return getTodayPersona(disabled)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pickRandom(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)]!
}

function buildReminderEmbed(message: string): EmbedBuilder {
  const persona = getPersona()
  return new EmbedBuilder()
    .setDescription(message)
    .setColor(persona.embedColor)
    .setFooter({ text: `WAWPTN — ${persona.name}` })
}

async function sendPersonaAnnouncement(client: Client): Promise<void> {
  try {
    const channels = await getLinkedChannels()

    if (channels.length === 0) {
      console.log('[scheduler] No linked channels found, skipping persona announcement')
      return
    }

    const persona = getPersona()
    const embed = new EmbedBuilder()
      .setDescription(persona.introMessage)
      .setColor(persona.embedColor)
      .setFooter({ text: `WAWPTN — Persona du jour : ${persona.name}` })

    for (const { channelId, groupName } of channels) {
      try {
        const channel = await client.channels.fetch(channelId)
        if (channel?.isTextBased()) {
          await (channel as TextChannel).send({ embeds: [embed] })
          console.log(`[scheduler] Sent persona announcement to channel ${channelId} (${groupName})`)
        }
      } catch (err) {
        console.error(`[scheduler] Failed to send persona announcement to channel ${channelId} (${groupName}):`, err)
      }
    }
  } catch (err) {
    console.error('[scheduler] Failed to send persona announcement:', err)
  }
}

async function sendToChannels(
  client: Client,
  channels: LinkedChannel[],
  pool: string[],
): Promise<void> {
  if (channels.length === 0) return
  const message = pickRandom(pool)
  const embed = buildReminderEmbed(message)

  for (const { channelId, groupName } of channels) {
    try {
      const channel = await client.channels.fetch(channelId)
      if (channel?.isTextBased()) {
        await (channel as TextChannel).send({ embeds: [embed] })
        console.log(`[scheduler] Sent reminder to channel ${channelId} (${groupName})`)
      }
    } catch (err) {
      console.error(`[scheduler] Failed to send to channel ${channelId} (${groupName}):`, err)
    }
  }
}

async function sendToLinkedChannels(client: Client, pool: string[]): Promise<void> {
  try {
    const channels = await getLinkedChannels()
    await sendToChannels(client, channels, pool)
  } catch (err) {
    console.error('[scheduler] Failed to fetch linked channels:', err)
  }
}

// ─── Back online notification ─────────────────────────────────────────────────

export async function notifyBackOnline(client: Client): Promise<void> {
  const persona = getPersona()
  console.log(`[persona] Today's persona: ${persona.name} (${persona.id})`)
  await sendToLinkedChannels(client, persona.backOnlineMessages)
}

// ─── Dynamic cron scheduling ──────────────────────────────────────────────────

function stopAllGuildTasks(): void {
  for (const tasks of guildTasks.values()) {
    tasks.friday?.stop()
    tasks.weekday?.stop()
  }
  guildTasks.clear()
}

function scheduleGuildReminders(
  client: Client,
  guildKey: string | null,
  channels: LinkedChannel[],
  friday: string,
  weekday: string,
  timezone: string,
): void {
  const tasks: GuildReminderTasks = { friday: null, weekday: null }

  if (cron.validate(friday)) {
    tasks.friday = cron.schedule(
      friday,
      () => {
        const persona = getPersona()
        console.log(`[scheduler] Friday reminder triggered for guild ${guildKey ?? '<legacy>'} with persona: ${persona.name}`)
        const jitterMs = Math.floor(Math.random() * 15 * 60 * 1000)
        setTimeout(() => sendToChannels(client, channels, persona.fridayMessages), jitterMs)
      },
      { timezone },
    )
    console.log(`[scheduler] Guild ${guildKey ?? '<legacy>'} friday: ${friday} (${timezone})`)
  } else {
    console.error(`[scheduler] Invalid friday cron for guild ${guildKey ?? '<legacy>'}: ${friday}`)
  }

  if (cron.validate(weekday)) {
    tasks.weekday = cron.schedule(
      weekday,
      () => {
        const persona = getPersona()
        console.log(`[scheduler] Weekday reminder triggered for guild ${guildKey ?? '<legacy>'} with persona: ${persona.name}`)
        const jitterMs = Math.floor(Math.random() * 15 * 60 * 1000)
        setTimeout(() => sendToChannels(client, channels, persona.weekdayMessages), jitterMs)
      },
      { timezone },
    )
    console.log(`[scheduler] Guild ${guildKey ?? '<legacy>'} weekday: ${weekday} (${timezone})`)
  } else {
    console.error(`[scheduler] Invalid weekday cron for guild ${guildKey ?? '<legacy>'}: ${weekday}`)
  }

  guildTasks.set(guildKey, tasks)
}

async function rebuildGuildCrons(client: Client, settings: BotSettings): Promise<void> {
  stopAllGuildTasks()

  let channels: LinkedChannel[] = []
  try {
    channels = await getLinkedChannels()
  } catch (err) {
    console.error('[scheduler] Failed to fetch linked channels for per-guild scheduling:', err)
    return
  }

  // Group channels by guild so we schedule at most one (friday, weekday)
  // pair per unique Discord guild. Legacy channels without a guild_id
  // are bucketed under null and use the global defaults.
  const byGuild = new Map<string | null, LinkedChannel[]>()
  for (const channel of channels) {
    const key = channel.guildId ?? null
    const bucket = byGuild.get(key)
    if (bucket) bucket.push(channel)
    else byGuild.set(key, [channel])
  }

  // Fall back to the global defaults whenever a guild has no explicit
  // override. The backend loadGlobalBotDefaults() endpoint returns the
  // resolved values already, so each guild call is a single round-trip.
  for (const [guildKey, guildChannels] of byGuild) {
    let friday = settings.friday_schedule
    let weekday = settings.wednesday_schedule
    let timezone = settings.schedule_timezone || 'Europe/Paris'

    if (guildKey) {
      try {
        const override = await getGuildSettings(guildKey)
        friday = override.friday_schedule
        weekday = override.wednesday_schedule
        timezone = override.schedule_timezone
      } catch (err) {
        console.error(`[scheduler] Failed to load guild settings for ${guildKey}, falling back to global:`, err)
      }
    }

    scheduleGuildReminders(client, guildKey, guildChannels, friday, weekday, timezone)
  }
}

function scheduleCrons(client: Client, settings: BotSettings): void {
  // Per-guild reminder crons — rebuilt whenever global or per-guild
  // settings change. The call is async so we fire-and-forget and let
  // the old tasks keep running until the new ones take over.
  void rebuildGuildCrons(client, settings)

  // Persona change announcement at midnight (global, not per-guild).
  personaAnnounceTask?.stop()
  const timezone = settings.schedule_timezone || 'Europe/Paris'
  if (settings.announce_persona_change && settings.persona_rotation_enabled) {
    personaAnnounceTask = cron.schedule(
      '0 0 * * *',
      () => {
        console.log('[scheduler] Midnight persona announcement triggered')
        void sendPersonaAnnouncement(client)
      },
      { timezone },
    )
    console.log(`[scheduler] Persona announcement: 0 0 * * * (${timezone})`)
  } else {
    personaAnnounceTask = null
    console.log('[scheduler] Persona announcement: disabled')
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function startScheduler(client: Client): Promise<void> {
  // Load personas from API (falls back to hardcoded if unavailable)
  await loadPersonasFromApi()
  startPersonaCacheRefresh()

  // Fetch settings from backend
  currentSettings = await getBotSettings()
  console.log(`[scheduler] Loaded settings: persona_rotation=${currentSettings.persona_rotation_enabled}`)

  // Schedule crons with dynamic settings
  scheduleCrons(client, currentSettings)

  // Refresh settings every 5 minutes to pick up admin changes
  setInterval(async () => {
    try {
      const newSettings = await getBotSettings()
      const changed =
        newSettings.friday_schedule !== currentSettings!.friday_schedule ||
        newSettings.wednesday_schedule !== currentSettings!.wednesday_schedule ||
        newSettings.schedule_timezone !== currentSettings!.schedule_timezone ||
        newSettings.announce_persona_change !== currentSettings!.announce_persona_change ||
        newSettings.persona_rotation_enabled !== currentSettings!.persona_rotation_enabled

      currentSettings = newSettings

      if (changed) {
        console.log('[scheduler] Settings changed, rescheduling crons')
        scheduleCrons(client, newSettings)
      }
    } catch (err) {
      console.error('[scheduler] Failed to refresh settings:', err)
    }
  }, 5 * 60 * 1000)
}
