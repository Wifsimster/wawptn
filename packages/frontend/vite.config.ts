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
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'logo.svg'],
      manifest: {
        name: 'WAWPTN - On joue à quoi ce soir ?',
        short_name: 'WAWPTN',
        description: "Aide les groupes d'amis à choisir un jeu",
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
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
            urlPattern: ({ url, request }) =>
              request.method === 'GET' &&
              url.origin === self.location.origin &&
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
