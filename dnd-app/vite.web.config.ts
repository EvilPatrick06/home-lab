import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { resolve } from "node:path"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

// Web (browser) build target of the renderer. Mirrors the `renderer` block of
// electron.vite.config.ts, but produces a standalone SPA served from the
// Cloudflare tunnel under /DungeonTableOnline/. The Electron-specific bits
// (preload, main process, externalized node deps) are intentionally absent —
// native capabilities are provided by the src/web window.api shim instead.
const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf-8")) as {
  version: string
}

export default defineConfig({
  // Served under a sub-path on the tunnel. Override with VITE_WEB_BASE for forks.
  base: process.env.VITE_WEB_BASE || "/DungeonTableOnline/",
  root: __dirname,
  publicDir: resolve(__dirname, "src/renderer/public"),
  resolve: {
    alias: {
      "@renderer": resolve(__dirname, "src/renderer/src"),
      "@data": resolve(__dirname, "src/renderer/public/data")
    }
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  plugins: [react(), tailwindcss()],
  build: {
    outDir: resolve(__dirname, "dist-web"),
    emptyOutDir: true,
    sourcemap: false,
    reportCompressedSize: false,
    rollupOptions: {
      input: resolve(__dirname, "index.web.html")
    }
  },
  server: {
    port: 5273
  }
})
