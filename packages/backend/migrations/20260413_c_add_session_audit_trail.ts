import type { Knex } from 'knex'

/**
 * Session audit trail: records key lifecycle events on a voting session
 * (created, closed, participant added/removed) so we can later answer "who
 * was eligible to vote when this session closed?" and reconstruct exactly
 * what the participant set looked like at close time.
 *
 * Goals:
 * - Forensic replay for dispute resolution ("Alice swears she voted")
 * - Stable snapshots for analytics that survive subsequent membership churn
 * - Foundation for richer per-session reporting in the admin UI
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('session_audit_trail', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    // Session this event belongs to. CASCADE on delete so admin-deleted
    // sessions take their audit trail with them — the trail is per-session
    // forensic detail, not a system-wide log.
    table.uuid('session_id').notNullable().references('id').inTable('voting_sessions').onDelete('CASCADE')
    // Identifier for the event. Add new event types here as the lifecycle
    // grows (vote_recorded, session_cancelled, etc.).
    table.string('event_type', 32).notNullable()
    // Optional actor (user that triggered the event). Nullable for system-
    // initiated events (auto-vote scheduler, scheduled close, etc.) and
    // SET NULL on user delete so we never lose a row to a vanished user.
    table.uuid('actor_id').nullable().references('id').inTable('users').onDelete('SET NULL')
    // Free-form payload describing the event. For session_created it holds
    // the participant snapshot; for session_closed it holds the winner +
    // tally + the participant snapshot at close time.
    table.jsonb('metadata').notNullable().defaultTo('{}')
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())

    table.index(['session_id', 'created_at'])
    table.index(['event_type', 'created_at'])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('session_audit_trail')
}
