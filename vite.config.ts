import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages sirve el repo bajo /family-app/, no en la raíz — en local
// (dev/preview) seguimos en '/' para no complicar la URL de trabajo.
export default defineConfig(({ command }) => ({
  // Los tests corren SIN el .env local (igual que en GitHub Actions, donde no existe): un módulo que necesite
  // Supabase al importarse falla también aquí, en vez de pasar solo porque la máquina de desarrollo tiene claves.
  envDir: process.env.VITEST ? './.no-env-in-tests' : undefined,
  base: command === 'build' ? '/family-app/' : '/',
  plugins: [
    react(),
    VitePWA({
      // injectManifest en vez de generateSW: necesitamos un service worker
      // propio (src/sw.ts) que además del cacheo offline reciba eventos
      // 'push' reales — generateSW no permite añadir handlers custom.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Family App',
        short_name: 'Family',
        description: 'App familiar: calendario, tareas, compras, alimentación y finanzas.',
        theme_color: '#4C6EF5',
        background_color: '#FFFFFF',
        display: 'standalone',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
}))
