#!/usr/bin/env node
/**
 * Render PWA / Apple-touch PNG icons from the canonical `public/logo.svg`.
 *
 * The brand mark is authored once as SVG (see `src/components/icons/wawptn-logo.tsx`
 * and `public/logo.svg`) — this script keeps the raster outputs in sync so
 * the favicon, in-app header logo, iOS home-screen icon, and Android PWA
 * launcher icon all read as the same artwork.
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

const targets = [
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'pwa-192x192.png', size: 192 },
  { file: 'pwa-512x512.png', size: 512 },
]

for (const { file, size } of targets) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } })
  const png = resvg.render().asPng()
  writeFileSync(resolve(publicDir, file), png)
  console.log(`wrote ${file} (${size}x${size})`)
}
