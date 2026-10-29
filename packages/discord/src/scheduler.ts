import cron, { type ScheduledTask } from 'node-cron'
import { EmbedBuilder, type Client, type TextChannel } from 'discord.js'
import {
  getLinkedChannels,
  getBotSettings,
  getGuildSettings,
  type BotSettings,
  type LinkedChannel,
} from './lib/api.js'
import {
  getTodayPersona,
  getTodayPersonaForGroup,
  getDefaultPersona,
  getPersonaById,
  loadPersonasFromApi,
  startPersonaCacheRefresh,
} from './personas.js'

let currentSettings: BotSettings | null = null
let personaAnnounceTask: ScheduledTask | null = null
let dailyPulseTask: ScheduledTask | null = null

interface GuildReminderTasks {
  friday: ScheduledTask | null
  weekday: ScheduledTask | null
}
const guildTasks = new Map<string | null, GuildReminderTasks>()

function getPersona() {
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

function getPersonaForChannel(channel: LinkedChannel) {
  const globalOverride = currentSettings?.persona_override || null
  const expiresAt = channel.personaSettings.overrideExpiresAt
  const groupOverrideExpired =
    expiresAt != null && new Date(expiresAt).getTime() < Date.now()
  const groupOverride = groupOverrideExpired
    ? null
    : channel.personaSettings.personaOverride || null
  const effectiveOverride = groupOverride ?? globalOverride
  if (effectiveOverride) {
    const forced = getPersonaById(effectiveOverride)
    if (forced) return forced
  }

  const rotationEnabled =
    channel.personaSettings.rotationEnabled ??
    currentSettings?.persona_rotation_enabled ??
    true
  if (!rotationEnabled) {
    return getDefaultPersona()
  }

  const disabled = new Set<string>([
    ...(currentSettings?.disabled_personas ?? []),
    ...(channel.personaSettings.disabledPersonas ?? []),
  ])
  return getTodayPersonaForGroup(channel.groupId, {
    disabledIds: Array.from(disabled),
    rotationEnabled: true,
  })
}

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

function buildReminderEmbedForChannel(
  channel: LinkedChannel,
  message: string,
): EmbedBuilder {
  const persona = getPersonaForChannel(channel)
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

    for (const channel of channels) {
      try {
        const persona = getPersonaForChannel(channel)
        const embed = new EmbedBuilder()
          .setDescription(persona.introMessage)
          .setColor(persona.embedColor)
          .setFooter({ text: `WAWPTN — Persona du jour : ${persona.name}` })
        const dchannel = await client.channels.fetch(channel.channelId)
        if (dchannel?.isTextBased()) {
          await (dchannel as TextChannel).send({ embeds: [embed] })
          console.log(
            `[scheduler] Sent persona announcement to channel ${channel.channelId} (${channel.groupName}) — persona: ${persona.name}`,
          )
        }
      } catch (err) {
        console.error(
          `[scheduler] Failed to send persona announcement to channel ${channel.channelId} (${channel.groupName}):`,
          err,
        )
      }
    }
  } catch (err) {
    console.error('[scheduler] Failed to send persona announcement:', err)
  }
}

type ReminderPool = 'friday' | 'weekday' | 'backOnline' | 'morning' | 'weekend'

function resolvePool(persona: ReturnType<typeof getPersonaForChannel>, kind: ReminderPool): string[] {
  switch (kind) {
    case 'friday': return persona.fridayMessages
    case 'weekday': return persona.weekdayMessages
    case 'backOnline': return persona.backOnlineMessages
    case 'morning': return persona.morningGreetings
    case 'weekend': return persona.weekendVibes
  }
}

function selectReminderMessage(channel: LinkedChannel, kind: ReminderPool): string | null {
  const persona = getPersonaForChannel(channel)

  if ((kind === 'friday' || kind === 'weekday') && persona.idleBanter.length > 0) {
    const rate = Math.max(0, Math.min(1, persona.offTopicInjectionRate))
    if (Math.random() < rate) {
      return pickRandom(persona.idleBanter)
    }
  }

  const pool = resolvePool(persona, kind)
  if (!Array.isArray(pool) || pool.length === 0) return null
  return pickRandom(pool)
}

async function sendToChannels(
  client: Client,
  channels: LinkedChannel[],
  kind: ReminderPool,
): Promise<void> {
  if (channels.length === 0) return

  for (const channel of channels) {
    try {
      const message = selectReminderMessage(channel, kind)
      if (!message) {
        console.warn(
          `[scheduler] No ${kind} message available for channel ${channel.channelId} (${channel.groupName})`,
        )
        continue
      }
      const embed = buildReminderEmbedForChannel(channel, message)
      const dchannel = await client.channels.fetch(channel.channelId)
      if (dchannel?.isTextBased()) {
        await (dchannel as TextChannel).send({ embeds: [embed] })
        console.log(
          `[scheduler] Sent ${kind} reminder to channel ${channel.channelId} (${channel.groupName})`,
        )
      }
    } catch (err) {
      console.error(
        `[scheduler] Failed to send ${kind} reminder to channel ${channel.channelId} (${channel.groupName}):`,
        err,
      )
    }
  }
}

async function sendToLinkedChannels(client: Client, kind: ReminderPool): Promise<void> {
  try {
    const channels = await getLinkedChannels()
    await sendToChannels(client, channels, kind)
  } catch (err) {
    console.error('[scheduler] Failed to fetch linked channels:', err)
  }
}

export async function triggerReminder(
  client: Client,
  channelId: string,
  kind: 'friday' | 'weekday',
): Promise<{ personaName: string; message: string }> {
  const linked = await getLinkedChannels()
  const channelInfo = linked.find((c) => c.channelId === channelId)

  const persona = channelInfo ? getPersonaForChannel(channelInfo) : getPersona()
  const pool = kind === 'friday' ? persona.fridayMessages : persona.weekdayMessages

  if (!Array.isArray(pool) || pool.length === 0) {
    throw new Error(
      `La persona « ${persona.name} » ne contient pas de message ${kind === 'friday' ? 'vendredi' : 'semaine'}.`,
    )
  }

  const message = pickRandom(pool)
  const embed = channelInfo
    ? buildReminderEmbedForChannel(channelInfo, message)
    : buildReminderEmbed(message)

  const channel = await client.channels.fetch(channelId)
  if (!channel || !channel.isTextBased()) {
    throw new Error('Ce canal ne peut pas recevoir de messages texte.')
  }

  await (channel as TextChannel).send({ embeds: [embed] })
  console.log(
    `[scheduler] Manual ${kind} reminder sent to channel ${channelId} (persona: ${persona.name})`,
  )

  return { personaName: persona.name, message }
}

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
        console.log(
          `[scheduler] Friday reminder triggered for guild ${guildKey ?? '<legacy>'} — ${channels.length} channel(s), per-group personas`,
        )
        const jitterMs = Math.floor(Math.random() * 15 * 60 * 1000)
        setTimeout(() => sendToChannels(client, channels, 'friday'), jitterMs)
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
        console.log(
          `[scheduler] Weekday reminder triggered for guild ${guildKey ?? '<legacy>'} — ${channels.length} channel(s), per-group personas`,
        )
        const jitterMs = Math.floor(Math.random() * 15 * 60 * 1000)
        setTimeout(() => sendToChannels(client, channels, 'weekday'), jitterMs)
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
  let channels: LinkedChannel[] = []
  try {
    channels = await getLinkedChannels()
  } catch (err) {
    console.error('[scheduler] Failed to fetch linked channels — keeping existing tasks alive:', err)
    return
  }

  if (channels.length === 0) {
    console.log('[scheduler] No linked channels found — clearing reminder schedule')
    stopAllGuildTasks()
    return
  }

  const byGuild = new Map<string | null, LinkedChannel[]>()
  for (const channel of channels) {
    const key = channel.guildId ?? null
    const bucket = byGuild.get(key)
    if (bucket) bucket.push(channel)
    else byGuild.set(key, [channel])
  }

  interface ResolvedGuild {
    key: string | null
    channels: LinkedChannel[]
    friday: string
    weekday: string
    timezone: string
  }
  const resolved: ResolvedGuild[] = []
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

    resolved.push({ key: guildKey, channels: guildChannels, friday, weekday, timezone })
  }

  stopAllGuildTasks()
  for (const { key, channels: guildChannels, friday, weekday, timezone } of resolved) {
    scheduleGuildReminders(client, key, guildChannels, friday, weekday, timezone)
  }
  console.log(
    `[scheduler] Reminder schedule rebuilt: ${guildTasks.size} guild(s), ${channels.length} linked channel(s)`,
  )
}

function scheduleCrons(client: Client, settings: BotSettings): void {
  rebuildGuildCrons(client, settings).catch((err) => {
    console.error('[scheduler] rebuildGuildCrons failed:', err)
  })

  personaAnnounceTask?.stop()
  const timezone = settings.schedule_timezone || 'Europe/Paris'
  if (settings.announce_persona_change && settings.persona_rotation_enabled) {
    personaAnnounceTask = cron.schedule(
      '0 7 * * *',
      () => {
        console.log('[scheduler] 07:00 persona announcement triggered')
        void sendPersonaAnnouncement(client)
      },
      { timezone },
    )
    console.log(`[scheduler] Persona announcement: 0 7 * * * (${timezone})`)
  } else {
    personaAnnounceTask = null
    console.log('[scheduler] Persona announcement: disabled')
  }

  dailyPulseTask?.stop()
  if (settings.daily_pulse_enabled) {
    dailyPulseTask = cron.schedule(
      '0 10 * * *',
      () => {
        const kind = resolveDailyPulseKind(timezone)
        console.log(`[scheduler] Daily pulse (${kind}) triggered`)
        const jitterMs = Math.floor(Math.random() * 10 * 60 * 1000)
        setTimeout(() => void sendToLinkedChannels(client, kind), jitterMs)
      },
      { timezone },
    )
    console.log(`[scheduler] Daily pulse: 0 10 * * * (${timezone})`)
  } else {
    dailyPulseTask = null
    console.log('[scheduler] Daily pulse: disabled')
  }
}

function resolveDailyPulseKind(timezone: string): 'morning' | 'weekend' {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' })
    .format(new Date())
    .toLowerCase()
  return weekday === 'sat' || weekday === 'sun' ? 'weekend' : 'morning'
}

export async function startScheduler(client: Client): Promise<void> {
  await loadPersonasFromApi()
  startPersonaCacheRefresh()

  currentSettings = await getBotSettings()
  console.log(`[scheduler] Loaded settings: persona_rotation=${currentSettings.persona_rotation_enabled}`)

  scheduleCrons(client, currentSettings)

  setInterval(async () => {
    try {
      const newSettings = await getBotSettings()
      const globalChanged =
        newSettings.friday_schedule !== currentSettings!.friday_schedule ||
        newSettings.wednesday_schedule !== currentSettings!.wednesday_schedule ||
        newSettings.schedule_timezone !== currentSettings!.schedule_timezone ||
        newSettings.announce_persona_change !== currentSettings!.announce_persona_change ||
        newSettings.persona_rotation_enabled !== currentSettings!.persona_rotation_enabled ||
        newSettings.daily_pulse_enabled !== currentSettings!.daily_pulse_enabled

      currentSettings = newSettings

      if (globalChanged) {
        console.log('[scheduler] Global settings changed, rescheduling crons')
        scheduleCrons(client, newSettings)
      } else {
        rebuildGuildCrons(client, newSettings).catch((err) => {
          console.error('[scheduler] Periodic rebuildGuildCrons failed:', err)
        })
      }
    } catch (err) {
      console.error('[scheduler] Failed to refresh settings:', err)
    }
  }, 5 * 60 * 1000)
}
