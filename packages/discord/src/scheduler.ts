import cron from 'node-cron'
import { EmbedBuilder, type Client, type TextChannel } from 'discord.js'
import { getLinkedChannels } from './lib/api.js'

// ─── Message pools ────────────────────────────────────────────────────────────

// Voix du bot : pote sarcastique et bienveillant, français décontracté.
// Pas de référence robot/algorithme/capteurs. Pas de jargon gamer anglicisé.
// Voir aussi : packages/backend/src/infrastructure/llm/client.ts (SYSTEM_PROMPT)

const FRIDAY_MESSAGES = [
  "C'est vendredi soir ! Qui ose prétendre qu'il a mieux à faire ? `/wawptn-vote`",
  "Vendredi soir. Pas d'excuse. Pas de Netflix. On lance un vote. `/wawptn-vote`",
  "J'ai attendu toute la semaine pour ce moment. C'EST VENDREDI. `/wawptn-vote`",
  "Si personne lance de vote dans les 30 prochaines minutes, je considérerai ça comme un affront personnel.",
  "Bon, c'est vendredi, vous êtes tous connectés et personne propose rien ? Sérieusement ? `/wawptn-vote`",
  "Le week-end commence maintenant. Premier arrivé lance le `/wawptn-vote`, les autres suivent.",
  "Vendredi soir sans soirée entre potes, c'est un vendredi gâché. Je dis ça, je dis rien. `/wawptn-vote`",
  "Toc toc. Personne a encore lancé de vote ce soir et franchement c'est décevant. `/wawptn-vote`",
  "100% des vendredis soirs sans jeu entre potes sont des vendredis soirs ratés. C'est scientifique.",
  "Allez quoi, c'est vendredi ! Qui lance le vote ? Faut tout faire soi-même ici... `/wawptn-vote`",
  "On est vendredi soir et y'a toujours pas de vote. Vous attendez quoi, lundi ? `/wawptn-vote`",
  "Rappel : le vendredi soir c'est sacré. Celui qui dit qu'il a mieux à faire, on le croit pas. `/wawptn-vote`",
  "Vous êtes tous en ligne et personne lance de vote ? Coïncidence ? Non, c'est de la flemme. `/wawptn-vote`",
  "C'est l'heure ! Celui qui lance le vote a le droit de se vanter tout le week-end. `/wawptn-vote`",
  "Dernier rappel avant que je commence à vous envoyer des messages passifs-agressifs. Ah wait. `/wawptn-vote`",
]

const WEEKDAY_MESSAGES = [
  "Ça fait longtemps qu'on a rien fait ensemble non ? Juste un petit `/wawptn-random` pour la route ?",
  "Petite soirée improvisée en semaine ? Je dis oui. `/wawptn-vote`",
  "Vous avez des centaines de jeux en commun. DES CENTAINES. Utilisez-les.",
  "Les soirées entre potes en semaine rendent 73% plus heureux. Source : la science du bon sens.",
  "On est en milieu de semaine et personne propose rien. Qui est chaud pour un `/wawptn-random` ?",
  "Votre bibliothèque de jeux pleure. Elle dit que vous la négligez. Faites quelque chose.",
  "Entre nous... une petite soirée en semaine, ça fait de mal à personne. `/wawptn-vote`",
  "Hé, vous vous souvenez qu'on peut aussi se retrouver en semaine ? Juste une idée comme ça.",
  "Petit rappel : vos jeux en commun prennent la poussière. Un `/wawptn-random` pour dépoussiérer ?",
  "Si vous attendez vendredi pour jouer ensemble, vous perdez 4 jours par semaine. Réfléchissez-y.",
  "Soirée improvisée ce soir ? Le premier qui dit oui déclenche la réaction en chaîne. `/wawptn-vote`",
  "Je regarde votre liste de jeux en commun et franchement y'a de quoi faire. Bougez-vous.",
  "Personne se manifeste depuis un moment. Vous êtes vivants au moins ? `/wawptn-random`",
  "Ça vous dit pas un petit jeu vite fait ce soir ? Même une heure, c'est mieux que rien.",
  "La semaine est longue, mais une soirée entre potes ça passe vite. `/wawptn-vote`",
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

// ─── Back online notification ─────────────────────────────────────────────────

const BACK_ONLINE_MESSAGES = [
  "C'est bon, je suis de retour ! Vous m'avez manqué... ou pas. `/wawptn-vote`",
  "Me revoilà ! Qu'est-ce que j'ai raté ? Ah oui, rien, comme d'hab.",
  "Mise à jour terminée, je suis de nouveau opérationnel. Qui est chaud ce soir ? `/wawptn-vote`",
  "Désolé pour l'absence, j'avais des trucs à régler. On reprend où on en était ?",
  "Je suis de retour et en pleine forme. Quelqu'un pour un `/wawptn-random` ?",
  "Hop, je suis là ! Vous avez essayé de jouer sans moi ? Mauvaise idée.",
  "Redémarrage terminé. Bon, on fait quoi ce soir du coup ? `/wawptn-vote`",
  "Me revoilà les amis ! J'espère que personne a lancé de vote sans moi.",
]

export async function notifyBackOnline(client: Client): Promise<void> {
  await sendToLinkedChannels(client, BACK_ONLINE_MESSAGES)
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
