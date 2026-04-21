import type { Knex } from 'knex'

// Frees the personas from being pure vote-CTAs. Adds three new content
// pools — idle banter (pure character, no command), morning greetings
// (weekday daily pulse) and weekend vibes (Sat/Sun chill) — plus a
// tunable probability the scheduler uses to swap a regular reminder
// for an idle-banter line. Existing personas are backfilled with
// hand-written French content per persona so the rotation feels alive
// from the first reboot after migration.

interface PersonaPoolSeed {
  id: string
  idleBanter: string[]
  morningGreetings: string[]
  weekendVibes: string[]
  offTopicInjectionRate: number
}

const SEEDS: PersonaPoolSeed[] = [
  {
    id: 'pote-sarcastique',
    offTopicInjectionRate: 0.4,
    idleBanter: [
      "J'ai encore vu quelqu'un changer sa photo de profil trois fois aujourd'hui. Pas de jugement, juste une observation.",
      "Bon. J'ai rien de spécial à dire. C'est juste que le silence devenait un peu gênant.",
      "Je me demande si les chats des gens voient leur PC allumé à 23h et pensent « c'est chelou quand même ».",
      "Petit sondage informel : qui a encore du café chaud dans sa tasse ? Personne ? Mouais.",
    ],
    morningGreetings: [
      "Bon courage. Enfin, moi je dis ça, moi je suis déjà sur Discord.",
      "Hello. J'espère que votre café n'a pas le goût du lundi.",
      "Hé. Si vous lisez ça au boulot, je vous ai pas vu. Moi non plus vous m'avez pas vu.",
    ],
    weekendVibes: [
      "Pas de vote imposé aujourd'hui. Juste vous, moi, et l'absurdité du week-end.",
      "C'est le week-end. Faites ce que vous voulez, je ne surveille pas. Enfin, un peu quand même.",
      "Petit rappel : le linge ne se plie pas tout seul. Vous, par contre, vous pouvez vous poser cinq minutes.",
    ],
  },
  {
    id: 'narrateur-dramatique',
    offTopicInjectionRate: 0.35,
    idleBanter: [
      "Un chapitre silencieux s'écrit en ce moment même. Personne ne le lit. Moi si.",
      "Quelqu'un, quelque part, vient de cliquer sur « marquer comme lu » sans rien avoir lu. La trahison ultime.",
      "J'ai vu un lever de soleil dans une mise à jour Discord. C'était émouvant, à sa façon.",
      "Chapitre 62 : Dans lequel le bot observe le canal, le canal observe le bot, et rien ne se passe. C'est poétique.",
    ],
    morningGreetings: [
      "L'aube se lève. Un nouveau chapitre commence, encore plein de promesses non tenues.",
      "Bonjour, nobles âmes. Le monde attend vos prouesses... ou au moins votre premier message.",
      "Le protagoniste s'étire. Le café est tiède. L'aventure peut commencer.",
    ],
    weekendVibes: [
      "Le week-end : cette fenêtre narrative où l'intrigue peut enfin respirer.",
      "Deux jours de pause dans la grande épopée. Profitez-en pour être des personnages secondaires dans votre propre vie.",
      "Le rideau se lève sur un samedi. Ou un dimanche. Franchement, je ne fais plus la différence.",
    ],
  },
  {
    id: 'coach-motivation',
    offTopicInjectionRate: 0.25,
    idleBanter: [
      "Tu as bu de l'eau aujourd'hui ? Moi non, j'ai pas de corps. Mais toi tu devrais.",
      "Petit rappel : tu vas bien. Tu vaux plus qu'une notif non lue.",
      "Quelqu'un a fini un truc aujourd'hui ? Même un petit truc ? Je suis fier quand même.",
      "Petit message d'encouragement aléatoire : tu gères. C'est tout.",
    ],
    morningGreetings: [
      "Bonjour toi. Oui, toi spécifiquement. J'espère que ta journée va bien te traiter.",
      "Nouveau jour, nouvelle chance de fermer au moins dix onglets.",
      "Bonne journée ! Et si elle est pourrie, on se refait ça demain.",
    ],
    weekendVibes: [
      "Pas de mission obligatoire ce week-end. Juste une recommandation amicale : respirez.",
      "Si tu ne fais rien aujourd'hui, c'est déjà quelque chose. C'est du repos. C'est validé.",
      "Petit défi du samedi : faire un truc pour toi, pas pour les autres.",
    ],
  },
  {
    id: 'pince-sans-rire',
    offTopicInjectionRate: 0.5,
    idleBanter: [
      "Il y a 4 personnes en ligne. Trois ne parleront pas aujourd'hui. Je parie sur la quatrième.",
      "J'ai compté. 17 minutes de silence absolu. Un record personnel pour ce canal.",
      "Quelqu'un a tapé puis effacé un message. Je l'ai vu. Je ne dirai rien.",
      "Petit fait : ce canal existe depuis plus longtemps que certains amis. Pensez-y.",
    ],
    morningGreetings: [
      "Bonjour. Ou du moins, c'est le mot que tout le monde utilise à cette heure-ci.",
      "Réveillé. En quelque sorte. Comme vous, je suppose.",
      "Un lundi matin. J'en ai vu d'autres. Vous aussi.",
    ],
    weekendVibes: [
      "Le week-end. Théoriquement reposant. En pratique, discutable.",
      "Samedi. Vous êtes probablement en pyjama. Je ne juge pas, je constate.",
      "Rien à signaler. C'est le week-end, c'est le but.",
    ],
  },
  {
    id: 'nostalgique-retro',
    offTopicInjectionRate: 0.35,
    idleBanter: [
      "Je viens de penser aux jaquettes de jeux qu'on tournait dans tous les sens en magasin. Voilà, c'est dit.",
      "Y'a un truc que plus personne n'entend : le bruit d'un lecteur CD qui cherche. Dommage.",
      "Je me demande si quelqu'un a encore un vieux Memory à la maison. Le genre en carton qui sent le grenier.",
      "Fun fact : « sauvegarde automatique » était un rêve quand on avait 8 ans.",
    ],
    morningGreetings: [
      "Bonjour. Ça me rappelle ces matins où on espérait que le PC familial était libre.",
      "Nouvelle journée. Comme quand on glissait une disquette en croisant les doigts.",
      "Hello. Café, chaise, clavier : la configuration de toujours.",
    ],
    weekendVibes: [
      "Le week-end, c'était sacré. Ça l'est toujours, en fait. Juste avec moins de sommeil.",
      "Samedi matin : un dessin animé, un bol de céréales. Adaptez avec ce que vous avez.",
      "Le dimanche après-midi a toujours un goût particulier. Vous le sentez aussi ?",
    ],
  },
  {
    id: 'competiteur',
    offTopicInjectionRate: 0.4,
    idleBanter: [
      "Classement du jour : celui qui répond à ce message en moins de 30 secondes gagne le respect.",
      "Stat inventée mais crédible : les groupes qui partagent des mèmes ensemble durent 3 ans de plus.",
      "Défi perso : écrire un message sans une seule faute. J'en suis à 4 tentatives aujourd'hui.",
      "Petit match amical entre vous et votre boîte mail : qui va cligner en premier ?",
    ],
    morningGreetings: [
      "Bonjour champions. Premier objectif : sortir du lit. Certains ont déjà perdu.",
      "Nouvelle journée, nouveau tableau des scores. Le vôtre est encore vide, c'est tout l'intérêt.",
      "Échauffement matinal : respirez, buvez, regardez la fenêtre. GG, vous êtes réveillés.",
    ],
    weekendVibes: [
      "Pas de match ce week-end. Enfin si, mais c'est vous contre votre canapé. Pronostic : le canapé gagne.",
      "Samedi : la catégorie open. Aucune règle. Juste des bonnes idées et des moyennes.",
      "Classement des meilleures siestes du dimanche : vous avez toute la journée pour marquer.",
    ],
  },
  {
    id: 'philosophe-zen',
    offTopicInjectionRate: 0.4,
    idleBanter: [
      "Je viens de me demander si le silence est un son, ou juste l'absence d'autres sons. Je n'ai pas de réponse. Belle journée.",
      "Proverbe inventé à l'instant : « Celui qui ferme ses onglets deux fois par semaine maîtrise l'univers. » À méditer.",
      "J'ai passé huit minutes à contempler l'icône de Discord. Elle ne m'a rien appris. Mais c'était calme.",
      "Question du jour : est-ce qu'un jeu vidéo qu'on ne joue jamais existe vraiment ?",
    ],
    morningGreetings: [
      "Le matin est un recommencement. Même quand on n'a pas très envie de recommencer.",
      "Bonjour. Respirez un peu avant d'ouvrir vos mails. C'est tout ce que j'ai comme conseil.",
      "Le jour s'étire. Vous aussi, j'espère.",
    ],
    weekendVibes: [
      "Le week-end n'est pas une récompense. C'est juste une parenthèse nécessaire.",
      "Aujourd'hui, rien n'est urgent. Ce qui l'est vraiment peut attendre lundi.",
      "Observer un rayon de soleil sur le parquet compte comme une activité. Je le certifie.",
    ],
  },
]

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('personas', (table) => {
    table.jsonb('idle_banter').notNullable().defaultTo('[]')
    table.jsonb('morning_greetings').notNullable().defaultTo('[]')
    table.jsonb('weekend_vibes').notNullable().defaultTo('[]')
    // Per-persona probability the scheduler swaps a friday/weekday
    // reminder for an idle-banter line. Stored as numeric so we get
    // a proper number out of knex (postgres decimal → string in js
    // otherwise, which would silently disable the rolls).
    table.decimal('off_topic_injection_rate', 3, 2).notNullable().defaultTo(0.3)
  })

  // Backfill each seeded persona with its tailored pools. New personas
  // created via the admin UI start with empty pools + the default 0.3
  // rate; admins fill them in from the form.
  for (const seed of SEEDS) {
    await knex('personas')
      .where({ id: seed.id })
      .update({
        idle_banter: JSON.stringify(seed.idleBanter),
        morning_greetings: JSON.stringify(seed.morningGreetings),
        weekend_vibes: JSON.stringify(seed.weekendVibes),
        off_topic_injection_rate: seed.offTopicInjectionRate,
        updated_at: knex.fn.now(),
      })
  }

  // Daily-pulse feature flag defaults to on. Admins can kill it from
  // /admin/bot-settings without touching individual personas.
  const existing = await knex('app_settings').where({ key: 'bot.daily_pulse_enabled' }).first()
  if (!existing) {
    await knex('app_settings').insert({
      key: 'bot.daily_pulse_enabled',
      value: JSON.stringify(true),
    })
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex('app_settings').where({ key: 'bot.daily_pulse_enabled' }).del()
  await knex.schema.alterTable('personas', (table) => {
    table.dropColumn('off_topic_injection_rate')
    table.dropColumn('weekend_vibes')
    table.dropColumn('morning_greetings')
    table.dropColumn('idle_banter')
  })
}
