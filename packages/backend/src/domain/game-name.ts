/**
 * Canonical game-name normalization — used by the cross-platform
 * dedupe utility and the Epic / GOG sync paths to decide whether two
 * games with different raw names are really the same game.
 *
 * The old normalizer (lowercase → strip non-alphanumeric → collapse
 * whitespace) missed the most common reasons two storefronts disagree
 * about a title:
 *
 *   - "Hades: Definitive Edition" vs "Hades"
 *   - "DARK SOULS™ III" vs "Dark Souls 3" vs "Dark Souls III"
 *   - "The Witcher® 3: Wild Hunt - Game of the Year Edition" vs
 *     "The Witcher 3: Wild Hunt"
 *
 * This module layers three passes on top of the old behaviour:
 *   1. Drop common "edition" / subtitle suffixes ("Definitive Edition",
 *      "GOTY", "Game of the Year Edition", "Complete Edition", ...).
 *   2. Normalize trailing Roman numerals to Arabic (III → 3, IV → 4).
 *   3. Collapse multiple spaces and trim.
 *
 * The result is a stable comparison key: two games are "the same"
 * when normalizeGameName(a) === normalizeGameName(b). The result is
 * lowercase and not meant to be shown to users.
 *
 * This is part of Marcus #1 from the multi-persona feature meeting.
 * A richer dedupe signal (IGDB external id lookup) is the long-term
 * plan and its column already exists on `games.igdb_id`; this module
 * ships the immediate, offline dedupe win.
 */

const EDITION_SUFFIXES = [
  "game of the year edition",
  "game of the year",
  "goty edition",
  "goty",
  "definitive edition",
  "complete edition",
  "ultimate edition",
  "deluxe edition",
  "standard edition",
  "enhanced edition",
  "remastered",
  "anniversary edition",
  "directors cut",
  "gold edition",
  "platinum edition",
]

const ROMAN_TO_ARABIC: Record<string, string> = {
  i: '1',
  ii: '2',
  iii: '3',
  iv: '4',
  v: '5',
  vi: '6',
  vii: '7',
  viii: '8',
  ix: '9',
  x: '10',
}

/**
 * Normalise a raw game title into a stable lowercase comparison key.
 */
export function normalizeGameName(name: string): string {
  let out = name.toLowerCase()

  // Strip anything that isn't a letter, digit, space, or colon. Colons are
  // preserved until the edition-suffix pass so "Hades: Definitive Edition"
  // can anchor its suffix on the colon boundary.
  out = out.replace(/[^a-z0-9\s:]/g, ' ')

  // Drop everything after a colon if the tail matches a known edition
  // marker — e.g. "Hades: Definitive Edition" → "Hades". We run this
  // before the generic suffix strip so titles whose subtitle isn't an
  // edition marker ("Hades: Odyssey Update") are preserved.
  out = out.replace(/\s*:\s*(.*)$/u, (_full, tail: string) => {
    const trimmedTail = tail.trim()
    if (EDITION_SUFFIXES.some((suffix) => trimmedTail.startsWith(suffix))) {
      return ''
    }
    return ` ${trimmedTail}`
  })

  // Strip any lingering edition suffixes that appear without a colon
  // boundary ("Hades Definitive Edition").
  for (const suffix of EDITION_SUFFIXES) {
    const escaped = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(new RegExp(`\\s+${escaped}$`), '')
  }

  // Normalise trailing Roman numerals to Arabic digits. Only the final
  // token is considered — we don't want to mangle "Vice City" into
  // "6ice City".
  out = out.replace(/\s+([ivx]+)$/u, (match, numeral: string) => {
    const arabic = ROMAN_TO_ARABIC[numeral.toLowerCase()]
    return arabic ? ` ${arabic}` : match
  })

  // Drop the colon + any remaining special characters, collapse whitespace.
  out = out.replace(/:/g, ' ').replace(/\s+/g, ' ').trim()

  return out
}
