import type { ComponentType, SVGProps } from 'react'
import { Gamepad2 } from 'lucide-react'
import { SteamIcon } from './steam-icon'
import { BattleNetIcon } from './battlenet-icon'
import { EpicGamesIcon } from './epic-games-icon'
import { GogIcon } from './gog-icon'
import { UbisoftIcon } from './ubisoft-icon'

const PLATFORM_ICON_MAP: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  steam: SteamIcon,
  battlenet: BattleNetIcon,
  epic: EpicGamesIcon,
  gog: GogIcon,
  ubisoft: UbisoftIcon,
}

interface PlatformIconProps extends SVGProps<SVGSVGElement> {
  platformId: string
}

/** Renders the brand logo SVG for a given platform, or a generic gamepad fallback. */
export function PlatformIcon({ platformId, ...props }: PlatformIconProps) {
  const Icon = PLATFORM_ICON_MAP[platformId]

  if (!Icon) {
    return <Gamepad2 {...(props as Record<string, unknown>)} />
  }

  return <Icon {...props} />
}
