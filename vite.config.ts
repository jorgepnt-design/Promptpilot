import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Basis-Pfad: Für GitHub Pages liegt die App unter /Promptpilot/.
// Lokal (npm run dev) und für den Einzeldatei-Export wird '/' bzw. './' genutzt.
const isPreview = process.env.PREVIEW === '1'
const base = isPreview ? './' : process.env.BASE_PATH || '/Promptpilot/'

export default defineConfig({
  base,
  plugins: [react(), ...(isPreview ? [viteSingleFile()] : [])],
  define: {
    __BASE_PATH__: JSON.stringify(base),
    __SINGLE_FILE__: JSON.stringify(isPreview),
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
  },
  build: {
    outDir: isPreview ? 'dist-preview' : 'dist',
    target: 'es2019',
    sourcemap: false,
  },
})
