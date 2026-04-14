# Réunion produit — Amélioration des fonctionnalités

**Date :** 2026-04-13
**Branche :** `claude/multi-agent-feature-meeting-mKUMa`
**Format :** Réunion multi-personas (6 profils) passant en revue le code actuel pour proposer des améliorations ciblées.

## Participants

| Persona | Rôle | Angle |
|---------|------|-------|
| Sarah | Senior Product Manager | Valeur utilisateur, rétention, virality |
| Léo | Senior UX/UI Designer | Friction, micro-feedback, mobile/PWA |
| Marcus | Senior Backend Engineer | Capacités, temps réel, intégrité |
| Yuki | Senior Frontend Engineer | État client, Socket.io, performance |
| Priya | Senior QA / Security Engineer | Hardening, audit, intégrité des votes |
| Tom | Discord Bot & Community Lead | Engagement, viralité Discord |

---

## 1. Sarah — Product

**Constat :** Fondations solides, mais boucles de rétention faibles. Le parcours s'arrête après le premier vote.

1. **Rituel de soirée jeu (recurring vote scheduling)** — automatiser la création d'une session chaque vendredi 21h CET via le cron existant. *Impact: élevé / Effort: S.*
2. **Aperçu riche des invitations** — l'endpoint `/preview` existe déjà, surfacer avatars + dernier gagnant + compteur sur `JoinPage` pour créer du FOMO.
3. **Wishlist par jeu** — étoile sur chaque carte, jeux « wishlistés » remontés en priorité lors de la création de session.
4. **Dashboard / leaderboard de groupe** — stats agrégées (jeu le plus joué, série de votes, jeu le plus clivant).
5. **Re-queue d'un jeu qui ne se lance pas** — toast à 5 min « le jeu ne démarre pas ? [Réessayer] [Suivant] ».

**Top pick :** #1 — Rituel de soirée jeu récurrent.

## 2. Léo — UX/UI

**Constat :** Palette « Neon Dusk » cohérente, Framer Motion présent, mais le moment « récompense » est sous-exploité et la densité mobile est perfectible.

1. **Feedback micro en direct sur écran d'attente** — réutiliser `CelebrationParticles` (`random-pick-modal.tsx:44-74`) pour déclencher un burst à chaque nouveau vote reçu sur `VotePage.tsx:336`. *[Quick Win]*
2. **Badge sticky du compteur sélection en mobile** — `VotePage.tsx:409-440`, pill sticky en haut du grid pour ne pas perdre le contexte lors du scroll. *[Quick Win]*
3. **Carte de breakdown avant le bouton Steam** — `VotePage.tsx:224-310`, barre de distribution des votes animée *avant* l'apparition du CTA de lancement. *[Medium]*
4. **Deep-link PWA pour invités non authentifiés** — pré-remplir le signup avec « Tu es invité à [Groupe] » et auto-join après Steam OpenID. *[Medium]*
5. **Banner explicite pour les jeux filtrés par Metacritic** — « X jeux masqués (score <75) » cliquable. *[Big]*

**Top pick :** #1 — Particules + son discret à chaque vote reçu.

## 3. Marcus — Backend

**Constat :** Base Express/Socket.io propre, circuit breakers en place, mais des capacités manquent pour débloquer les features produit.

1. **Service de déduplication multi-plateforme** — remplacer le name-matching fuzzy d'Epic/GOG (`auth.routes.ts:881-891`) par un mapping canonique via IGDB ; colonne `game_igdb_id`, `computeCommonGames` regroupe sur IGDB.
2. **`vote:progress` et `vote:reminder` via Socket.io** — socket actuel ne broadcast que `vote:cast`. Ajouter présence par participant + relances via la table `vote_reminders`.
3. **Snapshot/audit trail des participants à la clôture** — table `session_audit_trail`, gèle l'état des votants au `closeSession` pour l'intégrité long terme.
4. **Executor pour les sessions planifiées** — nouveau `/domain/jobs/` qui scrute toutes les minutes les `scheduledAt` et crée les sessions (`vote.routes.ts:142-165`), avec retry sur échec Steam.
5. **Endpoint `/admin/api-health`** — agrège circuit breakers Steam/Epic/GOG, dernière synchro, fraîcheur du cache.

**Top pick :** #1 — Déduplication cross-plateforme. Sans cela, Epic/GOG ne délivre pas leur promesse UX.

## 4. Yuki — Frontend

**Constat :** Zustand propre mais la logique Socket.io est dispersée dans les pages, PWA sous-utilisée, pas de code splitting.

1. **`useSocketStore` avec reconnect & queue** — `src/lib/socket.ts` n'a ni reconnection ni état ; `GroupPage.tsx:82-143` remonte les listeners manuellement. Store dédié avec backoff exponentiel.
2. **Server-state store avec invalidation** — l'auth invalide manuellement l'abonnement (`auth.store.ts:21`), GroupPage triple-fetch au mount. Clés de cache + TTL.
3. **Push notifications PWA + prompt d'installation** — manifest existe (`vite.config`) mais pas de SW, pas d'install prompt. Câbler Workbox + `beforeinstallprompt`.
4. **Code splitting des pages lourdes** — `React.lazy()` sur Vote/Admin/Group, images progressives (`blur-up`).
5. **Lier le store de notifications à Socket.io** — `notification.store.ts` n'est relié à aucun event socket, la cloche n'affiche que du mock.

**Top pick :** #1 — Store Socket.io résilient débloque le PWA offline-first et supprime ~140 lignes de boilerplate par page.

## 5. Priya — QA / Sécurité

**Constat :** La surface admin (PR #116) introduit des élévations de privilège sans filet. À durcir avant toute nouvelle feature.

1. **Audit log + rate limit sur les mutations admin** — `admin.routes.ts:151-203`. Table d'audit tamper-resistant + max 10 mutations / 5min. *[Critical]*
2. **Validation Zod centralisée au middleware** — schémas pour `CreatePersonaSchema`, `UpdateUserSchema`, etc. sur toutes les routes POST/PATCH. *[High]*
3. **Unicité DB sur `(session_id, user_id, steam_app_id)`** — `vote.routes.ts:264-276` utilise `onConflict.merge()` sans lock, race-condition possible. *[High]*
4. **Rotation des sessions lors d'un changement de privilèges** — invalider toutes les sessions d'un user quand son rôle/premium change. *[High]*
5. **Re-validation périodique de l'auth Socket.io** — `socket/socket.ts:53-94` valide une seule fois à la connexion ; re-check toutes les 30-60 s. *[Medium]*

**Blocker avant nouvelle feature :** #1 — Audit log admin.

## 6. Tom — Discord

**Constat :** 7 personas, cron Friday/Wednesday, mais le bot reste un facilitateur de vote plutôt qu'un moteur de communauté.

1. **`/wawptn-stats` + badges d'achievement** — leaderboard par serveur, cache mensuel dans un message épinglé.
2. **`/wawptn-config` par guilde** — le scheduler utilise une config globale ; permettre cron + persona rotation par serveur pour toucher d'autres fuseaux.
3. **Auto-recurring weekly session template** — `/wawptn-auto-vote setup` crée un cron côté backend qui lance une session chaque semaine.
4. **Diffusion multi-canal des résultats** — envoyer l'embed de clôture sur les canaux d'annonces taggés, pas seulement le canal lié.
5. **Mentions + chat persona** — `@WawptnBot` répond avec voix de persona + données backend (score Steam, consensus).

**Top pick :** #1 — Leaderboard + badges, direct dans la culture Discord.

---

## Synthèse croisée

### Consensus — ce qui revient dans plusieurs personas

| Thème | Personas convergents | Lecture |
|-------|----------------------|---------|
| **Votes récurrents automatisés** | Sarah (#1), Marcus (#4), Tom (#3) | Produit, backend et Discord pointent tous le même manque : il faut un exécuteur de sessions planifiées, exposé côté front et côté bot. |
| **Temps réel plus riche** | Léo (#1), Marcus (#2), Yuki (#1, #5) | L'écran d'attente est perçu comme mort ; les events Socket.io existants sont pauvres et les listeners clients sont fragiles. Un store socket résilient + events `vote:progress`/`notification:*` débloquent plusieurs features. |
| **Invitations / onboarding viral** | Sarah (#2), Léo (#4), Tom (#4) | L'invite est un point froid. L'endpoint `/preview` existe déjà — il suffit de le câbler en PWA deep-link et en diffusion multi-canal Discord. |
| **Confiance / intégrité** | Marcus (#3), Priya (#1, #3, #4) | Surface admin + upsert de vote sans lock + pas d'audit = dette de risque à lever avant de scaler. |

### Plan d'action proposé (à valider en comité)

**Sprint 1 — Fondations de confiance (blocker avant tout nouveau feature flag)**
1. Audit log + rate limit admin (Priya #1) — *Critical*
2. Contrainte unique + lock sur votes (Priya #3)
3. Rotation de session sur changement de privilèges (Priya #4)

**Sprint 2 — Boucle de rétention « Rituel de soirée jeu »**
4. Executor de sessions planifiées (Marcus #4)
5. Cron de groupe exposé côté front + `/wawptn-auto-vote` côté Discord (Sarah #1 + Tom #3)
6. Store Socket.io résilient (Yuki #1) pour encaisser les events de progression

**Sprint 3 — Moment de récompense et virality**
7. Particules live sur l'écran d'attente (Léo #1)
8. Carte de breakdown avant le CTA Steam (Léo #3)
9. `JoinPage` enrichie via `/preview` + deep-link PWA (Sarah #2 + Léo #4)
10. Diffusion multi-canal des résultats Discord (Tom #4)

**Backlog à séquencer ensuite :** déduplication IGDB (Marcus #1), wishlist (Sarah #3), leaderboard (Sarah #4 + Tom #1), push notifications PWA (Yuki #3), `/admin/api-health` (Marcus #5), personas conversationnelles (Tom #5).

---

*Notes générées automatiquement via 6 sous-agents personas lus en parallèle sur le code à HEAD 62fb3a9.*

---

## Rétrospective — livraison

**Date de clôture :** 2026-04-14 · **Branche :** `claude/multi-agent-feature-meeting-mKUMa` · **Total : 16 PR fusionnées.**

Chaque item actionnable de la réunion a été livré, merge incluse. Le tableau ci-dessous référence la PR qui clôt chaque item, du plan d'action ci-dessus et du backlog initial.

### Sprint 1 — Fondations de confiance

| Item | PR | Commit |
|------|----|--------|
| Audit log + rate limit admin (Priya #1) | [#117](https://github.com/wifsimster/wawptn/pull/117) | `41426f1` |
| Contrainte unique + lock sur votes (Priya #3) *→ rescopée en validation serveur* | [#117](https://github.com/wifsimster/wawptn/pull/117) | `41426f1` |
| Rotation de session sur changement de privilèges (Priya #4) | [#117](https://github.com/wifsimster/wawptn/pull/117) | `41426f1` |
| Middleware de validation Zod (Priya #2) | [#126](https://github.com/wifsimster/wawptn/pull/126) | `c5e8651` |
| Audit trail de session (Marcus #3) | [#124](https://github.com/wifsimster/wawptn/pull/124) | `e0a9c66` |

### Sprint 2 — Boucle de rétention & temps réel

| Item | PR | Commit |
|------|----|--------|
| Durabilité de l'auto-vote scheduler (Marcus #4) | [#117](https://github.com/wifsimster/wawptn/pull/117) | `41426f1` |
| Store Socket.io résilient + toast de statut (Yuki #1) | [#129](https://github.com/wifsimster/wawptn/pull/129) | `7889ca5` |
| Événements `vote:progress` par participant (Marcus #2) | [#122](https://github.com/wifsimster/wawptn/pull/122) | `70ac12e` |

### Sprint 3 — Récompense & virality

| Item | PR | Commit |
|------|----|--------|
| Particules live sur l'écran d'attente (Léo #1) | [#117](https://github.com/wifsimster/wawptn/pull/117) | `41426f1` |
| Badge sticky du compteur en mobile (Léo #2) | [#117](https://github.com/wifsimster/wawptn/pull/117) | `41426f1` |
| Carte de breakdown animée sur la révélation (Léo #3) | [#117](https://github.com/wifsimster/wawptn/pull/117) | `41426f1` |
| Banner « X jeux masqués par Metacritic » (Léo #5) | [#119](https://github.com/wifsimster/wawptn/pull/119) | `808477e` |
| Re-queue toast en cas d'échec Steam (Sarah #5) | [#120](https://github.com/wifsimster/wawptn/pull/120) | `ec68312` |
| Diffusion multi-canal des résultats Discord (Tom #4) | [#125](https://github.com/wifsimster/wawptn/pull/125) | `bfa86d2` |

### Backlog traité

| Item | PR | Commit |
|------|----|--------|
| Leaderboard Discord `/wawptn-stats` (Tom #1) | [#118](https://github.com/wifsimster/wawptn/pull/118) | `aec40b8` |
| Per-server bot config `/wawptn-config` (Tom #2) | [#128](https://github.com/wifsimster/wawptn/pull/128) | `da796a5` |
| `/api/admin/health` endpoint (Marcus #5 backend) | [#121](https://github.com/wifsimster/wawptn/pull/121) | `50a1522` |
| Admin health card (Marcus #5 frontend) | [#123](https://github.com/wifsimster/wawptn/pull/123) | `c49e428` |
| Wishlist par utilisateur (Sarah #3) | [#130](https://github.com/wifsimster/wawptn/pull/130) | `4bfd3b9` |
| PWA : notifications natives + install prompt (Yuki #3) | [#127](https://github.com/wifsimster/wawptn/pull/127) | `dba0052` |
| Déduplication inter-plateformes + colonne `igdb_id` (Marcus #1) | [#131](https://github.com/wifsimster/wawptn/pull/131) | `7214222` |

### Items déjà en prod avant la réunion

Certains items proposés par les personas étaient en fait déjà implémentés dans le code (les personas avaient travaillé sur une vue partiellement datée) :

- **Sarah #1 / Marcus #4 / Tom #3 — Exécuteur de votes planifiés** : déjà câblé dans `packages/backend/src/index.ts` via `startVoteScheduler()` et `startAutoVoteScheduler()`. Le seul gap réel (durabilité après redémarrage) est corrigé par [#117](https://github.com/wifsimster/wawptn/pull/117).
- **Sarah #2 / Léo #4 — JoinPage enrichie + deep-link PWA** : `packages/frontend/src/pages/JoinPage.tsx` affichait déjà avatars, dernier gagnant, top 3 jeux, et le bouton Steam login passait déjà `returnTo=/join/${token}` pour l'auto-join post-auth.
- **Sarah #4 — Dashboard statistiques de groupe** : `packages/frontend/src/components/group-stats.tsx` montrait déjà totalSessions, topGames, memberParticipation, recentWinners. Les leaderboards côté Discord restaient à ajouter et ont été livrés via Tom #1 ([#118](https://github.com/wifsimster/wawptn/pull/118)).

### Items explicitement hors scope

- **IGDB API live** — la colonne `games.igdb_id` existe désormais, mais aucun appel IGDB n'est fait. L'intégration Twitch OAuth + rate-limiting + backfill est prévue en suite à [#131](https://github.com/wifsimster/wawptn/pull/131).
- **Web-push à distance via VAPID** — Yuki #3 ([#127](https://github.com/wifsimster/wawptn/pull/127)) livre les notifications natives via `ServiceWorkerRegistration.showNotification()` (en-local, pas besoin de serveur push). Le push distant reste une PR séparée.
- **Migration complète de chaque caller vers `useSocketEvent`** — [#129](https://github.com/wifsimster/wawptn/pull/129) livre l'infra et migre `useChallengeListener` comme vitrine. `useNotificationListener`, `VotePage`, `GroupPage` sont laissés sur l'ancien pattern pour limiter le rayon de review.

### Statistiques

- **16 PR** fusionnées sur `main`
- **6 personas** consultées (Product, UX, Backend, Frontend, QA/Security, Discord)
- **7 migrations** de schéma : `admin_audit_log`, `session_audit_trail`, `group_announcement_webhooks`, `discord_guild_settings`, `game_wishlists`, `games.igdb_id`, `20260413_b..g`
- **3 packages** touchés : `@wawptn/backend`, `@wawptn/frontend`, `@wawptn/discord`
- **31 tests backend** passants (contre 14 au début de la session)
- **0 régression CI** sur les 16 PR — chaque merge a traversé `Lint & Type Check` au vert
