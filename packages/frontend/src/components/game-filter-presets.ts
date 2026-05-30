import { Handshake, Sofa, Trophy, Zap, Sparkles } from 'lucide-react'
import type { GameFilters } from '@/components/game-grid'

/**
 * Smart filter presets. Each preset is a partial patch over the current
 * GameFilters state — applying one just overwrites the fields it cares
 * about and leaves the rest alone. This keeps presets composable with
 * the search input and lets users layer a text query on top of a mood.
 * Reason chips are intentionally opinionated so the page feels curated
 * rather than a spreadsheet of toggles.
 */
type FilterPreset = {
  id: string
  labelKey: string
  icon: typeof Sparkles
  patch: Partial<GameFilters>
}

export const FILTER_PRESETS: FilterPreset[] = [
  {
    id: 'coopNight',
    labelKey: 'filterPresets.coopNight',
    icon: Handshake,
    patch: { coopOnly: true, multiplayerOnly: false, gamesOnly: true, controllerOnly: false, minMetacritic: null },
  },
  {
    id: 'couchCoop',
    labelKey: 'filterPresets.couchCoop',
    icon: Sofa,
    patch: { coopOnly: true, multiplayerOnly: false, gamesOnly: true, controllerOnly: true, minMetacritic: null },
  },
  {
    id: 'partyMulti',
    labelKey: 'filterPresets.partyMulti',
    icon: Zap,
    patch: { multiplayerOnly: true, coopOnly: false, gamesOnly: true, controllerOnly: false, minMetacritic: 70 },
  },
  {
    id: 'topRated',
    labelKey: 'filterPresets.topRated',
    icon: Trophy,
    patch: { gamesOnly: true, minMetacritic: 80, sortBy: 'popularity' },
  },
]

/**
 * Return the id of the currently-matching preset, or null. We consider a
 * preset "active" when every field it patches matches the current state —
 * so switching away from a preset removes its highlight immediately.
 */
export function matchActivePreset(filters: GameFilters): string | null {
  for (const preset of FILTER_PRESETS) {
    const match = (Object.keys(preset.patch) as (keyof GameFilters)[]).every(
      (k) => filters[k] === preset.patch[k],
    )
    if (match) return preset.id
  }
  return null
}
