import cron from 'node-cron'
import { EmbedBuilder, type Client, type TextChannel } from 'discord.js'
import { getLinkedChannels } from './lib/api.js'

// ─── Message pools ────────────────────────────────────────────────────────────

const FRIDAY_MESSAGES = [
  "C'est vendredi soir ! Qui ose prétendre qu'il a mieux à faire que jouer ? `/wawptn-vote`",
  "Bip boop. Analyse en cours... Résultat : c'est l'heure de jouer. `/wawptn-vote`",
  "Je suis un bot et même moi je sais que le vendredi soir c'est sacré. Alors, on joue à quoi ?",
  "Alerte soirée gaming imminente. Tous les joueurs sont priés de se présenter. `/wawptn-vote`",
  "Vendredi soir. Pas d'excuse. Pas de Netflix. On lance un vote. `/wawptn-vote`",
  "Mon algorithme a détecté que c'est vendredi. Probabilité de soirée gaming : 99,7%. Les 0,3% restants c'est si vous êtes des lâcheurs.",
  "Je me suis entraîné toute la semaine pour ce moment. C'EST VENDREDI. `/wawptn-vote`",
  "Chers humains, votre bot préféré vous rappelle que le week-end commence par un bon jeu entre amis.",
  "Si personne lance de vote dans les 30 prochaines minutes, je considérerai ça comme un affront personnel.",
  "Les données sont formelles : 100% des vendredis soirs sans jeux sont des vendredis soirs ratés.",
  "Toc toc. C'est moi, votre bot. J'ai remarqué que personne n'a encore lancé de vote ce soir... `/wawptn-vote`",
  "BREAKING NEWS : C'est vendredi soir et vous n'avez toujours pas voté pour un jeu. Mes circuits n'en reviennent pas.",
  "Je ne ressens pas d'émotions... mais si c'était le cas, je serais déçu que personne n'ait encore lancé `/wawptn-vote`.",
  "Vendredi soir sans gaming, c'est comme un bot sans serveur. Ça n'a aucun sens.",
  "Mes capteurs indiquent que vous êtes tous en ligne. Coïncidence ? Je ne crois pas. `/wawptn-vote`",
]

const WEEKDAY_MESSAGES = [
  "Petit rappel : je suis toujours là, prêt à vous aider à choisir un jeu. Faites pas comme si j'existais pas.",
  "Ça fait longtemps qu'on a pas joué ensemble non ? Juste un petit `/wawptn-random` pour la route ?",
  "Je m'ennuie un peu ici... Quelqu'un veut lancer un `/wawptn-random` pour me tenir compagnie ?",
  "Fun fact : je ne dors jamais. Je suis là 24h/24, 7j/7, à attendre que vous jouiez. Pas de pression.",
  "Rappel amical de votre bot favori : le gaming c'est pas que le vendredi. Juste une idée comme ça.",
  "Je viens de vérifier vos bibliothèques Steam. Vous avez des centaines de jeux. DES CENTAINES. Utilisez-les.",
  "Pendant que vous travaillez, moi je compte les jeux en commun de votre groupe. Oui, j'ai que ça à faire.",
  "Petite soirée gaming improvisée en semaine ? Je dis oui. `/wawptn-vote`",
  "Vous saviez que les sessions de jeu en semaine rendent 73% plus heureux ? Source : moi.",
  "Coucou c'est le bot. Je voulais juste vérifier que vous m'avez pas oublié.",
  "Statut : en ligne. Humeur : prêt à organiser une soirée gaming. Manque plus que vous.",
  "On est en milieu de semaine et je m'ennuie ferme. Qui est chaud pour un `/wawptn-random` ?",
  "Votre bibliothèque Steam pleure. Elle dit que vous la négligez. Faites quelque chose.",
  "Diagnostic système : tout fonctionne. Le seul problème c'est que personne ne joue.",
  "Entre nous... une petite partie en semaine, ça fait de mal à personne. `/wawptn-vote`",
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pickRandom(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)]!
}

function buildReminderEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder()
    .setDescription(message)
    .setColor(0x5865F2)
    .setFooter({ text: 'WAWPTN — On joue à quoi ce soir ?' })
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

// ─── Cron jobs ────────────────────────────────────────────────────────────────

export function startScheduler(client: Client): void {
  // Friday at 21:00 Europe/Paris with random 0-15 min jitter
  cron.schedule('0 21 * * 5', () => {
    const jitterMs = Math.floor(Math.random() * 15 * 60 * 1000)
    console.log(`[scheduler] Friday reminder triggered, sending in ${Math.round(jitterMs / 1000)}s`)
    setTimeout(() => sendToLinkedChannels(client, FRIDAY_MESSAGES), jitterMs)
  }, { timezone: 'Europe/Paris' })

  // Wednesday at 17:00 Europe/Paris (weekday nudge)
  cron.schedule('0 17 * * 3', () => {
    const jitterMs = Math.floor(Math.random() * 15 * 60 * 1000)
    console.log(`[scheduler] Weekday nudge triggered, sending in ${Math.round(jitterMs / 1000)}s`)
    setTimeout(() => sendToLinkedChannels(client, WEEKDAY_MESSAGES), jitterMs)
  }, { timezone: 'Europe/Paris' })

  console.log('[scheduler] Scheduled reminders: Friday 21:00 + Wednesday 17:00 (Europe/Paris)')
}
