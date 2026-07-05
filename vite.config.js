import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt', // mostra un avviso "Nuova versione"; l'utente aggiorna quando vuole
      injectRegister: false, // registrazione gestita dal componente AggiornaApp
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'GreenCure VTA – Gestione del Verde',
        short_name: 'GreenCure VTA',
        description:
          'Rilievo VTA in campo e cruscotto Web-GIS per la gestione del verde pubblico',
        theme_color: '#166534',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
        ]
      },
      workbox: {
        // niente skipWaiting automatico: la nuova versione attende la conferma
        // dell'utente (pulsante "Aggiorna"), poi updateServiceWorker(true) la applica
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // tile OSM / Esri: cache-first per consultare la mappa offline nelle zone già visitate
            urlPattern: /^https:\/\/[abc]?\.?(tile\.openstreetmap\.org|server\.arcgisonline\.com)\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'supabase-storage',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 14 }
            }
          }
        ]
      }
    })
  ]
})
