# Schéma de base de données

Structure des tables PostgreSQL de WAWPTN. Ce document décrit les entités, leurs relations et les contraintes d'intégrité.

## Vue d'ensemble

```mermaid
graph TD
    A[users] --> B[sessions]
    A --> C[group_members]
    A --> D[user_games]
    A --> E[votes]
    A --> K[accounts]
    A --> L[discord_links]
    F[groups] --> C
    F --> G[voting_sessions]
    G --> H[voting_session_games]
    G --> I[voting_session_participants]
    G --> E
    J[games] --> M[game_platform_ids]
```

L'utilisateur est au centre du modèle. Il possède une session d'authentification, appartient à des groupes, dispose de bibliothèques de jeux multi-plateformes et participe aux votes. Le schéma `games` centralise les jeux canoniques avec des identifiants par plateforme.

## Tables

### users

Utilisateurs authentifiés via Steam.

| Colonne | Type | Contrainte | Description |
|---------|------|------------|-------------|
| `id` | UUID | PK, auto | Identifiant unique |
| `steam_id` | VARCHAR | UNIQUE, NOT NULL | Identifiant Steam |
| `display_name` | VARCHAR | NOT NULL | Pseudo Steam |
| `avatar_url` | VARCHAR | — | URL de l'avatar |
| `profile_url` | VARCHAR | — | URL du profil Steam |
| `email` | VARCHAR | — | Email (optionnel) |
| `library_visible` | BOOLEAN | défaut `true` | Bibliothèque accessible |
| `is_admin` | BOOLEAN | défaut `false` | Rôle administrateur |
| `created_at` | TIMESTAMP | auto | Date de création |
| `updated_at` | TIMESTAMP | auto | Dernière modification |

### sessions

Sessions d'authentification liées aux utilisateurs.

| Colonne | Type | Contrainte | Description |
|---------|------|------------|-------------|
| `id` | UUID | PK, auto | Identifiant unique |
| `user_id` | UUID | FK → users, CASCADE | Utilisateur associé |
| `token` | VARCHAR | UNIQUE, NOT NULL | Token de session |
| `expires_at` | TIMESTAMP | NOT NULL | Date d'expiration |
| `created_at` | TIMESTAMP | auto | Date de création |

> **Détail technique** — Index sur `token` et `expires_at` pour des recherches rapides.

### accounts

Comptes de plateformes de jeux liés (Epic Games, GOG Galaxy).

| Colonne | Type | Contrainte | Description |
|---------|------|------------|-------------|
| `user_id` | UUID | FK → users, CASCADE | Utilisateur |
| `provider_id` | VARCHAR | NOT NULL | Plateforme (`steam`, `epic`, `gog`) |
| `account_id` | VARCHAR | NOT NULL | Identifiant sur la plateforme |
| `access_token` | TEXT | — | Token d'accès chiffré |
| `refresh_token` | TEXT | — | Token de rafraîchissement chiffré |
| `access_token_expires_at` | TIMESTAMP | — | Expiration du token |
| `status` | VARCHAR | — | État de la liaison |
| `created_at` | TIMESTAMP | auto | Date de liaison |
| `updated_at` | TIMESTAMP | auto | Dernière modification |

> **Détail technique** — Contrainte UNIQUE sur `(provider_id, account_id)`. Les tokens sont chiffrés au repos.

### groups

Groupes de joueurs.

| Colonne | Type | Contrainte | Description |
|---------|------|------------|-------------|
| `id` | UUID | PK, auto | Identifiant unique |
| `name` | VARCHAR | NOT NULL | Nom du groupe |
| `created_by` | UUID | FK → users, CASCADE | Créateur du groupe |
| `invite_token_hash` | VARCHAR | — | Hash SHA-256 du token d'invitation |
| `invite_expires_at` | TIMESTAMP | — | Expiration de l'invitation (72h) |
| `invite_use_count` | INTEGER | défaut `0` | Nombre d'utilisations |
| `invite_max_uses` | INTEGER | défaut `10` | Utilisations maximales |
| `common_game_threshold` | INTEGER | nullable | Seuil de jeux communs |
| `auto_vote_schedule` | VARCHAR(50) | nullable | Expression cron du vote automatique |
| `auto_vote_duration_minutes` | INTEGER | nullable, défaut `120` | Durée du vote automatique (minutes) |
| `discord_channel_id` | VARCHAR | nullable | Canal Discord lié |
| `discord_guild_id` | VARCHAR | nullable | Serveur Discord lié |
| `discord_webhook_url` | TEXT | nullable | URL du webhook Discord |
| `created_at` | TIMESTAMP | auto | Date de création |
| `updated_at` | TIMESTAMP | auto | Dernière modification |

### group_members

Appartenance des utilisateurs aux groupes.

| Colonne | Type | Contrainte | Description |
|---------|------|------------|-------------|
| `group_id` | UUID | PK, FK → groups, CASCADE | Groupe |
| `user_id` | UUID | PK, FK → users, CASCADE | Membre |
| `role` | ENUM | `owner` ou `member` | Rôle dans le groupe |
| `notifications_enabled` | BOOLEAN | défaut `true` | Notifications activées pour ce membre |
| `joined_at` | TIMESTAMP | auto | Date d'adhésion |

> **Détail technique** — Clé primaire composite `(group_id, user_id)` pour empêcher les doublons.

### games

Catalogue canonique des jeux, indépendant des plateformes.

| Colonne | Type | Contrainte | Description |
|---------|------|------------|-------------|
| `id` | UUID | PK, auto | Identifiant unique |
| `canonical_name` | VARCHAR | NOT NULL | Nom canonique du jeu |
| `cover_image_url` | VARCHAR | — | URL de l'image de couverture |
| `created_at` | TIMESTAMP | auto | Date de création |
| `updated_at` | TIMESTAMP | auto | Dernière modification |

### game_platform_ids

Correspondance entre jeux canoniques et identifiants par plateforme.

| Colonne | Type | Contrainte | Description |
|---------|------|------------|-------------|
| `game_id` | UUID | FK → games, CASCADE | Jeu canonique |
| `platform` | VARCHAR | NOT NULL | Plateforme (`steam`, `epic`, `gog`) |
| `platform_game_id` | VARCHAR | NOT NULL | Identifiant sur la plateforme |

> **Détail technique** — Contrainte UNIQUE sur `(platform, platform_game_id)`.

### game_metadata

Métadonnées enrichies depuis Steam.

| Colonne | Type | Contrainte | Description |
|---------|------|------------|-------------|
| `steam_app_id` | INTEGER | PK | Identifiant Steam |
| `categories` | JSONB | — | Catégories du jeu |
| `is_multiplayer` | BOOLEAN | — | Jeu multijoueur |
| `is_coop` | BOOLEAN | — | Jeu coopératif |
| `enriched_at` | TIMESTAMP | — | Date d'enrichissement |

### user_games

Cache local des bibliothèques de jeux (toutes plateformes).

| Colonne | Type | Contrainte | Description |
|---------|------|------------|-------------|
| `user_id` | UUID | FK → users, CASCADE | Propriétaire |
| `steam_app_id` | INTEGER | NOT NULL | Identifiant Steam du jeu |
| `game_id` | UUID | FK → games, nullable | Jeu canonique associé |
| `game_name` | VARCHAR | NOT NULL | Nom du jeu |
| `header_image_url` | VARCHAR | — | URL de l'image du jeu |
| `platform` | VARCHAR | défaut `steam` | Plateforme d'origine |
| `synced_at` | TIMESTAMP | auto | Dernière synchronisation |

> **Détail technique** — Clé primaire composite `(user_id, steam_app_id)`. L'upsert met à jour les données si le jeu existe déjà.

### voting_sessions

Sessions de vote au sein d'un groupe.

| Colonne | Type | Contrainte | Description |
|---------|------|------------|-------------|
| `id` | UUID | PK, auto | Identifiant unique |
| `group_id` | UUID | FK → groups, CASCADE | Groupe concerné |
| `status` | ENUM | `open` ou `closed` | État de la session |
| `created_by` | UUID | FK → users, CASCADE | Initiateur du vote |
| `winning_game_app_id` | INTEGER | — | Jeu gagnant (après clôture) |
| `winning_game_id` | UUID | — | Jeu canonique gagnant |
| `winning_game_name` | VARCHAR | — | Nom du jeu gagnant |
| `scheduled_at` | TIMESTAMP | nullable | Date de clôture automatique |
| `created_at` | TIMESTAMP | auto | Date de création |
| `closed_at` | TIMESTAMP | — | Date de clôture |

> **Détail technique** — Index composite sur `(group_id, status)`. Le champ `scheduled_at` permet la clôture automatique via un cron toutes les 15 secondes.

### voting_session_participants

Participants sélectionnés pour une session de vote.

| Colonne | Type | Contrainte | Description |
|---------|------|------------|-------------|
| `session_id` | UUID | PK, FK → voting_sessions, CASCADE | Session |
| `user_id` | UUID | PK, FK → users, CASCADE | Participant |

### voting_session_games

Jeux sélectionnés pour une session de vote.

| Colonne | Type | Contrainte | Description |
|---------|------|------------|-------------|
| `session_id` | UUID | PK, FK → voting_sessions, CASCADE | Session |
| `steam_app_id` | INTEGER | PK, NOT NULL | Identifiant Steam du jeu |
| `game_id` | UUID | nullable | Jeu canonique associé |
| `game_name` | VARCHAR | NOT NULL | Nom du jeu |
| `header_image_url` | VARCHAR | — | URL de l'image |

### votes

Votes individuels des membres sur chaque jeu.

| Colonne | Type | Contrainte | Description |
|---------|------|------------|-------------|
| `session_id` | UUID | FK → voting_sessions, CASCADE | Session |
| `user_id` | UUID | FK → users, CASCADE | Votant |
| `steam_app_id` | INTEGER | NOT NULL | Jeu concerné |
| `game_id` | UUID | nullable | Jeu canonique associé |
| `vote` | BOOLEAN | NOT NULL | `true` = pour, `false` = contre |
| `created_at` | TIMESTAMP | auto | Date du vote |

> **Détail technique** — Contrainte UNIQUE sur `(session_id, user_id, steam_app_id)` pour garantir un seul vote par joueur et par jeu. L'upsert permet de changer d'avis.

### discord_links

Liaison entre comptes Discord et comptes WAWPTN.

| Colonne | Type | Contrainte | Description |
|---------|------|------------|-------------|
| `user_id` | UUID | PK, FK → users, CASCADE | Utilisateur WAWPTN |
| `discord_id` | VARCHAR | UNIQUE, NOT NULL | Identifiant Discord |
| `discord_username` | VARCHAR | NOT NULL | Pseudo Discord |
| `linked_at` | TIMESTAMP | auto | Date de liaison |

### discord_link_codes

Codes temporaires pour le flux de liaison Discord.

| Colonne | Type | Contrainte | Description |
|---------|------|------------|-------------|
| `id` | UUID | PK, auto | Identifiant unique |
| `code` | VARCHAR(8) | UNIQUE, NOT NULL | Code alphanumérique |
| `discord_id` | VARCHAR | NOT NULL | Identifiant Discord |
| `discord_username` | VARCHAR | NOT NULL | Pseudo Discord |
| `expires_at` | TIMESTAMP | NOT NULL | Expiration (10 minutes) |
| `created_at` | TIMESTAMP | auto | Date de création |

### app_settings

Paramètres applicatifs configurables à chaud (bot Discord, planification).

| Colonne | Type | Contrainte | Description |
|---------|------|------------|-------------|
| `key` | VARCHAR(100) | PK | Clé du paramètre |
| `value` | JSONB | NOT NULL | Valeur sérialisée en JSON |
| `updated_at` | TIMESTAMP | auto | Dernière modification |

**Paramètres par défaut :**

| Clé | Valeur par défaut | Description |
|-----|-------------------|-------------|
| `bot.persona_rotation_enabled` | `true` | Rotation automatique des personas |
| `bot.friday_schedule` | `"0 21 * * 5"` | Cron du rappel vendredi (21h) |
| `bot.wednesday_schedule` | `"0 17 * * 3"` | Cron du rappel mercredi (17h) |
| `bot.schedule_timezone` | `"Europe/Paris"` | Fuseau horaire du planificateur |
| `bot.announce_persona_change` | `false` | Annoncer le changement de persona |
| `bot.disabled_personas` | `[]` | Personas exclues de la rotation |

### personas

Personnalités du bot Discord avec messages contextuels.

| Colonne | Type | Contrainte | Description |
|---------|------|------------|-------------|
| `id` | VARCHAR(50) | PK | Identifiant kebab-case |
| `name` | VARCHAR(100) | NOT NULL | Nom affiché de la persona |
| `system_prompt_overlay` | TEXT | NOT NULL | Instructions de personnalité pour le LLM |
| `friday_messages` | JSONB | NOT NULL | Messages du vendredi soir |
| `weekday_messages` | JSONB | NOT NULL | Messages en semaine |
| `back_online_messages` | JSONB | NOT NULL | Messages au retour en ligne |
| `empty_mention_reply` | TEXT | NOT NULL | Réponse si mentionné sans contenu |
| `intro_message` | TEXT | NOT NULL | Message d'introduction |
| `embed_color` | INTEGER | NOT NULL | Couleur des embeds Discord |
| `is_active` | BOOLEAN | défaut `true` | Persona active |
| `is_default` | BOOLEAN | défaut `false` | Persona livrée par défaut (non supprimable) |
| `created_at` | TIMESTAMP | auto | Date de création |
| `updated_at` | TIMESTAMP | auto | Dernière modification |

> **Détail technique** — 7 personas par défaut sont créées à la migration. Les personas par défaut ne peuvent pas être supprimées via l'API admin.

## Migrations

Les migrations sont gérées par **Knex.js** dans `packages/backend/migrations/`.

| Fichier | Description |
|---------|-------------|
| `20260306_initial_schema.ts` | Création des tables de base |
| `20260307_add_game_extended_metadata.ts` | Métadonnées enrichies des jeux |
| `20260307_add_game_filters.ts` | Filtrage par catégorie |
| `20260307_add_voting_session_participants.ts` | Suivi des participants par session |
| `20260308_better_auth_migration.ts` | Adaptation du schéma d'authentification |
| `20260308_games_schema_generalization.ts` | Catalogue de jeux canonique multi-plateforme |
| `20260308_add_scheduled_at.ts` | Votes planifiés avec clôture automatique |
| `20260308_accounts_unique_constraints.ts` | Contraintes de liaison multi-plateforme |
| `20260308_epic_games_support.ts` | Support Epic Games |
| `20260314_discord_support.ts` | Tables Discord et colonnes de liaison |
| `20260321_add_admin_role.ts` | Rôle admin et table `app_settings` |
| `20260321_add_personas_table.ts` | Table `personas` avec 7 personas par défaut |
| `20260321_add_announce_persona_setting.ts` | Paramètre d'annonce de changement de persona |
| `20260321_add_auto_vote_schedule.ts` | Planning de vote automatique par groupe |
| `20260321_add_disabled_personas.ts` | Paramètre de personas désactivées |
| `20260321_add_notifications_enabled.ts` | Notification opt-out par membre et par groupe |
