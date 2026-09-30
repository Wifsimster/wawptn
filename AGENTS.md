# AGENTS.md — conventions pour les agents

Ce fichier est la source unique des conventions du dépôt. Il s'applique à
n'importe quel agent de code (Claude Code, Codex, Copilot…) qui touche ce dépôt.

## Résumé du projet

WAWPTN (What Are We Playing Tonight?) est une application web permettant à un groupe d'amis de choisir ensemble un jeu vidéo à jouer, en se basant sur l'intersection de leurs bibliothèques de jeux (Steam, Epic Games, GOG). Le projet utilise une architecture monorepo avec npm workspaces. Un bot Discord permet de voter directement depuis Discord.

**GitHub:** `github.com/wifsimster/wawptn`

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite, TypeScript, TailwindCSS v4, Zustand, Framer Motion |
| Backend | Node.js, Express 5, Socket.io |
| Database | PostgreSQL 16, Knex.js |
| Monorepo | npm workspaces |
| Deployment | Docker (single image), Docker Compose, Traefik, GitHub Actions CI/CD |

## Structure du monorepo

```
packages/
├── types/      → @wawptn/types — Interfaces TypeScript partagées (dépendance des trois autres packages)
├── backend/    → @wawptn/backend — API Express 5, Clean Architecture
├── frontend/   → @wawptn/frontend — SPA React 19, Vite
└── discord/    → @wawptn/discord — Bot Discord.js (processus séparé)
```

**Ordre de build :** `types` → `backend` + `frontend` + `discord` (types doit être compilé en premier).

### Architecture

- `packages/backend/` — `@wawptn/backend` Express API (Clean Architecture)
  - `src/config/env.ts` — Environment variables
  - `src/infrastructure/steam/` — Steam OpenID 2.0 + Steam Web API client with rate limiter + circuit breaker
  - `src/infrastructure/database/` — Knex.js PostgreSQL connection
  - `src/infrastructure/socket/` — Socket.io server with auth middleware
  - `src/presentation/routes/` — Express route handlers, one file per area (admin, auth, challenge, discord, events, group, invite, koe, library, notification, og, persona, share, stats, subscription, subscription-webhook, user-profile, vote)
  - `src/presentation/middleware/` — Auth middleware
  - `migrations/` — Knex database migrations
- `packages/frontend/` — `@wawptn/frontend` React SPA
  - `src/pages/` — Landing, Groups, Group detail, Vote, Join, Profile, My library, User profile, Compare, Discord link, Admin, Subscription, Contact, Not found
  - `src/stores/` — Zustand stores (auth, challenge, group, notification, profile, socket, subscription, wishlist)
  - `src/lib/` — API client, Socket.io client, utils

### Key Features

- **Steam OpenID 2.0** login (the only auth method)
- **Groups** with hashed, expiring, use-limited invite tokens
- **Common games** computed via SQL intersection of Steam, Epic Games and GOG libraries
- **On-demand voting sessions** with thumbs up/down per game
- **Real-time** updates via Socket.io (vote progress, results, member events)
- **Result reveal** with game image + "Launch in Steam" button

### Database Tables

`users`, `sessions`, `groups`, `group_members`, `user_games`, `voting_sessions`, `voting_session_games`, `votes`, `voting_session_participants`, `game_metadata`, `games`, `game_platform_ids`, `accounts`, `verifications`, `discord_link_codes`, `discord_links`, `app_settings`, `subscriptions`, `stripe_events`, `personas`, `notifications`, `notification_recipients`, `challenges`, `user_challenges`, `referrals`, `streaks`, `discord_daily_challenges`, `discord_daily_challenge_claims`, `admin_audit_log`, `session_audit_trail`, `group_announcement_webhooks`, `discord_guild_settings`, `game_wishlists`, `group_bans`, `discord_auth_intents`, `group_persona_settings`, `group_game_spotlights`

## Commandes essentielles

```bash
npm install                     # Installer toutes les dépendances
npm run dev                     # Lancer tous les serveurs de développement
npm run dev:backend             # Backend seul (port 3000)
npm run dev:frontend            # Frontend seul (port 5173, Vite)
npm run dev:discord             # Bot Discord seul
npm run build:types             # Build des types partagés (à faire en premier)
npm run build                   # Build de tous les packages
npm run lint                    # Lint de tous les workspaces
npm run db:migrate              # Exécuter les migrations Knex
npm run db:rollback             # Annuler la dernière migration
npm run db:seed                 # Peupler la base de données
docker compose -f compose.local.yml up -d   # Démarrer PostgreSQL local
```

## Conventions à respecter

- **Commits :** Angular conventional commits — `<type>(<scope>): <subject>`
- **Interface utilisateur :** en français. Code source en anglais.
- **TypeScript :** mode strict dans tous les packages.
- **Alias de chemins :** `@/` correspond à `./src/` dans le backend et le frontend.
- **Pas de Redis :** cache en mémoire dans le client Steam, `node-cron` si besoin.
- **Contraintes en base :** unicité des votes et intégrité des sessions gérées au niveau SQL.
- **Feature flags :** les intégrations optionnelles (Discord, Epic, GOG) sont désactivées si les variables d'environnement ne sont pas définies.

## Workflow de développement

- **Branche principale :** `main`
- **CI/CD :** GitHub Actions — lint, type check, bump de version, build et push Docker
- **Versioning :** `npm run version:patch|minor|major` pour incrémenter la version sur tous les packages
- **Docker :** image unique contenant backend + frontend + bot Discord. Deux services en production.

## Notes importantes pour les modifications automatisées

- **Toujours builder `@wawptn/types` avant** les autres packages si les types sont modifiés
- **Ne pas modifier** `.env` (contient les secrets locaux) — utiliser `.env.example` comme référence
- **Migrations :** créer via `npm run db:make-migration -w @wawptn/backend -- -x ts <nom>`
- **Variables d'environnement :** centralisées dans `packages/backend/src/config/env.ts`
- **Husky + commitlint :** les commits sont validés automatiquement (format conventional commits)
- **Ne pas pousser directement** — laisser le pipeline CI/CD gérer le build et le déploiement
- **Bot Discord :** processus séparé dans `packages/discord/`, communique avec le backend via API HTTP
