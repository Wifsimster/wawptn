import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import { logger } from '../logger/logger.js'

const ogLogger = logger.child({ module: 'og' })

// Font source URLs (Inter from rsms/inter GitHub repo — stable, reliable CDN)
const FONT_REGULAR_URL =
  'https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Regular.ttf'
const FONT_BOLD_URL =
  'https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Bold.ttf'

interface LoadedFonts {
  regular: Buffer
  bold: Buffer
}

let fontsPromise: Promise<LoadedFonts | null> | null = null

async function fetchFont(url: string): Promise<Buffer> {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) {
    throw new Error(`Failed to fetch font ${url}: ${res.status} ${res.statusText}`)
  }
  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

async function loadFonts(): Promise<LoadedFonts | null> {
  try {
    const [regular, bold] = await Promise.all([
      fetchFont(FONT_REGULAR_URL),
      fetchFont(FONT_BOLD_URL),
    ])
    ogLogger.info({ regularBytes: regular.length, boldBytes: bold.length }, 'og fonts loaded')
    return { regular, bold }
  } catch (error) {
    ogLogger.error({ error: String(error) }, 'og font loading failed')
    // Reset the cached promise so a later request can retry the download.
    fontsPromise = null
    return null
  }
}

function getFonts(): Promise<LoadedFonts | null> {
  if (!fontsPromise) {
    fontsPromise = loadFonts()
  }
  return fontsPromise
}

export interface GenerateVoteResultImageParams {
  groupName: string
  gameName: string
  headerImageUrl: string | null
  voterCount: number
  yesCount: number
  totalVoters: number
}

const WIDTH = 1200
const HEIGHT = 630

/**
 * Render a minimal SVG fallback when satori/resvg fails or fonts are unavailable.
 * Uses only default system font references so it never depends on loaded fonts.
 */
function renderFallbackPng(params: GenerateVoteResultImageParams): Buffer {
  const safeGame = escapeXml(truncate(params.gameName, 60))
  const safeGroup = escapeXml(truncate(params.groupName, 60))
  const safeStats = `${params.yesCount}/${params.totalVoters} votes`

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6366f1" />
      <stop offset="100%" stop-color="#8b5cf6" />
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)" />
  <text x="60" y="120" fill="#ffffff" font-family="sans-serif" font-size="36" font-weight="700">WAWPTN</text>
  <text x="60" y="300" fill="#ffffff" font-family="sans-serif" font-size="72" font-weight="800">${safeGame}</text>
  <text x="60" y="380" fill="#e0e7ff" font-family="sans-serif" font-size="36" font-weight="400">a gagne dans ${safeGroup}</text>
  <text x="60" y="520" fill="#ffffff" font-family="sans-serif" font-size="42" font-weight="700">${safeStats}</text>
</svg>`

  try {
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: WIDTH },
      font: { loadSystemFonts: true },
    })
    return resvg.render().asPng()
  } catch (error) {
    ogLogger.error({ error: String(error) }, 'og fallback render failed, returning raw svg bytes')
    // Absolute last resort: return the raw SVG bytes so callers still get a Buffer.
    return Buffer.from(svg, 'utf-8')
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1) + '…'
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Build the satori layout tree describing the OG card.
 * Uses plain objects instead of JSX since this file is .ts not .tsx and
 * the backend does not depend on React.
 */
function buildLayout(params: GenerateVoteResultImageParams): unknown {
  const { groupName, gameName, headerImageUrl, yesCount, totalVoters } = params
  const ratio = totalVoters > 0 ? Math.round((yesCount / totalVoters) * 100) : 0

  const children: unknown[] = []

  // Header row: logo + group badge
  children.push({
    type: 'div',
    props: {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              fontSize: 36,
              fontWeight: 800,
              color: '#ffffff',
              letterSpacing: -1,
            },
            children: 'WAWPTN',
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              padding: '12px 24px',
              borderRadius: 999,
              backgroundColor: 'rgba(255,255,255,0.15)',
              color: '#ffffff',
              fontSize: 24,
              fontWeight: 600,
              maxWidth: 500,
              overflow: 'hidden',
            },
            children: truncate(groupName, 28),
          },
        },
      ],
    },
  })

  // Main content: optional header image + game title
  const mainChildren: unknown[] = []

  if (headerImageUrl) {
    mainChildren.push({
      type: 'img',
      props: {
        src: headerImageUrl,
        width: 460,
        height: 215,
        style: {
          borderRadius: 16,
          objectFit: 'cover',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        },
      },
    })
  }

  mainChildren.push({
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        flex: 1,
        marginLeft: headerImageUrl ? 40 : 0,
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              fontSize: 28,
              fontWeight: 400,
              color: '#c7d2fe',
              marginBottom: 12,
            },
            children: 'Le groupe a choisi',
          },
        },
        {
          type: 'div',
          props: {
            style: {
              fontSize: 64,
              fontWeight: 800,
              color: '#ffffff',
              lineHeight: 1.05,
              letterSpacing: -1.5,
              display: 'flex',
            },
            children: truncate(gameName, 40),
          },
        },
      ],
    },
  })

  children.push({
    type: 'div',
    props: {
      style: {
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        marginTop: 60,
        marginBottom: 60,
      },
      children: mainChildren,
    },
  })

  // Stats row
  children.push({
    type: 'div',
    props: {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              fontSize: 32,
              fontWeight: 600,
              color: '#ffffff',
            },
            children: `${yesCount}/${totalVoters} votes pour`,
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              padding: '16px 32px',
              borderRadius: 12,
              backgroundColor: '#ffffff',
              color: '#6366f1',
              fontSize: 32,
              fontWeight: 800,
            },
            children: `${ratio}%`,
          },
        },
      ],
    },
  })

  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        padding: '60px',
        backgroundImage: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #9333ea 100%)',
        fontFamily: 'Inter',
      },
      children,
    },
  }
}

export async function generateVoteResultImage(
  params: GenerateVoteResultImageParams,
): Promise<Buffer> {
  try {
    const fonts = await getFonts()
    if (!fonts) {
      ogLogger.warn('og fonts unavailable, returning fallback image')
      return renderFallbackPng(params)
    }

    const layout = buildLayout(params)

    const svg = await satori(layout as never, {
      width: WIDTH,
      height: HEIGHT,
      fonts: [
        { name: 'Inter', data: fonts.regular, weight: 400, style: 'normal' },
        { name: 'Inter', data: fonts.bold, weight: 700, style: 'normal' },
        { name: 'Inter', data: fonts.bold, weight: 800, style: 'normal' },
      ],
    })

    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: WIDTH },
      font: { loadSystemFonts: false },
    })
    return resvg.render().asPng()
  } catch (error) {
    ogLogger.error(
      { error: String(error), gameName: params.gameName, groupName: params.groupName },
      'og image generation failed, returning fallback',
    )
    return renderFallbackPng(params)
  }
}
