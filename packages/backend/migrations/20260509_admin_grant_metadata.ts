import type { Knex } from 'knex'

/**
 * Admin-grant precedence + provenance.
 *
 * The original 20260413 migration added a single `admin_granted_premium`
 * boolean to `users` with no audit trail. The Stripe review (2026-05-09)
 * flagged two issues:
 *
 * 1. No way to tell *who* granted the premium and *when* — the audit log
 *    captures the action, but the column itself can drift if the audit
 *    log is purged or fails to write. Add `admin_granted_premium_by`
 *    (FK -> users.id, ON DELETE SET NULL) and `admin_granted_premium_at`
 *    so the row is self-describing.
 *
 * 2. No documented precedence rule between an admin-granted flag and an
 *    active paid subscription. The implementation in
 *    `subscription-service.isUserPremium` already short-circuits on the
 *    admin flag (admin-granted always wins), and the /admin/users listing
 *    surfaces both states independently. We codify the precedence here
 *    via a CHECK constraint that ensures the metadata columns stay
 *    consistent — _by/_at must both be NULL or both be set, and they
 *    can only be set when the boolean flag is true.
 *
 * Backfill: existing rows with admin_granted_premium=true (rare; admin
 *    grants are infrequent and recent) get NULL provenance — we cannot
 *    retroactively know who granted them. The CHECK is permissive enough
 *    to allow this.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table
      .uuid('admin_granted_premium_by')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL')
    table.timestamp('admin_granted_premium_at', { useTz: true }).nullable()
  })

  // Both metadata columns must be NULL together, or both set together.
  // Rows with admin_granted_premium=false must have NULL metadata.
  await knex.raw(`
    ALTER TABLE users ADD CONSTRAINT users_admin_grant_metadata_consistent
    CHECK (
      (admin_granted_premium_by IS NULL AND admin_granted_premium_at IS NULL)
      OR
      (admin_granted_premium_by IS NOT NULL AND admin_granted_premium_at IS NOT NULL
       AND admin_granted_premium = true)
    )
  `)

  // Reviewer-flagged invariant: an active premium subscription must have a
  // non-null current_period_end. Without it, an empty/malformed insert
  // could grant indefinite premium. Existing rows are conformant; future
  // bad inserts will be rejected.
  await knex.raw(`
    ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_active_has_period_end
    CHECK (
      status <> 'active' OR current_period_end IS NOT NULL
    )
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_active_has_period_end')
  await knex.raw('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_admin_grant_metadata_consistent')
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('admin_granted_premium_at')
    table.dropColumn('admin_granted_premium_by')
  })
}
