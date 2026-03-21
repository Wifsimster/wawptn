# Bot Discord

Architecture, commandes, personas IA et flux de vote du bot Discord WAWPTN. Ce document s'adresse aux développeurs et au Product Owner souhaitant comprendre l'intégration Discord.

## Vue d'ensemble

Le bot Discord permet aux joueurs de voter sur les jeux et de consulter les résultats directement dans un canal Discord, sans ouvrir le site web. Il adopte une personnalité différente grâce à un système de **personas IA**.

```mermaid
graph LR
    A[Bot Discord] -->|API REST| B[Backend WAWPTN]
    B -->|Webhooks| C[Canal Discord]
    D[Joueur Discord] -->|Commandes slash| A
    D -->|Boutons vote| A
    B -->|Base de données| E[PostgreSQL]
```

Le bot est un processus séparé qui communique avec le backend via l'API HTTP interne. Les notifications (session créée, résultat du vote) sont envoyées directement par le backend via les webhooks Discord.

## Architecture technique

Le bot vit dans `packages/discord/` comme workspace séparé du monorepo.

| Composant | Rôle |
|-----------|------|
| Bot Discord.js | Gère les commandes slash et les interactions boutons |
| Backend API | Traite les votes et gère les données |
| Webhooks Discord | Envoient les notifications dans les canaux |
| Personas IA | Personnalités interchangeables du bot |
| Planificateur | Envoie des rappels et crée des sessions automatiques |

> **Détail technique** — Le bot et le backend partagent un secret (`DISCORD_BOT_API_SECRET`). Le bot envoie ce secret via le header `Authorization: Bot <secret>` et l'identifiant Discord via `X-Discord-User-Id`. Le middleware backend résout automatiquement l'utilisateur WAWPTN correspondant.

## Commandes slash

### /wawptn-setup

Lie un canal Discord à un groupe WAWPTN. Réservée aux membres ayant la permission de gérer les canaux.

- **Paramètre :** `group-id` — L'identifiant du groupe WAWPTN
- **Effet :** Le canal recevra les notifications de vote automatiquement

### /wawptn-link

Lie votre compte Discord à votre compte WAWPTN. Nécessaire pour voter depuis Discord.

```mermaid
sequenceDiagram
    participant J as Joueur Discord
    participant B as Bot
    participant API as Backend
    participant W as Site Web

    J->>B: /wawptn-link
    B->>API: Générer code temporaire
    API-->>B: Code (8 caractères, 10 min)
    B-->>J: Embed avec le code
    J->>W: Saisir le code sur le profil
    W->>API: POST /discord/link/confirm
    API-->>W: Liaison confirmée
```

Le joueur reçoit un code temporaire (valable 10 minutes). Il le saisit sur le site web depuis son profil authentifié. La liaison est alors permanente.

### /wawptn-games

Affiche la liste des jeux en commun du groupe lié au canal actuel.

## Vote par boutons

Lorsqu'une session de vote est créée sur le site, le backend envoie un embed riche dans le canal Discord lié. Chaque jeu apparaît avec un bouton 👍.

```mermaid
sequenceDiagram
    participant S as Site Web
    participant API as Backend
    participant D as Canal Discord
    participant J as Joueur Discord

    S->>API: Créer session de vote
    API->>D: Webhook embed avec jeux
    J->>D: Clic bouton 👍
    D->>API: POST /discord/vote
    API-->>J: Vote enregistré ✅
    S->>API: Clôturer le vote
    API->>D: Webhook embed résultat 🏆
```

Les votes Discord sont traités exactement comme les votes web. Le même utilisateur peut voter depuis les deux canaux sans conflit, grâce à la contrainte d'unicité en base de données.

## Personas IA

Le bot dispose d'un système de **personas** qui lui confèrent des personnalités distinctes. Chaque persona définit un ton, des messages contextuels et une couleur d'embed.

### Personas par défaut

| Persona | Style | Couleur |
|---------|-------|---------|
| **Le Pote Sarcastique** | Drôle et taquin, mais bienveillant | Bleu Discord |
| **Le Narrateur Dramatique** | Épique et théâtral, chaque vote est une quête | Violet |
| **Le Coach Motivation** | Ultra-positif et encourageant | Jaune |
| **Le Pince-Sans-Rire** | Humour sec, air blasé mais investi | Gris |
| **Le Nostalgique Rétro** | Références aux classiques, ton chaleureux | Orange |
| **Le Compétiteur** | Challengeur et fair-play, tout est un défi | Rouge |
| **Le Philosophe Zen** | Calme et contemplatif, proverbes inventés | Vert |

### Rotation des personas

La rotation est automatique et configurable via le panneau d'administration :

- **Activation/désactivation** de la rotation
- **Exclusion** de personas spécifiques
- **Annonce** optionnelle du changement de persona dans les canaux

### Messages contextuels

Chaque persona possède des banques de messages adaptées au contexte :

| Contexte | Déclencheur |
|----------|------------|
| **Vendredi soir** | Rappel planifié (par défaut 21h) |
| **En semaine** | Rappel planifié (par défaut mercredi 17h) |
| **Retour en ligne** | Après un redémarrage du bot |
| **Mention vide** | Quand un utilisateur mentionne le bot sans message |

### Personas personnalisées

Les administrateurs peuvent créer de nouvelles personas via le panneau d'administration (`/api/admin/personas`). Une persona personnalisée définit :

- Un identifiant unique (kebab-case)
- Un nom affiché
- Un prompt de personnalité pour le LLM
- Des banques de messages pour chaque contexte
- Une couleur d'embed Discord

> **Détail technique** — Les personas par défaut ne peuvent pas être supprimées. Elles peuvent être désactivées pour les exclure de la rotation.

## Planification automatique

Le bot intègre un planificateur pour les rappels et les sessions automatiques.

### Rappels Discord

Le planificateur envoie des messages de rappel dans les canaux liés :

| Planning | Par défaut | Description |
|----------|-----------|-------------|
| Vendredi soir | `0 21 * * 5` (21h) | Rappel pour lancer un vote |
| En semaine | `0 17 * * 3` (mercredi 17h) | Suggestion de session improvisée |

Ces plannings sont configurables via le panneau d'administration.

### Votes automatiques par groupe

Chaque groupe peut configurer un **planning de vote automatique** :

- **Expression cron** — Définit quand la session est créée (ex : `0 20 * * 5`)
- **Durée** — Temps avant clôture automatique (défaut : 120 minutes)

Le planificateur crée automatiquement la session et la clôture à l'échéance.

## Notifications automatiques

Le backend envoie deux types de notifications via webhook Discord :

| Événement | Contenu de l'embed |
|-----------|-------------------|
| Session créée | Liste des jeux, nom du créateur, boutons de vote |
| Vote clôturé | Jeu gagnant, image, nombre de votes, lien Steam |

> **Détail technique** — Les notifications sont envoyées de manière non-bloquante (`.catch()`). Un échec du webhook n'empêche pas le fonctionnement du vote.

## Déploiement

Le bot tourne comme un service séparé dans Docker Compose, utilisant la même image que le backend.

| Service | Commande | Réseau |
|---------|----------|--------|
| `wawptn` | Backend principal | `lan` |
| `wawptn-discord` | `node packages/discord/dist/index.js` | `lan` |

Le bot se connecte au backend via `http://wawptn:8080` (réseau Docker interne).

## Variables d'environnement

| Variable | Service | Description |
|----------|---------|-------------|
| `DISCORD_BOT_TOKEN` | Bot | Token du bot depuis le Developer Portal |
| `DISCORD_APPLICATION_ID` | Bot | ID de l'application Discord |
| `DISCORD_BOT_API_SECRET` | Bot + Backend | Secret partagé pour l'authentification |
| `BACKEND_URL` | Bot | URL interne du backend |

Le bot est **feature-flagged** : si `DISCORD_BOT_API_SECRET` n'est pas défini, les routes Discord sont désactivées côté backend.
