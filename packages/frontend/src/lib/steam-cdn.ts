const STEAM_CDN_BASE = 'https://cdn.akamai.steamstatic.com/steam/apps'

export function getSteamHeaderImageUrl(appId: number): string {
  return `${STEAM_CDN_BASE}/${appId}/header.jpg`
}

export function resolveSteamHeaderImage(
  appId: number,
  override: string | null | undefined
): string {
  return override || getSteamHeaderImageUrl(appId)
}
