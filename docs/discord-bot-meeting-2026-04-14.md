# Réunion produit — Amélioration des commandes du bot Discord

**Date :** 2026-04-14
**Branche :** `claude/discord-bot-features-meeting-Im9Mv`
**Format :** Réunion multi-personas (5 profils) passant en revue `packages/discord/` pour proposer des améliorations ciblées aux commandes slash, aux flux d'interaction, à la voix du bot et à sa fiabilité.

## Participants

| Persona | Rôle | Angle |
|---------|------|-------|
| Sarah | Discord Community & Product Lead | Engagement, rétention, rituels, viralité |
| Marcus | Senior Discord Bot Engineer (discord.js) | Polish slash commands, affordances, permissions |
| Léo | Conversational UX Designer | Voix persona, copy, friction, états vides |
| Priya | SRE / Observabilité | Retry, webhooks, scheduler, monitoring |
| Tom | Voix du joueur (lead d'un serveur de 15 amis) | Usage réel, manques ressentis |

---

## 1. Sarah — Community & Product

**Constat :** Le bot a des fondations solides (vote, stats, personas) mais reste **réactif plutôt qu'actif** : les joueurs attendent vendredi/mercredi pour être touchés. Aucun hook de rétention entre les rappels cron. Le défi quotidien existe mais se limite à « première personne gagne » sans trace, progression, ou moment viral.

1. **Leaderboard personnel et streaks visibles** — `/wawptn-stats` affiche le top du groupe mais pas votre rang, votre meilleure séquence ou votre progression hebdo. Ajouter `/wawptn-stats me` (ou sous-commande) qui montre : votre classement actuel, votre streak, vos votes lancés vs. reçus. Nouveau endpoint `GET /api/discord/stats?userId=...` + embed personnel dans `embeds.ts`. *Impact: H / Effort: M.*
2. **Récompense visuelle du défi quotidien avec collecte** — `daily-challenge.ts:179` dit « tu es 1er » mais ne persiste rien. Créer un système de badges : chaque claim ajoute une réaction emoji sur le message + un compteur « défis de la semaine : 3/7 » dans le stats embed. Sensation de collection. *Impact: H / Effort: M.*
3. **Célébration du vainqueur avec mention des « votants justes »** — Quand `/wawptn-vote` clôture, l'embed gagnant (`buildVoteClosedEmbed`, `embeds.ts`) ajoute un champ « 🎉 Qui a voté juste ? » listant les gens qui ont voté 👍 pour le gagnant. Moment de célébration sociale + FOMO. *Impact: M / Effort: S.*
4. **Ping ritualisé quand une session démarre** — Au lieu d'un rappel passif, le webhook « session créée » mentionne un rôle configuré par serveur (`@joueurs-wawptn`) avec un message persona-flavoured. Remplace les rappels passifs par l'urgence du moment. *Impact: M / Effort: S.*
5. **Message épinglé vivant : streaks du mois** — Après chaque vote clôturé, mettre à jour un message épinglé dans le canal : un mini-classement visuel avec 🔥 (streaks), ⚡ (nouveaux venus), 🎯 (plus actifs). Tableau de bord toujours visible. *Impact: M / Effort: M.*

**Top pick :** #1 — Les stats personnelles + streaks créent une boucle de rétention : le joueur revient regarder « ma progression », voit les autres, veut participer. ROI élevé pour l'effort.

## 2. Marcus — Discord Bot Engineering

**Constat :** Le bot est fonctionnel mais manque de polish sur plusieurs fronts discord.js : pas d'autocomplete, pas de modals là où elles aideraient, patterns defer/reply inconsistants, permissions DM non gérées. Les commandes de groupe (vote, random, stats, daily-challenge) ont aussi une UX hésitante entre réponse privée et publique.

1. **`setDMPermission(false)` manquant partout sauf `/wawptn-config`** — `setup.ts:5`, `games.ts:14`, `vote.ts:17`, `random.ts:15`, `stats.ts:6`, `daily-challenge.ts:38`, `link.ts` : toutes acceptent les DM implicitement. L'utilisateur lance `/wawptn-vote` en DM et se demande pourquoi ça bug. Une ligne par commande. *Impact: H / Effort: S.*
2. **Bouton 👎 absent du vote** — `embeds.ts:40-45` ne produit qu'un bouton « 👍 » (Success vert) par jeu. Le parseur `vote:sessionId:steamAppId:yes` prévoit `no` mais aucun bouton ne l'envoie jamais. Résultat : impossible de voter contre un jeu depuis Discord. Ajouter un second bouton Danger ou passer en select menu multi. *Impact: H / Effort: M.*
3. **Autocomplete sur `/wawptn-config set`** — Les champs `friday_schedule`, `wednesday_schedule`, `schedule_timezone` acceptent des strings libres. Discord supporte `addStringOption().setAutocomplete(true)` pour proposer des presets (« Vendredi 21h », « Samedi 19h », fuseaux IANA courants). *Impact: M / Effort: S.*
4. **Pattern defer/reply inconsistant** — `link.ts` fait `deferReply ephemeral` puis `editReply` avec embeds ; `vote.ts`, `random.ts`, `stats.ts`, `daily-challenge.ts` font `deferReply ephemeral` puis `channel.send(public)` + `editReply(private)`. L'utilisateur reçoit une confirmation privée mais doute que le message public soit parti. Normaliser : `reply({ fetchReply: true })` quand public, ephemeral seulement quand confidentiel. *Impact: M / Effort: M.*
5. **Modal pour `/wawptn-config set`** — Saisir `0 21 * * 5` en paramètre string est maladroit et sans aperçu. Un `ModalBuilder` avec `TextInputComponent` + description « ex : lundi 20h → `0 20 * * 1` » et preview en temps réel. *Impact: M / Effort: M.*

**Top pick :** #2 — Le vote actuel ne permet pas de voter « non » depuis Discord malgré le parseur qui l'attend. C'est un bug fonctionnel silencieux, pas un polish — priorité absolue.

## 3. Léo — Conversational UX

**Constat :** Les commandes partagent une voix générique dans les embeds et les réponses qui contraste drastiquement avec la richesse des 7 personas. Les états vides, les erreurs et l'onboarding ne font aucun effort pour entrer dans le personnage — ça casse l'immersion. L'ordre ephemeral → public crée aussi une friction d'incertitude.

1. **Embed copy signé par le persona du jour** — `/wawptn-vote`, `/wawptn-random`, `/wawptn-daily-challenge` envoient des embeds génériques au lieu de laisser chaque persona signer. Le Narrateur Dramatique devrait dire « *Les dés du destin roulent…* » au lieu de « Au hasard ! ». Ajouter un champ `embedTitles` + `embedDescriptions` dans `personas.ts` et les consommer dans `embeds.ts`. *Impact: H / Effort: M.*
2. **Onboarding `/wawptn-link` sans persuasion** — L'embed de `link.ts` liste 3 étapes cliniques. Devrait ouvrir avec « *Tu es à un code près de voter avec nous !* » selon le ton du persona actif. *Impact: M / Effort: S.*
3. **État vide de `/wawptn-games` sans guidance** — `games.ts:26-28` affiche « 😕 Aucun jeu en commun trouvé » sans contexte. Devrait expliquer : « *Vos bibliothèques Steam ne se croisent pas encore — reliez vos comptes sur la web app et relancez cette commande !* » + bouton « Ouvrir WAWPTN ». *Impact: M / Effort: S.*
4. **Leaderboard stats sans célébration** — `embeds.ts:135-178` affiche des rangs bruts. « 🚀 Top organisateurs » c'est plat. Le persona du jour devrait féliciter nommément le #1 dans la description (« *Chapeau bas à {user}, quatrième victoire d'affilée* »). *Impact: H / Effort: M.*
5. **Rappels scheduler sans callback au résultat précédent** — Les messages « back online » et les rappels cron ne disent jamais « *Vous avez joué à [jeu] vendredi dernier — qui remet ça ?* ». Le bot a le dernier vote clôturé en base, il faut juste l'injecter. *Impact: M / Effort: M.*

**Top pick :** #1 — Les embeds sont le point focal de chaque interaction ; les personnaliser selon le persona du jour double le sentiment d'une voix cohérente sans gros effort dev.

## 4. Priya — Fiabilité & Observabilité

**Constat :** Le bot manque de mécanismes critiques de résilience et de monitoring. Les appels API backend n'ont aucune retry, les webhooks échouent silencieusement sans traçabilité, et le scheduler risque de perdre des envois lors de redémarrages. Sans liveness endpoint ni métriques structurées, les pannes à 3h du matin resteront invisibles.

1. **Retry exponentiel sur les appels backend** — `packages/discord/src/lib/api.ts:21-32` est un `fetch` brut sans retry. Une défaillance réseau momentanée rompt toutes les commandes slash et le handler @mention. Wrapper avec retry 3 tentatives, backoff 250ms/500ms/1s, respect du `Retry-After`. *Impact: H / Effort: M.*
2. **Dead-letter + retry sur les webhooks Discord** — `packages/backend/src/infrastructure/discord/notifier.ts:16-29` avale les erreurs avec un simple `logger.warn`. Aucun retry, aucune trace des messages perdus. Ajouter une table `discord_webhook_failures` + job de retry asynchrone. *Impact: H / Effort: M.*
3. **Memory leak sur `channelCooldowns`** — `packages/discord/src/index.ts:196,210` : `Map<string, number>` qui s'agrandit à chaque canal sans jamais purger. Ajouter un TTL (suppression si `now - lastResponse > 60s`) et un cap `Math.min(size, 10_000)`. *Impact: M / Effort: S.*
4. **Logging console uniquement, pas structuré** — `packages/discord/src/scheduler.ts:80,105,163`, `index.ts:90` : `console.error` sans format. Impossible de parser en prod, impossible de corréler bot ↔ backend. Migrer vers `pino` (déjà utilisé côté backend) avec `requestId` propagé via header. *Impact: M / Effort: S.*
5. **Health check scheduler + détection de drift** — `scheduler.ts` ne reporte jamais son état. Un cron qui s'arrête est invisible. Ajouter un endpoint `/health` côté bot (petit `http.createServer`) exposant : dernier tick par job, nombre de missed fires, uptime. *Impact: H / Effort: M.*

**Top pick :** #2 — Les webhooks notifient les utilisateurs des résultats de vote : un silence sur cette voie = utilisateurs confus qui perdent confiance dans le bot. Dead-letter queue + retry exponentiel sauvent cette boucle critique.

## 5. Tom — Voix du joueur

**Constat :** Le bot est là, ça marche, mais on se retrouve à faire des choix rapidement sans vraiment voir qui est chaud pour jouer ce soir ou qui a quoi. Les rappels vendredi c'est cool, mais on perd du temps à dérouler la liste des 20+ jeux en commun pour trouver le bon. Et le vote sans contexte, c'est souvent « ok mais c'est quoi comme type de jeu ? juste nous 3 ou tout le groupe ? »

1. **Filtrer `/wawptn-games` par nombre de joueurs** — Option `min-players` / `max-players` : « je veux juste les jeux jouables à 3 ce soir ». Paul et Jean râlent : « pourquoi on voit des jeux de 12 joueurs, on peut pas les jouer ». *Impact: H / Effort: S.*
2. **Afficher qui possède chaque jeu** — `/wawptn-games` montre juste « (3/5 joueurs) ». J'aimerais savoir QUI : « Alex, Jean, Paul ont Baldur's Gate ». Ça débloque le vrai « qui va gérer le lobby ». *Impact: H / Effort: M.*
3. **`/wawptn-quick-vote` avec sous-groupe** — Option `users` pour lancer un vote pour moi + Alex + Jean sans créer un nouveau groupe WAWPTN. On est souvent 3 ou 4 pas 15, et devoir setup un groupe exprès tue la spontanéité. *Impact: H / Effort: M.*
4. **Exclure les jeux joués récemment** — `/wawptn-random` et `/wawptn-vote` avec une option `exclude-last-days 7` pour éviter de retomber 3 fois sur le même jeu. Le bot sait ce qui a gagné — qu'il s'en serve. *Impact: M / Effort: M.*
5. **`/wawptn-challenges` hebdo** — Le défi du jour c'est sympa mais isolé. Une vue « défis complétés cette semaine » avec les noms de ceux qui ont relevé : « Jean a complété 4 défis cette semaine ». Ça motive. *Impact: M / Effort: S.*

**Top pick :** #1 — Les 20+ jeux en commun tuent la vibe du vote ; filtrer par joueurs minimum c'est un game-changer mental pour décider vite.

---

## Synthèse et décisions

### Consensus inter-personas

Plusieurs idées se recoupent entre personas (signal fort) :

| Thème | Personas concernés | Idée |
|-------|-------------------|------|
| **Voix persona dans tous les embeds** | Sarah #3, Léo #1, #2, #4 | Chaque embed consomme le persona du jour |
| **Stats personnelles / streaks** | Sarah #1, Tom #5 | `/wawptn-stats me` + badges hebdo |
| **Vote 👎 manquant** | Marcus #2 | Bug silencieux, priorité absolue |
| **Fiabilité webhook** | Priya #2 | DLQ + retry, protège toute la boucle |
| **Filtrage des jeux** | Tom #1, #2, #4 | Min-players, propriétaires, exclusion récente |

### Quick wins (effort S, impact ≥ M) — à livrer en priorité

1. `setDMPermission(false)` sur toutes les commandes de canal (Marcus #1)
2. TTL + cap sur `channelCooldowns` pour fixer la fuite mémoire (Priya #3)
3. Option `min-players`/`max-players` sur `/wawptn-games` (Tom #1)
4. Copy d'état vide persona-flavoured sur `/wawptn-games` (Léo #3)
5. Copy onboarding `/wawptn-link` persona-flavoured (Léo #2)
6. Autocomplete sur les champs de `/wawptn-config set` (Marcus #3)
7. Champ « votants justes » dans l'embed de clôture de vote (Sarah #3)
8. Logging structuré via `pino` (Priya #4)

### Chantiers moyens (effort M) — sprint suivant

9. **Bouton 👎 ou select-menu sur les votes** (Marcus #2) — bug fonctionnel à corriger
10. **`/wawptn-stats me` + endpoint backend** (Sarah #1, Tom #5) — boucle de rétention
11. **Embeds personnalisés par persona** (Sarah #3 croisé avec Léo #1) — cohérence de voix
12. **Propriétaires de jeux affichés dans `/wawptn-games`** (Tom #2)
13. **Retry + dead-letter sur les webhooks backend** (Priya #2)
14. **Retry exponentiel sur les appels bot → backend** (Priya #1)
15. **Rappels scheduler avec callback au dernier vote** (Léo #5)
16. **Normalisation defer/reply ephemeral vs public** (Marcus #4)

### Chantiers plus ambitieux

17. **`/wawptn-quick-vote` avec sous-groupe ad-hoc** (Tom #3) — nécessite un concept « session éphémère » en base
18. **Gamification du défi quotidien + badges collectables** (Sarah #2)
19. **Message épinglé vivant mis à jour en continu** (Sarah #5)
20. **Health check scheduler + détection de drift** (Priya #5)
21. **Modal pour `/wawptn-config set`** (Marcus #5)

### Ordre de bataille recommandé

Le consensus invite à démarrer par la **fiabilité + bugs critiques** avant d'ajouter des features :

1. **Sprint 1 (hygiène)** — quick wins #1, #2, #6, #8 + bug vote 👎 (#9)
2. **Sprint 2 (voix & fidélisation)** — #10, #11, #7 + retry backend (#13, #14)
3. **Sprint 3 (valeur joueur)** — #3 (filter min-players), #12 (owners), #15 (callback), #4 (état vide)
4. **Backlog produit** — #17, #18, #19, #20, #21

### Points d'attention

- La **cohérence de voix persona** est le thème le plus transverse (Sarah, Léo) et mérite une passe dédiée sur `embeds.ts` + `personas.ts` plutôt qu'une retouche commande par commande.
- Le **bug du bouton 👎 manquant** (Marcus #2) est silencieux en ce sens qu'il ne lève pas d'erreur — à vérifier en priorité si l'intention produit était vraiment un vote binaire ou seulement un « j'aime ».
- Les **propositions de Tom** (#1, #2, #3) valident qu'on est trop « groupe entier, choix parmi tout » et pas assez « ce soir, nous trois, parmi une shortlist ». Une réflexion produit transversale à mener.
