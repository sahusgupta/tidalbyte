import { copyFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const root = dirname(fileURLToPath(import.meta.url))
const maplibreDist = resolve(dirname(createRequire(import.meta.url).resolve('maplibre-gl/package.json')), 'dist')

/** Serve maplibre-gl's self-contained module worker from /maplibre/, matching the installed version. */
function maplibreWorker(): Plugin {
  return {
    name: 'maplibre-worker',
    buildStart() {
      const out = resolve(root, 'public/maplibre')
      mkdirSync(out, { recursive: true })
      for (const file of ['maplibre-gl-worker.mjs'])
        copyFileSync(resolve(maplibreDist, file), resolve(out, file))
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), maplibreWorker()],
  server: {
    port: 5173,
    // AQUAGRID_API overrides the backend, e.g. AQUAGRID_API=http://127.0.0.1:8001 npm run dev
    proxy: { '/api': process.env.AQUAGRID_API ?? 'http://127.0.0.1:8000' },
  },
})
