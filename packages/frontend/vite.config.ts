import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { readFileSync } from 'fs'

const getAppVersion = () => {
  if (process.env.VITE_APP_VERSION) {
    return process.env.VITE_APP_VERSION
  }
  const rootPackageJsonPath = path.resolve(__dirname, '../../package.json')
  const packageJson = JSON.parse(readFileSync(rootPackageJsonPath, 'utf-8'))
  return packageJson.version
}

const appVersion = getAppVersion()
const buildTime = new Date().toISOString()

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Prompt-based: a new SW waits in the background until the user
      // confirms via <PwaUpdatePanel>. Switching from `autoUpdate` avoids
      // dropping a vote / unsaved input on the floor when a deploy lands
      // mid-session.
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'logo.svg'],
      manifest: {
        name: 'WAWPTN - On joue à quoi ce soir ?',
        short_name: 'WAWPTN',
        description: "Aide les groupes d'amis à choisir un jeu",
        theme_color: '#0d0b14',
        background_color: '#0d0b14',
        display: 'standalone',
        // Intentionally no `orientation` — a hard portrait lock annoys
        // tablet users who install the PWA in landscape. The UI already
        // reflows at `sm:` and `lg:` breakpoints.
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallbackDenylist: [/^\/api\//, /^\/health$/, /^\/invite\//],
        runtimeCaching: [
          {
            // Steam profile avatars: immutable — keep for a week.
            urlPattern: /^https:\/\/avatars\.steamstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'steam-avatars',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
            },
          },
          {
            // Steam game header/capsule images live on two Akamai CDNs
            // depending on the asset. Both are effectively immutable by
            // app-id, so cache aggressively — the vote UI on flaky 4G
            // was otherwise re-downloading ~50 capsule JPEGs per render.
            urlPattern: /^https:\/\/(cdn\.akamai\.steamstatic\.com|steamcdn-a\.akamaihd\.net|shared\.(?:akamai|fastly)\.steamstatic\.com)\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'steam-game-media',
              expiration: {
                maxEntries: 400,
                maxAgeSeconds: 60 * 60 * 24 * 14,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Authenticated API GETs. NetworkFirst so the user always
            // sees fresh data when online; falls back to the last
            // successful response when the network flakes or the phone
            // is offline, which is exactly the "tab frozen after Discord
            // switch" case mobile users hit. Short network timeout
            // (3s) so we don't stall the UI waiting for a dead radio.
            //
            // Excludes navigation requests (request.mode === 'navigate')
            // because endpoints like /api/auth/steam/login respond with a
            // 3xx redirect to a cross-origin OpenID URL, and a SW cannot
            // return a redirected Response for a navigation — the browser
            // then falls back to the SPA shell and renders the 404 page.
            urlPattern: ({ sameOrigin, url, request }) =>
              sameOrigin &&
              request.method === 'GET' &&
              request.mode !== 'navigate' &&
              url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-get',
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 5,
              },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  // Vendor isolation. Hot-path libraries (React, the router) stay in their
  // own long-lived chunk so a stylistic tweak in app code doesn't bust
  // them. Heavy libraries used by a single route (framer-motion is mainly
  // VotePage, virtual is the game grid) get split so the landing path
  // doesn't pay for them.
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return
          if (id.includes('/react-router')) return 'router'
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/')
          ) return 'react'
          if (id.includes('/framer-motion/') || id.includes('/motion-')) return 'motion'
          if (id.includes('/@radix-ui/') || id.includes('/radix-ui/')) return 'radix'
          if (id.includes('/socket.io-client/') || id.includes('/engine.io-client/')) return 'socket'
          if (id.includes('/i18next') || id.includes('/react-i18next')) return 'i18n'
          if (id.includes('/@tanstack/')) return 'tanstack'
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
      '/invite': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
