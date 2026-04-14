import { describe, it, expect } from 'vitest'
import { normalizeGameName } from '../game-name.js'

describe('normalizeGameName', () => {
  it('is deterministic and lowercase', () => {
    expect(normalizeGameName('Hades')).toBe('hades')
    expect(normalizeGameName('HADES')).toBe('hades')
    expect(normalizeGameName('  Hades  ')).toBe('hades')
  })

  it('strips trademark symbols and punctuation', () => {
    expect(normalizeGameName('DARK SOULS™ III')).toBe('dark souls 3')
    expect(normalizeGameName('The Witcher® 3: Wild Hunt')).toBe('the witcher 3 wild hunt')
    expect(normalizeGameName('F.E.A.R.')).toBe('f e a r')
  })

  it('normalises trailing roman numerals to arabic', () => {
    expect(normalizeGameName('Final Fantasy VII')).toBe('final fantasy 7')
    expect(normalizeGameName('Grand Theft Auto V')).toBe('grand theft auto 5')
    expect(normalizeGameName('Dragon Age II')).toBe('dragon age 2')
  })

  it('drops edition suffixes after a colon', () => {
    expect(normalizeGameName('Hades: Definitive Edition')).toBe('hades')
    expect(normalizeGameName('Skyrim: Special Edition')).toBe('skyrim special edition')
    // Only recognised editions get stripped via the colon shortcut
  })

  it('drops the common GOTY / Definitive Edition suffixes without a colon', () => {
    expect(normalizeGameName('The Witcher 3 Game of the Year Edition')).toBe('the witcher 3')
    expect(normalizeGameName('Hades Definitive Edition')).toBe('hades')
    expect(normalizeGameName('Borderlands GOTY')).toBe('borderlands')
  })

  it('treats a non-edition subtitle as part of the title', () => {
    // "Odyssey Update" is not in the edition list so it stays.
    const result = normalizeGameName('Hades: Odyssey Update')
    expect(result).toContain('hades')
    expect(result).toContain('odyssey update')
  })

  it('leaves two clearly different games as different keys', () => {
    const hades = normalizeGameName('Hades')
    const hades2 = normalizeGameName('Hades II')
    expect(hades).not.toBe(hades2)
  })

  it('collapses Steam vs Epic vs GOG title variants to the same key', () => {
    const steam = normalizeGameName('The Witcher® 3: Wild Hunt - Game of the Year Edition')
    const epic = normalizeGameName('The Witcher 3: Wild Hunt')
    const gog = normalizeGameName('The Witcher 3 Wild Hunt GOTY')
    expect(steam).toBe(epic)
    expect(epic).toBe(gog)
  })

  it('returns an empty string for junk-only input', () => {
    expect(normalizeGameName('   ')).toBe('')
    expect(normalizeGameName('™®')).toBe('')
  })
})
