import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('notifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.string('type', 50).notNullable() // 'vote_opened', 'vote_closed', 'admin_broadcast'
    table.string('title', 255).notNullable()
    table.text('body').nullable()
    table.uuid('group_id').nullable().references('id').inTable('groups').onDelete('CASCADE')
    table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL')
    table.jsonb('metadata').nullable() // flexible payload (actionUrl, gameName, etc.)
    table.timestamp('expires_at').nullable()
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())
  })

  await knex.schema.createTable('notification_recipients', (table) => {
    table.uuid('notification_id').notNullable().references('id').inTable('notifications').onDelete('CASCADE')
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.timestamp('read_at').nullable()
    table.primary(['notification_id', 'user_id'])
  })

  // Partial index for fast unread count per user
  await knex.raw(`
    CREATE INDEX idx_notif_recipients_user_unread
    ON notification_recipients (user_id, read_at)
    WHERE read_at IS NULL
  `)

  await knex.raw(`
    CREATE INDEX idx_notifications_created
    ON notifications (created_at DESC)
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('notification_recipients')
  await knex.schema.dropTableIfExists('notifications')
}
