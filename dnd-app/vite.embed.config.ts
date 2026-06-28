import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { resolve } from "node:path"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

// EMBED build target: the in-game bundle hosted inside the React Native WebView.
// Identical renderer to the web build, but:
//   - relative `base` ('./') so it loads from a file/opaque origin or any mount
//   - entry installs the bridge-backed window.api (src/web/main.embed.tsx)
//   - MemoryRouter (the renderer detects __DTO_EMBED__ and seeds from the hash)
const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf-8")) as {
  version: string
}

export default defineConfig({
  base: "./",
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
    outDir: resolve(__dirname, "dist-embed"),
    emptyOutDir: true,
    sourcemap: false,
    reportCompressedSize: false,
    rollupOptions: {
      input: resolve(__dirname, "index.embed.html")
    }
  }
})
