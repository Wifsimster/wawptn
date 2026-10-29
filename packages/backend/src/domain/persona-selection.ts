import { db } from '../infrastructure/database/connection.js'

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

export function hashCode(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

export function selectionKey(dateStr: string, groupId: string | null): string {
  return groupId ? `${dateStr}:${groupId}` : dateStr
}

export function parisDate(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
}

interface CacheEntry {
  date: string
  persona: DailyPersona
  validUntil?: number
}

const personaCache = new Map<string, CacheEntry>()

function pruneStale(today: string): void {
  for (const [key, entry] of personaCache) {
    if (entry.date !== today) personaCache.delete(key)
  }
}

export function invalidateGroupPersonaCache(groupId: string | null): void {
  const suffix = groupId ? `:${groupId}` : ''
  for (const key of personaCache.keys()) {
    if (groupId === null ? !key.includes(':') : key.endsWith(suffix)) {
      personaCache.delete(key)
    }
  }
}

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

export async function selectPersonaForGroup(
  groupId: string | null,
  now: Date = new Date(),
): Promise<DailyPersona | null> {
  const dateStr = parisDate(now)
  const cacheKey = selectionKey(dateStr, groupId)

  const cached = personaCache.get(cacheKey)
  if (
    cached &&
    cached.date === dateStr &&
    (cached.validUntil == null || now.getTime() < cached.validUntil)
  ) {
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

  if (effectiveOverride) {
    selected = personas.find((p) => p.id === effectiveOverride)
  }

  if (!selected && !rotationEnabled) {
    selected = personas[0]
  }

  if (!selected) {
    const available = personas.filter((p) => !disabledIds.has(p.id))
    const pool = available.length > 0 ? available : personas
    selected = pickFromPool(pool, cacheKey)
  }

  if (!selected) return null

  const validUntil =
    groupOverride && selected.id === groupOverride && groupSettings?.override_expires_at
      ? groupSettings.override_expires_at.getTime()
      : undefined

  const persona = toDailyPersona(selected)
  personaCache.set(cacheKey, { date: dateStr, persona, validUntil })
  return persona
}

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
    if (
      hit &&
      hit.date === dateStr &&
      (hit.validUntil == null || now.getTime() < hit.validUntil)
    ) {
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

    const validUntil =
      groupOverride && selected.id === groupOverride && gs?.override_expires_at
        ? gs.override_expires_at.getTime()
        : undefined

    const persona = toDailyPersona(selected)
    personaCache.set(selectionKey(dateStr, gid), { date: dateStr, persona, validUntil })
    result.set(gid, persona)
  }

  return result
}
