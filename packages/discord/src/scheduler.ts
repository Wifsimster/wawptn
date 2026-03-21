import cron from 'node-cron'
import { EmbedBuilder, type Client, type TextChannel } from 'discord.js'
import { getLinkedChannels } from './lib/api.js'
import { getTodayPersona } from './personas.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pickRandom(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)]!
}

function buildReminderEmbed(message: string): EmbedBuilder {
  const persona = getTodayPersona()
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
  const persona = getTodayPersona()
  console.log(`[persona] Today's persona: ${persona.name} (${persona.id})`)
  await sendToLinkedChannels(client, persona.backOnlineMessages)
}

// ─── Cron jobs ────────────────────────────────────────────────────────────────

export function startScheduler(client: Client): void {
  // Friday at 21:00 Europe/Paris with random 0-15 min jitter
  cron.schedule('0 21 * * 5', () => {
    const persona = getTodayPersona()
    console.log(`[scheduler] Friday reminder triggered with persona: ${persona.name}`)
    const jitterMs = Math.floor(Math.random() * 15 * 60 * 1000)
    console.log(`[scheduler] Sending in ${Math.round(jitterMs / 1000)}s`)
    setTimeout(() => sendToLinkedChannels(client, persona.fridayMessages), jitterMs)
  }, { timezone: 'Europe/Paris' })

  // Wednesday at 17:00 Europe/Paris (weekday nudge)
  cron.schedule('0 17 * * 3', () => {
    const persona = getTodayPersona()
    console.log(`[scheduler] Weekday nudge triggered with persona: ${persona.name}`)
    const jitterMs = Math.floor(Math.random() * 15 * 60 * 1000)
    console.log(`[scheduler] Sending in ${Math.round(jitterMs / 1000)}s`)
    setTimeout(() => sendToLinkedChannels(client, persona.weekdayMessages), jitterMs)
  }, { timezone: 'Europe/Paris' })

  console.log('[scheduler] Scheduled reminders: Friday 21:00 + Wednesday 17:00 (Europe/Paris)')
}
