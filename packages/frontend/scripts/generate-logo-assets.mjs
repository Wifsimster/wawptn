#!/usr/bin/env node
/**
 * Render the PWA / Apple-touch icons and the Open Graph share card from the
 * canonical `public/logo.svg`.
 *
 * The brand mark is authored once as SVG (see `src/components/icons/wawptn-logo.tsx`
 * and `public/logo.svg`) — this script keeps the raster outputs in sync so
 * the favicon, in-app header logo, iOS home-screen icon, Android PWA
 * launcher icon, and the social share image all read as the same artwork.
 * `og-image.png` embeds `logo.svg` by reference (a nested <svg>), so the
 * card can never drift from the mark.
 *
 * Run after editing the SVG:
 *   node packages/frontend/scripts/generate-logo-assets.mjs
 *
 * Requires `@resvg/resvg-js` (added as a devDependency of the frontend).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = resolve(__dirname, '..', 'public')
const svgPath = resolve(publicDir, 'logo.svg')
const svg = readFileSync(svgPath, 'utf8')

const iconTargets = [
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'pwa-192x192.png', size: 192 },
  { file: 'pwa-512x512.png', size: 512 },
]

for (const { file, size } of iconTargets) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } })
  const png = resvg.render().asPng()
  writeFileSync(resolve(publicDir, file), png)
  console.log(`wrote ${file} (${size}x${size})`)
}

// Open Graph / Twitter share card (1200x630). The logo tile is lifted
// straight from `logo.svg` — its gradient defs are hoisted into the card's
// own <defs> and the mark is dropped into a scaled group — so the card
// always tracks the brand mark instead of carrying a stale copy of it.
// (resvg does not resolve gradient references inside a nested <svg>, and it
// only resolves them on the page at all when the root carries fill="none";
// hence the flattening and the explicit root fill.)
const logoInner = svg
  .replace(/^[\s\S]*?<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')
  .trim()
const logoDefs = (logoInner.match(/<defs>([\s\S]*?)<\/defs>/)?.[1] ?? '').trim()
const logoBody = logoInner.replace(/<defs>[\s\S]*?<\/defs>/, '').trim()

// Thumbnail-style layout: the share card is seen more often than the site
// itself, so it leads with the hook (the question) like a YouTube thumbnail
// — huge gradient punchline, brand relegated to a small corner mark.
const ogCard = `<svg width="1200" height="630" viewBox="0 0 1200 630" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="og-glow" cx="0.5" cy="0.42" r="0.7">
      <stop offset="0" stop-color="#7C5CFF" stop-opacity="0.45"/>
      <stop offset="1" stop-color="#7C5CFF" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="og-headline" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#A98BFF"/>
      <stop offset="0.55" stop-color="#7FB4FF"/>
      <stop offset="1" stop-color="#5FE0D4"/>
    </linearGradient>
    ${logoDefs}
  </defs>
  <rect width="1200" height="630" fill="#0d0b14"/>
  <rect width="1200" height="630" fill="url(#og-glow)"/>
  <text x="1010" y="600" text-anchor="middle" font-family="'DejaVu Sans', sans-serif" font-weight="800" font-size="640" fill="#7C5CFF" fill-opacity="0.08">?</text>
  <g transform="translate(48, 42) scale(${56 / 512})">${logoBody}</g>
  <text x="122" y="82" font-family="'Bricolage Grotesque', 'DejaVu Sans', sans-serif" font-weight="800" font-size="32" letter-spacing="6" fill="#ffffff" fill-opacity="0.85">WAWPTN</text>
  <text x="600" y="296" text-anchor="middle" font-family="'Bricolage Grotesque', 'DejaVu Sans', sans-serif" font-weight="800" font-size="92" letter-spacing="-2" fill="#ffffff">On joue à quoi</text>
  <text x="600" y="452" text-anchor="middle" font-family="'Bricolage Grotesque', 'DejaVu Sans', sans-serif" font-weight="800" font-size="172" letter-spacing="-6" fill="url(#og-headline)">ce soir ?</text>
  <text x="600" y="556" text-anchor="middle" font-family="'DejaVu Sans', sans-serif" font-weight="500" font-size="30" fill="#ffffff" fill-opacity="0.65">Vote en groupe · Jeux Steam en commun · 100% gratuit</text>
</svg>`

const ogResvg = new Resvg(ogCard, { fitTo: { mode: 'original' } })
writeFileSync(resolve(publicDir, 'og-image.png'), ogResvg.render().asPng())
console.log('wrote og-image.png (1200x630)')
