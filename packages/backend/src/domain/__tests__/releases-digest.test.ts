import { describe, it, expect, vi } from 'vitest'

// releases-digest.ts pulls in the DB connection, Steam clients and the
// Discord notifier at import time. The functions under test here are pure,
// so those side-effecting modules are stubbed out.
vi.mock('@/infrastructure/database/connection.js', () => ({ db: {} }))
vi.mock('@/infrastructure/discord/releases-notifier.js', () => ({ notifyReleasesDigest: vi.fn() }))
vi.mock('@/infrastructure/steam/steam-store-client.js', () => ({
  getNewReleaseCandidateIds: vi.fn(),
  getStoreAppForDigest: vi.fn(),
}))
vi.mock('@/infrastructure/steam/steam-client.js', () => ({
  getHeaderImageUrl: (id: number) => `https://cdn/${id}/header.jpg`,
}))
vi.mock('@/domain/subscription-service.js', () => ({ isUserPremium: vi.fn() }))
vi.mock('@/infrastructure/logger/logger.js', () => {
  const noop = () => {}
  const child = () => ({ info: noop, warn: noop, error: noop, debug: noop, child })
  return { logger: { info: noop, warn: noop, error: noop, debug: noop, child } }
})

import { currentIsoWeek, parseReleaseDate, isDigestEligible } from '../releases-digest.js'
import type { DigestStoreApp } from '@/infrastructure/steam/steam-store-client.js'

function app(overrides: Partial<DigestStoreApp> = {}): DigestStoreApp {
  return {
    appId: 100,
    name: 'Test Game',
    headerImage: 'https://cdn/100/header.jpg',
    type: 'game',
    isCoop: true,
    isMultiplayer: true,
    releaseDateRaw: '14 May, 2026',
    comingSoon: false,
    contentDescriptorIds: [],
    ...overrides,
  }
}

describe('currentIsoWeek', () => {
  it('formats as YYYY-Www', () => {
    expect(currentIsoWeek(new Date(2026, 4, 15))).toMatch(/^\d{4}-W\d{2}$/)
  })

  it('places 1 Jan 2026 (Thursday) in week 01', () => {
    expect(currentIsoWeek(new Date(2026, 0, 1))).toBe('2026-W01')
  })

  it('places 29 Dec 2025 (Monday) in the 2026 ISO year, week 01', () => {
    expect(currentIsoWeek(new Date(2025, 11, 29))).toBe('2026-W01')
  })

  it('advances to week 02 on the following Monday', () => {
    expect(currentIsoWeek(new Date(2026, 0, 5))).toBe('2026-W02')
  })

  it('returns the same week for every day inside one ISO week', () => {
    const monday = currentIsoWeek(new Date(2026, 4, 11))
    const sunday = currentIsoWeek(new Date(2026, 4, 17))
    expect(monday).toBe(sunday)
  })
})

describe('parseReleaseDate', () => {
  it('parses a precise English release date', () => {
    const d = parseReleaseDate('14 May, 2026')
    expect(d?.toISOString().slice(0, 10)).toBe('2026-05-14')
  })

  it('parses without the comma', () => {
    expect(parseReleaseDate('1 Jan 2026')?.toISOString().slice(0, 10)).toBe('2026-01-01')
  })

  it('rejects a month-only date', () => {
    expect(parseReleaseDate('May 2026')).toBeNull()
  })

  it('rejects "Coming soon" and quarter dates', () => {
    expect(parseReleaseDate('Coming soon')).toBeNull()
    expect(parseReleaseDate('Q2 2026')).toBeNull()
  })

  it('rejects null', () => {
    expect(parseReleaseDate(null)).toBeNull()
  })
})

describe('isDigestEligible', () => {
  const now = new Date('2026-05-15T12:00:00Z')

  it('accepts a recent co-op game', () => {
    expect(isDigestEligible(app(), now).eligible).toBe(true)
  })

  it('rejects a game released more than 7 days ago', () => {
    expect(isDigestEligible(app({ releaseDateRaw: '1 May, 2026' }), now).eligible).toBe(false)
  })

  it('rejects coming-soon titles', () => {
    expect(isDigestEligible(app({ comingSoon: true }), now).eligible).toBe(false)
  })

  it('rejects non-game types (dlc, demo, soundtrack)', () => {
    expect(isDigestEligible(app({ type: 'dlc' }), now).eligible).toBe(false)
  })

  it('rejects games that are neither co-op nor multiplayer', () => {
    expect(isDigestEligible(app({ isCoop: false, isMultiplayer: false }), now).eligible).toBe(false)
  })

  it('rejects games carrying an adult content descriptor', () => {
    expect(isDigestEligible(app({ contentDescriptorIds: [4] }), now).eligible).toBe(false)
  })

  it('does not reject games for violence/gore (descriptor 2)', () => {
    expect(isDigestEligible(app({ contentDescriptorIds: [2] }), now).eligible).toBe(true)
  })

  it('rejects games with an unparseable release date', () => {
    expect(isDigestEligible(app({ releaseDateRaw: 'Coming soon' }), now).eligible).toBe(false)
  })
})
