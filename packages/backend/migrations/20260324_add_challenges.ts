import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // Challenge definitions (seeded from code)
  await knex.schema.createTable('challenges', (table) => {
    table.string('id', 64).primary()
    table.string('category', 32).notNullable() // playtime, dedication, collection, participation
    table.string('title', 255).notNullable()
    table.string('description', 512).notNullable()
    table.string('icon', 8).notNullable() // emoji
    table.integer('tier').notNullable() // 1=bronze, 2=silver, 3=gold
    table.integer('threshold').notNullable()
    table.integer('sort_order').defaultTo(0)
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())
  })

  // Per-user challenge progress
  await knex.schema.createTable('user_challenges', (table) => {
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.string('challenge_id', 64).notNullable().references('id').inTable('challenges').onDelete('CASCADE')
    table.integer('progress').notNullable().defaultTo(0)
    table.timestamp('unlocked_at').nullable()
    table.boolean('notified').defaultTo(false)
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now())
    table.primary(['user_id', 'challenge_id'])
  })

  // Index for fast "my badges" queries
  await knex.raw(`
    CREATE INDEX idx_user_challenges_unlocked
    ON user_challenges (user_id, unlocked_at)
    WHERE unlocked_at IS NOT NULL
  `)

  // Seed initial challenges
  await knex('challenges').insert([
    // Playtime (total hours across all games, threshold in minutes)
    { id: 'playtime_100h', category: 'playtime', title: 'Joueur du dimanche', description: '100 heures de jeu au total', icon: '🎮', tier: 1, threshold: 6000, sort_order: 1 },
    { id: 'playtime_500h', category: 'playtime', title: 'Joueur assidu', description: '500 heures de jeu au total', icon: '🔥', tier: 2, threshold: 30000, sort_order: 2 },
    { id: 'playtime_1000h', category: 'playtime', title: 'No-life assumé', description: '1 000 heures de jeu au total', icon: '👑', tier: 3, threshold: 60000, sort_order: 3 },

    // Dedication (single game, threshold in minutes)
    { id: 'single_game_100h', category: 'dedication', title: 'Fan inconditionnel', description: '100 heures sur un seul jeu', icon: '💎', tier: 1, threshold: 6000, sort_order: 4 },
    { id: 'single_game_500h', category: 'dedication', title: 'Maître du jeu', description: '500 heures sur un seul jeu', icon: '🏆', tier: 3, threshold: 30000, sort_order: 5 },

    // Collection (number of games owned)
    { id: 'library_50', category: 'collection', title: 'Collectionneur', description: '50 jeux dans ta bibliothèque', icon: '📚', tier: 1, threshold: 50, sort_order: 6 },
    { id: 'library_200', category: 'collection', title: 'Bibliothécaire', description: '200 jeux dans ta bibliothèque', icon: '🏛️', tier: 2, threshold: 200, sort_order: 7 },

    // Participation (vote sessions participated in)
    { id: 'votes_10', category: 'participation', title: 'Électeur motivé', description: 'Participer à 10 sessions de vote', icon: '🗳️', tier: 1, threshold: 10, sort_order: 8 },
    { id: 'votes_50', category: 'participation', title: 'Pilier de soirée', description: 'Participer à 50 sessions de vote', icon: '⭐', tier: 3, threshold: 50, sort_order: 9 },
  ])
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_challenges')
  await knex.schema.dropTableIfExists('challenges')
}
