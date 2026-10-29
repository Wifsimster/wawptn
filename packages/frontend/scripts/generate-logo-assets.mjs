#!/usr/bin/env node
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

const logoInner = svg
  .replace(/^[\s\S]*?<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')
  .trim()
const logoDefs = (logoInner.match(/<defs>([\s\S]*?)<\/defs>/)?.[1] ?? '').trim()
const logoBody = logoInner.replace(/<defs>[\s\S]*?<\/defs>/, '').trim()

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
