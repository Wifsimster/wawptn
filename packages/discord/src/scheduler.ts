import cron, { type ScheduledTask } from 'node-cron'
import { EmbedBuilder, type Client, type TextChannel } from 'discord.js'
import { getLinkedChannels, getBotSettings, type BotSettings } from './lib/api.js'
import { getTodayPersona, getDefaultPersona } from './personas.js'

// ─── State ────────────────────────────────────────────────────────────────────

let currentSettings: BotSettings | null = null
let fridayTask: ScheduledTask | null = null
let weekdayTask: ScheduledTask | null = null

function getPersona() {
  if (currentSettings && !currentSettings.persona_rotation_enabled) {
    return getDefaultPersona()
  }
  return getTodayPersona()
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

async function sendToLinkedChannels(client: Client, pool: string[]): Promise<void> {
  try {
    const channels = await getLinkedChannels()

    if (channels.length === 0) {
      console.log('[scheduler] No linked channels found, skipping')
      return
    }

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

function scheduleCrons(client: Client, settings: BotSettings): void {
  // Stop existing tasks
  fridayTask?.stop()
  weekdayTask?.stop()

  const timezone = settings.schedule_timezone || 'Europe/Paris'

  // Friday reminder
  if (cron.validate(settings.friday_schedule)) {
    fridayTask = cron.schedule(settings.friday_schedule, () => {
      const persona = getPersona()
      console.log(`[scheduler] Friday reminder triggered with persona: ${persona.name}`)
      const jitterMs = Math.floor(Math.random() * 15 * 60 * 1000)
      console.log(`[scheduler] Sending in ${Math.round(jitterMs / 1000)}s`)
      setTimeout(() => sendToLinkedChannels(client, persona.fridayMessages), jitterMs)
    }, { timezone })
    console.log(`[scheduler] Friday reminder: ${settings.friday_schedule} (${timezone})`)
  } else {
    console.error(`[scheduler] Invalid friday cron: ${settings.friday_schedule}`)
  }

  // Weekday reminder
  if (cron.validate(settings.wednesday_schedule)) {
    weekdayTask = cron.schedule(settings.wednesday_schedule, () => {
      const persona = getPersona()
      console.log(`[scheduler] Weekday nudge triggered with persona: ${persona.name}`)
      const jitterMs = Math.floor(Math.random() * 15 * 60 * 1000)
      console.log(`[scheduler] Sending in ${Math.round(jitterMs / 1000)}s`)
      setTimeout(() => sendToLinkedChannels(client, persona.weekdayMessages), jitterMs)
    }, { timezone })
    console.log(`[scheduler] Weekday reminder: ${settings.wednesday_schedule} (${timezone})`)
  } else {
    console.error(`[scheduler] Invalid weekday cron: ${settings.wednesday_schedule}`)
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function startScheduler(client: Client): Promise<void> {
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
        newSettings.schedule_timezone !== currentSettings!.schedule_timezone

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
