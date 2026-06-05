import { describe, it, expect, vi } from 'vitest'

// promote-notifier.ts imports the logger and bot client at load time. The
// helpers under test (sanitizePromoteMessage, buildPromoteEmbed) are pure, so
// those side-effecting modules are stubbed out.
vi.mock('@/infrastructure/discord/bot-client.js', () => ({
  isBotClientEnabled: () => false,
  postChannelEmbed: vi.fn(),
}))
vi.mock('@/infrastructure/logger/logger.js', () => {
  const noop = () => {}
  const child = () => ({ info: noop, warn: noop, error: noop, debug: noop, child })
  return { logger: { info: noop, warn: noop, error: noop, debug: noop, child } }
})

import { sanitizePromoteMessage, buildPromoteEmbed, type PromoteGame } from '../promote-notifier.js'

describe('sanitizePromoteMessage', () => {
  it('neutralises @everyone and @here', () => {
    const out = sanitizePromoteMessage('hey @everyone and @here come play')
    expect(out).not.toMatch(/@everyone/)
    expect(out).not.toMatch(/@here/)
  })

  it('strips role and user mentions', () => {
    expect(sanitizePromoteMessage('ping <@123> and <@&456> now')).toBe('ping  and  now')
  })

  it('caps the message at 500 characters', () => {
    expect(sanitizePromoteMessage('a'.repeat(600))).toHaveLength(500)
  })
})

describe('buildPromoteEmbed', () => {
  const game: PromoteGame = { steamAppId: 570, gameName: 'Dota 2', headerImageUrl: 'https://cdn/570.jpg' }

  it('names the promoter, game and group', () => {
    const embed = buildPromoteEmbed('Les Potes', 'Alice', game)
    expect(embed.title).toContain('Dota 2')
    expect(embed.description).toContain('Alice')
    expect(embed.description).toContain('Les Potes')
    expect(embed.url).toBe('https://store.steampowered.com/app/570')
    expect(embed.image?.url).toBe('https://cdn/570.jpg')
  })

  it('includes an optional sanitized message as a quote', () => {
    const embed = buildPromoteEmbed('G', 'Bob', game, 'ce soir @everyone ?')
    expect(embed.description).toContain('> ce soir')
    expect(embed.description).not.toMatch(/@everyone/)
  })

  it('omits the quote when no message is given', () => {
    const embed = buildPromoteEmbed('G', 'Bob', game)
    expect(embed.description).not.toContain('>')
  })

  it('links to Steam in the action field', () => {
    const embed = buildPromoteEmbed('G', 'C', game)
    expect(embed.fields?.[0]?.value).toContain('store.steampowered.com/app/570')
    expect(embed.fields?.[0]?.value).toContain('steam://run/570')
  })
})
