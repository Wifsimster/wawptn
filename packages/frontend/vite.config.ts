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
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'logo.svg'],
      manifest: {
        name: 'WAWPTN - On joue à quoi ce soir ?',
        short_name: 'WAWPTN',
        description: "Aide les groupes d'amis à choisir un jeu",
        theme_color: '#0d0b14',
        background_color: '#0d0b14',
        display: 'standalone',
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
  build: {
    sourcemap: 'hidden',
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
