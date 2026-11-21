import { copyFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const root = dirname(fileURLToPath(import.meta.url))
const maplibreDist = resolve(
  dirname(createRequire(import.meta.url).resolve('maplibre-gl/package.json')),
  'dist',
)

/** Populate before Vite scans publicDir, including a fresh checkout's first dev launch. */
function prepareRuntimeAssets() {
  const out = resolve(root, 'public/maplibre')
  mkdirSync(out, { recursive: true })
  for (const file of ['maplibre-gl-worker.mjs'])
    copyFileSync(resolve(maplibreDist, file), resolve(out, file))
  const mapOut = resolve(root, 'public/map')
  mkdirSync(mapOut, { recursive: true })
  for (const file of [
    'houston-usgs.webp',
    'houston-detail-usgs.webp',
    'provenance.json',
  ])
    copyFileSync(
      resolve(root, '../../apps/web/public/map', file),
      resolve(mapOut, file),
    )
  const fontOut = resolve(root, 'public/fonts')
  mkdirSync(fontOut, { recursive: true })
  copyFileSync(
    resolve(root, 'node_modules/@fontsource-variable/source-sans-3/LICENSE'),
    resolve(fontOut, 'SourceSans3-LICENSE.txt'),
  )
}
prepareRuntimeAssets()

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // AQUAGRID_API overrides the backend, e.g. AQUAGRID_API=http://127.0.0.1:8001 npm run dev
    proxy: { '/api': process.env.AQUAGRID_API ?? 'http://127.0.0.1:8000' },
  },
})
