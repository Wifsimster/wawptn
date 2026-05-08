/**
 * Persona color clamp — addresses D8 from the design review.
 *
 * Discord embed colors are 24-bit integers a server admin (or the
 * persona pool seed) freely picks. Without clamping, a low-lightness
 * blue or a near-white yellow lands on a card that's already on a
 * dark background and either disappears or burns the eye out.
 *
 * The clamp parses the embed integer through HSL and snaps the
 * lightness and saturation into a "designer-friendly" range:
 *
 *   - Lightness clamp: [0.55, 0.78] keeps the color above the
 *     contrast floor on `--background` (oklch 0.115) without going
 *     so light it loses saturation.
 *   - Saturation clamp: [0.45, 0.85] avoids muddy near-greys at the
 *     low end and oversaturated retina-burners at the high end.
 *
 * Pure functions — no DOM, no side effects — so they work in any
 * environment. Hue is preserved so each persona keeps its identity.
 */

const MIN_LIGHTNESS = 0.55
const MAX_LIGHTNESS = 0.78
const MIN_SATURATION = 0.45
const MAX_SATURATION = 0.85

interface RGB { r: number; g: number; b: number }
interface HSL { h: number; s: number; l: number }

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

function intToRgb(color: number): RGB {
  return {
    r: (color >> 16) & 0xff,
    g: (color >> 8) & 0xff,
    b: color & 0xff,
  }
}

function rgbToHex({ r, g, b }: RGB): string {
  const hex = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

function rgbToHsl({ r, g, b }: RGB): HSL {
  const r1 = r / 255
  const g1 = g / 255
  const b1 = b / 255
  const max = Math.max(r1, g1, b1)
  const min = Math.min(r1, g1, b1)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  switch (max) {
    case r1:
      h = (g1 - b1) / d + (g1 < b1 ? 6 : 0)
      break
    case g1:
      h = (b1 - r1) / d + 2
      break
    case b1:
      h = (r1 - g1) / d + 4
      break
  }
  return { h: h / 6, s, l }
}

function hslToRgb({ h, s, l }: HSL): RGB {
  if (s === 0) {
    const v = Math.round(l * 255)
    return { r: v, g: v, b: v }
  }
  const hue2rgb = (p: number, q: number, t: number): number => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  }
}

/**
 * Clamp a Discord embed color (24-bit integer) into the
 * designer-approved lightness/saturation range and return a hex
 * string. Hue is preserved.
 *
 * Exported separately for unit testing.
 */
export function clampPersonaColor(embedColor: number): string {
  const rgb = intToRgb(embedColor)
  const hsl = rgbToHsl(rgb)
  const clamped: HSL = {
    h: hsl.h,
    s: clamp(hsl.s, MIN_SATURATION, MAX_SATURATION),
    l: clamp(hsl.l, MIN_LIGHTNESS, MAX_LIGHTNESS),
  }
  return rgbToHex(hslToRgb(clamped))
}
