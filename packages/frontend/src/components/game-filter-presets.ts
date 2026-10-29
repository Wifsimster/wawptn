import { Handshake, Sofa, Trophy, Zap, Sparkles } from 'lucide-react'
import type { GameFilters } from '@/components/game-grid'

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

export function matchActivePreset(filters: GameFilters): string | null {
  for (const preset of FILTER_PRESETS) {
    const match = (Object.keys(preset.patch) as (keyof GameFilters)[]).every(
      (k) => filters[k] === preset.patch[k],
    )
    if (match) return preset.id
  }
  return null
}
