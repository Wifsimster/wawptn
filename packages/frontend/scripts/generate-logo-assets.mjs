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
// 190px tile rendered from the 512-unit logo viewBox.
const logoScale = 190 / 512

const ogCard = `<svg width="1200" height="630" viewBox="0 0 1200 630" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="og-glow" cx="0.5" cy="0.3" r="0.62">
      <stop offset="0" stop-color="#7C5CFF" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#7C5CFF" stop-opacity="0"/>
    </radialGradient>
    ${logoDefs}
  </defs>
  <rect width="1200" height="630" fill="#0d0b14"/>
  <rect width="1200" height="630" fill="url(#og-glow)"/>
  <g transform="translate(505, 116) scale(${logoScale})">${logoBody}</g>
  <text x="600" y="414" text-anchor="middle" font-family="'Bricolage Grotesque', 'DejaVu Sans', sans-serif" font-weight="800" font-size="106" letter-spacing="-3" fill="#ffffff">WAWPTN</text>
  <text x="600" y="473" text-anchor="middle" font-family="'DejaVu Sans', sans-serif" font-weight="500" font-size="42" fill="#ffffff" fill-opacity="0.88">On joue à quoi ce soir ?</text>
  <text x="600" y="521" text-anchor="middle" font-family="'DejaVu Sans', sans-serif" font-weight="400" font-size="28" fill="#ffffff" fill-opacity="0.6">Connecte-toi avec Steam et vote pour le jeu de ce soir !</text>
</svg>`

const ogResvg = new Resvg(ogCard, { fitTo: { mode: 'original' } })
writeFileSync(resolve(publicDir, 'og-image.png'), ogResvg.render().asPng())
console.log('wrote og-image.png (1200x630)')
