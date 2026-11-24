import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/** Solo se permiten conexiones a las fuentes conocidas. */
const CSP = [
  "default-src 'self'",
  "connect-src 'self' https://raw.githubusercontent.com https://cdn.jsdelivr.net https://api.github.com https://fight.pokebattler.com https://cdn.leekduck.com https://leekduck.com",
  "img-src 'self' data: https://raw.githubusercontent.com https://cdn.leekduck.com https://leekduck.com https://www.leekduck.com",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

const csp: Plugin = {
  name: 'csp',
  apply: 'build',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
  ],
};

export default defineConfig({
  // Rutas relativas: la misma compilación sirve en la raíz y en la subcarpeta de GitHub Pages.
  base: './',
  server: { host: 'localhost', port: 5173, strictPort: true },
  preview: { host: 'localhost', port: 4173, strictPort: true },
  plugins: [
    csp,
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      // Los iconos de instalación los pide el sistema al instalar: no ocupan la caché de la aplicación.
      includeManifestIcons: false,
      manifest: {
        name: 'GO MetaHub',
        short_name: 'GO MetaHub',
        description: 'Meta de Pokémon GO: PvP, incursiones y eventos',
        lang: 'es',
        // Relativos al manifiesto. Sin «id» propio, cada instalación se identifica por su dirección
        // y no choca con otras páginas del mismo usuario en github.io.
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#05062a',
        theme_color: '#05062a',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html}', 'favicon-*.png', '*.webp'],
        cleanupOutdatedCaches: true,
        // Workbox guarda la aplicación y las imágenes. Los datos viven solo en IndexedDB:
        // dos cachés de datos podrían mostrar información antigua.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /(^|\.)leekduck\.com$/.test(url.hostname) && /\.(?:png|jpe?g|webp|gif)$/i.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              // El origen github.io se comparte entre proyectos: nombre propio.
              cacheName: 'go-metahub-imagenes',
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 250, maxAgeSeconds: 30 * 24 * 3600, purgeOnQuotaError: true },
            },
          },
          {
            urlPattern: /^https:\/\/raw\.githubusercontent\.com\/PokeAPI\/sprites\/.*\/official-artwork\/\d+\.png$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'go-metahub-ilustraciones',
              cacheableResponse: { statuses: [200] },
              // Unos 16 MB como máximo.
              expiration: { maxEntries: 120, maxAgeSeconds: 30 * 24 * 3600, purgeOnQuotaError: true },
            },
          },
          {
            urlPattern: /^https:\/\/raw\.githubusercontent\.com\/PokeAPI\/sprites\/master\/sprites\/pokemon\/\d+\.png$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'go-metahub-sprites',
              cacheableResponse: { statuses: [200] },
              // Unos 0,7 MB como máximo.
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 24 * 3600, purgeOnQuotaError: true },
            },
          },
        ],
      },
    }),
  ],
});
