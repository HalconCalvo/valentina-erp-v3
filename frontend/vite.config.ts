import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Build identifier: Render sets RENDER_GIT_COMMIT during builds; locally it falls back to the build time.
const BUILD_ID = process.env.RENDER_GIT_COMMIT || `local-${Date.now()}`

// Publishes /version.json with the build id so open tabs can detect a newer deploy.
function versionFile(): Plugin {
  return {
    name: 'valentina-version-file',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ build_id: BUILD_ID }),
      })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), versionFile()],
  define: {
    __APP_BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
  }
})
