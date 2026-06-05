import { describe, it, expect, vi } from 'vitest'

// spotlight-notifier.ts imports env, the logger and the bot client at load
// time. The helpers under test (ownershipHint, buildSpotlightEmbed) are pure,
// so those side-effecting modules are stubbed out.
vi.mock('@/config/env.js', () => ({ env: { CORS_ORIGIN: 'https://app.test' } }))
vi.mock('@/infrastructure/discord/bot-client.js', () => ({
  isBotClientEnabled: () => false,
  postChannelEmbed: vi.fn(),
}))
vi.mock('@/infrastructure/logger/logger.js', () => {
  const noop = () => {}
  const child = () => ({ info: noop, warn: noop, error: noop, debug: noop, child })
  return { logger: { info: noop, warn: noop, error: noop, debug: noop, child } }
})

import { ownershipHint, buildSpotlightEmbed, type SpotlightGame } from '../spotlight-notifier.js'

describe('ownershipHint', () => {
  it('flags a game everyone already owns', () => {
    expect(ownershipHint(4, 4)).toContain('Tout le monde')
  })

  it('flags a game only the buyer owns', () => {
    const hint = ownershipHint(1, 5)
    expect(hint).toContain('Personne d’autre')
    expect(hint).toContain('0/5')
  })

  it('reports partial ownership with the count', () => {
    const hint = ownershipHint(3, 5)
    expect(hint).toContain('3/5')
  })
})

describe('buildSpotlightEmbed', () => {
  const games: SpotlightGame[] = [
    { steamAppId: 570, gameName: 'Dota 2', headerImageUrl: 'https://cdn/570.jpg', ownerCount: 2 },
  ]

  it('names the buyer and group in a single-game embed', () => {
    const embed = buildSpotlightEmbed('Les Potes', 'Alice', 5, games)
    expect(embed.title).toContain('Un nouveau jeu')
    expect(embed.description).toContain('Alice')
    expect(embed.description).toContain('Les Potes')
    expect(embed.fields).toHaveLength(1)
    expect(embed.fields?.[0]?.value).toContain('store.steampowered.com/app/570')
  })

  it('switches to plural copy for multiple games', () => {
    const embed = buildSpotlightEmbed('Les Potes', 'Bob', 3, [
      ...games,
      { steamAppId: 730, gameName: 'CS2', headerImageUrl: null, ownerCount: 1 },
    ])
    expect(embed.title).toContain('Nouveaux jeux')
    expect(embed.description).toContain('2 jeux')
    expect(embed.fields).toHaveLength(2)
  })

  it('uses the first game header as the embed image', () => {
    const embed = buildSpotlightEmbed('G', 'C', 2, games)
    expect(embed.image?.url).toBe('https://cdn/570.jpg')
  })
})
