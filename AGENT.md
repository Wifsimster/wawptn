# AGENT.md

## Résumé du projet

WAWPTN (What Are We Playing Tonight?) est une application web permettant à un groupe d'amis de choisir ensemble un jeu vidéo à jouer, en se basant sur l'intersection de leurs bibliothèques de jeux (Steam, Epic Games, GOG). Le projet utilise une architecture monorepo avec npm workspaces. Un bot Discord permet de voter directement depuis Discord.

## Structure du monorepo

```
packages/
├── types/      → @wawptn/types — Interfaces TypeScript partagées (dépendance des trois autres packages)
├── backend/    → @wawptn/backend — API Express 5, Clean Architecture
├── frontend/   → @wawptn/frontend — SPA React 19, Vite
└── discord/    → @wawptn/discord — Bot Discord.js (processus séparé)
```

**Ordre de build :** `types` → `backend` + `frontend` + `discord` (types doit être compilé en premier).

## Commandes essentielles

```bash
npm install                     # Installer toutes les dépendances
npm run dev                     # Lancer tous les serveurs de développement
npm run dev:backend             # Backend seul (port 3000)
npm run dev:frontend            # Frontend seul (port 5173)
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
