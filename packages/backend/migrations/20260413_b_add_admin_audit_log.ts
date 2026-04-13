import type { Knex } from 'knex'

/**
 * Admin audit log: records every privileged mutation performed by an admin
 * (role grants, premium grants, persona CRUD, bot settings updates, etc.).
 *
 * Goals:
 * - Forensic trail for incident response (who changed what, when, from where)
 * - Deterrent against admin account abuse
 * - Compliance / accountability for privilege escalation
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('admin_audit_log', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    // Actor: the admin who performed the action. Nullable so we never lose a
    // log entry if the actor row is later deleted (ON DELETE SET NULL).
    table.uuid('actor_id').nullable().references('id').inTable('users').onDelete('SET NULL')
    // Target: the user/resource affected (nullable for actions that don't
    // target a specific user, e.g. bot settings updates).
    table.uuid('target_user_id').nullable().references('id').inTable('users').onDelete('SET NULL')
    // Action identifier, e.g. "user.admin.grant", "user.premium.revoke",
    // "persona.create", "bot_settings.update".
    table.string('action', 64).notNullable()
    // Free-form payload describing the change (old/new values, target ids,
    // arbitrary metadata). Kept as JSONB for easy querying.
    table.jsonb('metadata').notNullable().defaultTo('{}')
    // Forensic context.
    table.string('ip_address', 64).nullable()
    table.string('user_agent', 512).nullable()
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())

    table.index(['actor_id', 'created_at'])
    table.index(['target_user_id', 'created_at'])
    table.index(['action', 'created_at'])
    table.index('created_at')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('admin_audit_log')
}
