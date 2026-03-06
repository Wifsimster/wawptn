# CLAUDE.md

## Project Overview

WAWPTN (What Are We Playing Tonight?) is a web application that helps groups of friends decide what game to play together. Built with a monorepo architecture using npm workspaces.

**GitHub:** `github.com/wifsimster/wawptn`

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite, TypeScript, TailwindCSS v4, Zustand, Framer Motion |
| Backend | Node.js, Express 5, Better Auth, Socket.io |
| Database | PostgreSQL 16, Knex.js |
| Monorepo | npm workspaces |
| Deployment | Docker (single image), Docker Compose, Traefik, GitHub Actions CI/CD |

## Build & Development Commands

```bash
npm install                     # Install all dependencies
npm run dev                     # Start all dev servers
npm run dev:backend             # Backend on port 3000
npm run dev:frontend            # Frontend on port 5173 (Vite)
npm run build                   # Build all packages
npm run build:types             # Build shared types first
npm run lint                    # Lint all workspaces
npm run db:migrate              # Run database migrations
npm run db:rollback             # Rollback last migration
docker compose -f compose.local.yml up -d   # Start PostgreSQL locally
```

## Architecture

### Monorepo Structure
- `packages/types/` — `@wawptn/types` shared TypeScript interfaces
- `packages/backend/` — `@wawptn/backend` Express API (Clean Architecture)
  - `src/config/env.ts` — Environment variables
  - `src/infrastructure/auth/` — Better Auth + Steam OpenID 2.0
  - `src/infrastructure/steam/` — Steam Web API client with rate limiter + circuit breaker
  - `src/infrastructure/database/` — Knex.js PostgreSQL connection
  - `src/infrastructure/socket/` — Socket.io server with auth middleware
  - `src/presentation/routes/` — Express route handlers (auth, groups, votes)
  - `src/presentation/middleware/` — Auth middleware
  - `migrations/` — Knex database migrations
- `packages/frontend/` — `@wawptn/frontend` React SPA
  - `src/pages/` — Login, Groups, Group detail, Vote, Join
  - `src/stores/` — Zustand stores (auth, group)
  - `src/lib/` — API client, Socket.io client, utils

### Key Features
- **Steam OpenID 2.0** login (the only auth method)
- **Groups** with hashed, expiring, use-limited invite tokens
- **Common games** computed via SQL intersection of Steam libraries
- **On-demand voting sessions** with thumbs up/down per game
- **Real-time** updates via Socket.io (vote progress, results, member events)
- **Result reveal** with game image + "Launch in Steam" button

### Database Tables
`users`, `sessions`, `groups`, `group_members`, `user_games`, `voting_sessions`, `voting_session_games`, `votes`

## Conventions

- **Commits:** Angular conventional commits — `<type>(<scope>): <subject>`
- **UI language:** French. Code in English.
- **TypeScript:** Strict mode in all packages.
- **Path aliases:** `@/` maps to `./src/` in both backend and frontend.
- **No Redis for MVP** — in-memory cache in Steam client, `node-cron` if needed.
- **DB-level constraints** enforce vote uniqueness and session integrity.
