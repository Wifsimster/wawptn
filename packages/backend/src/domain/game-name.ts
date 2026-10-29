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

export function normalizeGameName(name: string): string {
  let out = name.toLowerCase()

  out = out.replace(/[^a-z0-9\s:]/g, ' ')

  out = out.replace(/\s*:\s*(.*)$/u, (_full, tail: string) => {
    const trimmedTail = tail.trim()
    if (EDITION_SUFFIXES.some((suffix) => trimmedTail.startsWith(suffix))) {
      return ''
    }
    return ` ${trimmedTail}`
  })

  for (const suffix of EDITION_SUFFIXES) {
    const escaped = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(new RegExp(`\\s+${escaped}$`), '')
  }

  out = out.replace(/\s+([ivx]+)$/u, (match, numeral: string) => {
    const arabic = ROMAN_TO_ARABIC[numeral.toLowerCase()]
    return arabic ? ` ${arabic}` : match
  })

  out = out.replace(/:/g, ' ').replace(/\s+/g, ' ').trim()

  return out
}
