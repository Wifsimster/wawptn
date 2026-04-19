import { db } from '../infrastructure/database/connection.js'
import { logger } from '../infrastructure/logger/logger.js'

/**
 * Per-platform sync provider. Implementations live in auth.routes.ts (Steam,
 * Epic, GOG) and are wired into the registry from a single call site so the
 * route handler doesn't have to know which providers exist.
 *
 * `linked(userId)` returns true if this provider should be invoked for the
 * member. Steam is always linked (every WAWPTN user has a Steam ID); Epic
 * and GOG are opt-in via the `accounts` table.
 */
export interface LibrarySyncProvider {
  readonly id: string
  linked(userId: string, context: GroupSyncContext): boolean | Promise<boolean>
  sync(userId: string, context: GroupSyncContext): Promise<number>
}

export interface GroupSyncContext {
  groupId: string
  member: { id: string; steamId: string }
  /** Set of provider ids the member has explicitly linked (excludes Steam,
   *  which is implicit). Pre-fetched in one query so each provider doesn't
   *  re-hit the DB for every member. */
  linkedProviderIds: ReadonlySet<string>
}

export type SyncedHandler = (memberId: string, gameCount: number, providerId: string) => void

/**
 * Coordinates fan-out library sync across providers. The route handler
 * registers providers once, then calls `syncGroup()` per request. Adding a
 * new platform = register a new provider here, no route change needed.
 */
export class LibrarySyncCoordinator {
  private readonly providers: LibrarySyncProvider[] = []

  register(provider: LibrarySyncProvider): this {
    this.providers.push(provider)
    return this
  }

  async syncGroup(groupId: string, onSynced: SyncedHandler): Promise<void> {
    const members = await db('group_members')
      .join('users', 'users.id', 'group_members.user_id')
      .where('group_members.group_id', groupId)
      .select('users.id', 'users.steam_id')

    if (members.length === 0) return

    const memberIds = members.map((m: { id: string }) => m.id)
    const optionalProviderIds = this.providers.map((p) => p.id).filter((id) => id !== 'steam')
    const linkedAccounts = optionalProviderIds.length > 0
      ? await db('accounts')
          .whereIn('user_id', memberIds)
          .whereIn('provider_id', optionalProviderIds)
          .where('status', 'active')
          .select('user_id', 'provider_id')
      : []

    const linkedByUser = new Map<string, Set<string>>()
    for (const row of linkedAccounts) {
      const set = linkedByUser.get(row.user_id) ?? new Set<string>()
      set.add(row.provider_id)
      linkedByUser.set(row.user_id, set)
    }

    for (const member of members) {
      const ctx: GroupSyncContext = {
        groupId,
        member: { id: member.id, steamId: member.steam_id },
        linkedProviderIds: linkedByUser.get(member.id) ?? new Set(),
      }

      for (const provider of this.providers) {
        const linked = await provider.linked(member.id, ctx)
        if (!linked) continue

        provider.sync(member.id, ctx)
          .then((count) => onSynced(member.id, count, provider.id))
          .catch((err) => {
            logger.error(
              { error: String(err), userId: member.id, provider: provider.id, groupId },
              'library sync failed for member'
            )
          })
      }
    }
  }
}
