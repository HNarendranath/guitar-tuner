import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// For a GitHub Pages project site, build with: npm run build -- --base=/<repo-name>/
export default defineConfig(({ mode }) => ({
  // Preact via the automatic JSX runtime (no extra Vite plugin needed).
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'preact' },
  },
  plugins: [
    // `--mode phone` (npm run dev:phone) serves over HTTPS with a self-signed cert so the
    // mic works when opening the dev server from an iPhone on the LAN.
    mode === 'phone' && basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Guitar Tuner',
        short_name: 'Tuner',
        description: 'Chromatic guitar tuner with presets, capo and custom tunings.',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        scope: '.',
        theme_color: '#0b0f14',
        background_color: '#0b0f14',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
      },
    }),
  ],
}));
