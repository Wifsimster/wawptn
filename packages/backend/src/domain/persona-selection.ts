import { db } from '../infrastructure/database/connection.js'

/**
 * Daily persona selection — per group.
 *
 * Each group has its own deterministic "persona du jour" derived from
 * `djb2("${YYYY-MM-DD}:${groupId}")`. The selection layers over three
 * fallback levels in priority order:
 *
 *   1. Group override (`group_persona_settings.persona_override`)
 *   2. Global override (`app_settings.bot.persona_override`)
 *   3. Deterministic daily hash of the group's filtered persona pool
 *
 * When the group has no row in `group_persona_settings`, it silently
 * inherits the global `bot.*` defaults — existing groups keep working
 * with zero backfill. The shared `personas` table stays global.
 *
 * The cache is keyed on `(parisDate, groupId)` and lives as long as the
 * Paris day does: when the date string changes, all stale entries are
 * garbage-collected on the next read. That gives us sub-millisecond hits
 * on the steady state and a clean cutover at midnight without any cron.
 */

export interface DailyPersona {
  id: string
  name: string
  embedColor: number
  introMessage: string
}

interface PersonaRow {
  id: string
  name: string
  embed_color: number
  intro_message: string
  is_active: boolean
  created_at: Date
}

/**
 * djb2 string hash — deterministic, same as packages/discord/src/personas.ts
 * and packages/backend legacy route. Keep all three call sites in lockstep
 * so the backend, Discord bot, and future consumers always pick the same
 * persona for the same (date, groupId).
 */
export function hashCode(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

/**
 * Canonical selection key shared by the backend and the Discord bot.
 * Pass `null` as the groupId for the global/app-wide fallback (used by
 * the legacy `/api/persona/current` endpoint).
 */
export function selectionKey(dateStr: string, groupId: string | null): string {
  return groupId ? `${dateStr}:${groupId}` : dateStr
}

/** Returns the current Paris-local date as YYYY-MM-DD. */
export function parisDate(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
}

// ─── Cache ────────────────────────────────────────────────────────────────

interface CacheEntry {
  date: string
  persona: DailyPersona
}

const personaCache = new Map<string, CacheEntry>()

function pruneStale(today: string): void {
  // Lazy prune: when today's date differs from a cached entry's date, drop
  // the entry. Keeps memory bounded in O(groups) and avoids a cron job.
  for (const [key, entry] of personaCache) {
    if (entry.date !== today) personaCache.delete(key)
  }
}

/**
 * Drop cached entries for a specific group. Call after a PATCH to
 * `/groups/:id/persona-settings` so the next read reflects the new
 * override / disabled list immediately.
 */
export function invalidateGroupPersonaCache(groupId: string | null): void {
  const suffix = groupId ? `:${groupId}` : ''
  for (const key of personaCache.keys()) {
    if (groupId === null ? !key.includes(':') : key.endsWith(suffix)) {
      personaCache.delete(key)
    }
  }
}

// ─── App-settings helpers ────────────────────────────────────────────────

interface GlobalDefaults {
  rotationEnabled: boolean
  disabledIds: string[]
  overrideId: string | null
}

async function loadGlobalDefaults(): Promise<GlobalDefaults> {
  const rows = await db('app_settings')
    .whereIn('key', [
      'bot.persona_rotation_enabled',
      'bot.disabled_personas',
      'bot.persona_override',
    ])
    .select('key', 'value')

  let rotationEnabled = true
  let disabledIds: string[] = []
  let overrideId: string | null = null

  for (const row of rows as Array<{ key: string; value: unknown }>) {
    if (row.key === 'bot.persona_rotation_enabled') {
      rotationEnabled = row.value === true
    } else if (row.key === 'bot.disabled_personas') {
      disabledIds = Array.isArray(row.value) ? (row.value as string[]) : []
    } else if (row.key === 'bot.persona_override') {
      overrideId = typeof row.value === 'string' && row.value ? row.value : null
    }
  }

  return { rotationEnabled, disabledIds, overrideId }
}

interface GroupSettingsRow {
  rotation_enabled: boolean | null
  disabled_personas: string[] | null
  persona_override: string | null
  override_expires_at: Date | null
}

async function loadGroupSettings(groupId: string): Promise<GroupSettingsRow | null> {
  const row = await db('group_persona_settings')
    .where({ group_id: groupId })
    .first<GroupSettingsRow>()
  return row ?? null
}

// ─── Core selection ──────────────────────────────────────────────────────

function pickFromPool(pool: PersonaRow[], key: string): PersonaRow {
  const index = hashCode(key) % pool.length
  return pool[index]!
}

function toDailyPersona(row: PersonaRow): DailyPersona {
  return {
    id: row.id,
    name: row.name,
    embedColor: row.embed_color,
    introMessage: row.intro_message,
  }
}

/**
 * Resolves the persona of the day for a specific group. Pass `null` for
 * the global fallback persona (used by the deprecated top-level endpoint).
 */
export async function selectPersonaForGroup(
  groupId: string | null,
  now: Date = new Date(),
): Promise<DailyPersona | null> {
  const dateStr = parisDate(now)
  const cacheKey = selectionKey(dateStr, groupId)

  const cached = personaCache.get(cacheKey)
  if (cached && cached.date === dateStr) {
    return cached.persona
  }
  pruneStale(dateStr)

  const [personas, globals, groupSettings] = await Promise.all([
    db('personas')
      .where({ is_active: true })
      .orderBy('created_at', 'asc')
      .select<PersonaRow[]>('id', 'name', 'embed_color', 'intro_message', 'is_active', 'created_at'),
    loadGlobalDefaults(),
    groupId ? loadGroupSettings(groupId) : Promise.resolve(null),
  ])

  if (personas.length === 0) return null

  // Resolve effective settings (group overrides global, nullish inherits).
  const rotationEnabled =
    groupSettings?.rotation_enabled ?? globals.rotationEnabled
  const disabledIds = new Set<string>([
    ...globals.disabledIds,
    ...(groupSettings?.disabled_personas ?? []),
  ])
  const overrideExpired =
    groupSettings?.override_expires_at != null &&
    groupSettings.override_expires_at.getTime() < now.getTime()
  const groupOverride =
    groupSettings?.persona_override && !overrideExpired
      ? groupSettings.persona_override
      : null
  const effectiveOverride = groupOverride ?? globals.overrideId

  let selected: PersonaRow | undefined

  // 1. Override (group > global)
  if (effectiveOverride) {
    selected = personas.find((p) => p.id === effectiveOverride)
  }

  // 2. Rotation disabled → default persona (first active)
  if (!selected && !rotationEnabled) {
    selected = personas[0]
  }

  // 3. Deterministic daily hash on the filtered pool
  if (!selected) {
    const available = personas.filter((p) => !disabledIds.has(p.id))
    const pool = available.length > 0 ? available : personas
    selected = pickFromPool(pool, cacheKey)
  }

  if (!selected) return null

  const persona = toDailyPersona(selected)
  personaCache.set(cacheKey, { date: dateStr, persona })
  return persona
}

/**
 * Batch helper used by `GET /api/groups` to enrich the list response with
 * `todayPersona` in a single pass without triggering N+1 DB reads. All
 * groups share the same `personas`/`app_settings` fetch, and only the
 * per-group `group_persona_settings` rows are fetched in bulk.
 */
export async function selectPersonasForGroups(
  groupIds: string[],
  now: Date = new Date(),
): Promise<Map<string, DailyPersona>> {
  const result = new Map<string, DailyPersona>()
  if (groupIds.length === 0) return result

  const dateStr = parisDate(now)
  const uncached: string[] = []
  for (const gid of groupIds) {
    const hit = personaCache.get(selectionKey(dateStr, gid))
    if (hit && hit.date === dateStr) {
      result.set(gid, hit.persona)
    } else {
      uncached.push(gid)
    }
  }
  if (uncached.length === 0) return result
  pruneStale(dateStr)

  const [personas, globals, groupRows] = await Promise.all([
    db('personas')
      .where({ is_active: true })
      .orderBy('created_at', 'asc')
      .select<PersonaRow[]>('id', 'name', 'embed_color', 'intro_message', 'is_active', 'created_at'),
    loadGlobalDefaults(),
    db('group_persona_settings')
      .whereIn('group_id', uncached)
      .select<Array<GroupSettingsRow & { group_id: string }>>(
        'group_id',
        'rotation_enabled',
        'disabled_personas',
        'persona_override',
        'override_expires_at',
      ),
  ])
  if (personas.length === 0) return result

  const settingsByGroup = new Map<string, GroupSettingsRow>()
  for (const row of groupRows) {
    settingsByGroup.set(row.group_id, row)
  }

  for (const gid of uncached) {
    const gs = settingsByGroup.get(gid) ?? null
    const rotationEnabled = gs?.rotation_enabled ?? globals.rotationEnabled
    const disabledIds = new Set<string>([
      ...globals.disabledIds,
      ...(gs?.disabled_personas ?? []),
    ])
    const overrideExpired =
      gs?.override_expires_at != null &&
      gs.override_expires_at.getTime() < now.getTime()
    const groupOverride =
      gs?.persona_override && !overrideExpired ? gs.persona_override : null
    const effectiveOverride = groupOverride ?? globals.overrideId

    let selected: PersonaRow | undefined
    if (effectiveOverride) {
      selected = personas.find((p) => p.id === effectiveOverride)
    }
    if (!selected && !rotationEnabled) {
      selected = personas[0]
    }
    if (!selected) {
      const available = personas.filter((p) => !disabledIds.has(p.id))
      const pool = available.length > 0 ? available : personas
      selected = pickFromPool(pool, selectionKey(dateStr, gid))
    }
    if (!selected) continue

    const persona = toDailyPersona(selected)
    personaCache.set(selectionKey(dateStr, gid), { date: dateStr, persona })
    result.set(gid, persona)
  }

  return result
}
