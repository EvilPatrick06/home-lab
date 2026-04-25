/**
 * Regenerates docs/IPC-SURFACE.md — the channel catalog section is derived from
 * src/shared/ipc-channels.ts (single source of truth).
 *
 * Usage: node scripts/build/gen-ipc-surface.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dndAppRoot = join(__dirname, '..', '..')
const channelsPath = join(dndAppRoot, 'src/shared/ipc-channels.ts')
const outPath = join(dndAppRoot, 'docs/IPC-SURFACE.md')

const staticPreamble = `# IPC Surface — dnd-app

Electron IPC between main, preload, and renderer. **The channel list below is generated** from \`src/shared/ipc-channels.ts\` — do not hand-edit the "Defined channels" section. To refresh after adding or renaming a channel:

\`\`\`bash
cd dnd-app && npm run gen:ipc-surface
\`\`\`

## Where things live

| What | Path |
|------|------|
| Channel constants | \`src/shared/ipc-channels.ts\` |
| Zod schemas (partial) | \`src/shared/ipc-schemas.ts\` |
| Main handlers | \`src/main/ipc/*-handlers.ts\` |
| Preload bridge | \`src/preload/index.ts\`, \`src/preload/index.d.ts\` |
| Renderer | \`src/renderer/src/**\` (invokes \`window.api.*\`) |

## How IPC works

\`\`\`
Renderer (React) ── window.api.* ──► Preload ── ipcRenderer.invoke ──► Main (\`ipcMain.handle\`)
         ◄──────────────────────  response  ────────────────────────────────┘
\`\`\`

Main may send one-way events to the renderer with \`webContents.send(IPC_CHANNELS.X, payload)\` (e.g. AI stream chunks, BMO sync). Those names are the same \`IPC_CHANNELS\` table.

## Defined channels

`

const staticPostamble = `

---

## Adding a new channel

1. Add a constant in \`src/shared/ipc-channels.ts\` (and keep the section comment above it).
2. Add zod schemas in \`src/shared/ipc-schemas.ts\` when the payload is non-trivial.
3. Implement \`ipcMain.handle\` in the appropriate \`src/main/ipc/*-handlers.ts\` and register the handler from \`src/main/ipc/index.ts\` if needed.
4. Expose a typed method in \`src/preload/index.ts\` and \`src/preload/index.d.ts\`.
5. Run \`npm run gen:ipc-surface\` and commit the updated \`docs/IPC-SURFACE.md\`.

## Validation (ideal)

Handlers should validate inputs (and outputs) with zod where practical — see \`src/shared/ipc-schemas.ts\` and existing AI handlers.

## Debugging

- Set \`DEBUG_IPC=1\` to log channel traffic in the main process.
- Renderer: DevTools console for failed \`invoke\` promises.
- Main logs: \`%APPDATA%/dnd-vtt/logs/\` (platform-specific).

## Common pitfalls

- **Preload not updated** — handler exists in main but nothing calls it from the renderer.
- **Payloads** — only structured-cloneable data across the boundary; no functions.
- **\`handle\` vs \`on\`** — \`ipcMain.handle\` for request/response; one-way events use \`webContents.send\` / \`ipcRenderer.on\`.
`

function parseChannels(ts) {
  const lines = ts.split('\n')
  let section = 'General'
  const sections = []

  for (const line of lines) {
    const sec = line.match(/^\s*\/\/ === (.+?) ===\s*$/)
    if (sec) {
      section = sec[1].trim()
      continue
    }
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*:\s*'([^']*)'/)
    if (m) {
      sections.push({ section, key: m[1], channel: m[2] })
    }
  }
  return sections
}

function escapeMdCell(s) {
  return s.replace(/\|/g, '\\|')
}

const src = readFileSync(channelsPath, 'utf8')
const entries = parseChannels(src)

if (entries.length === 0) {
  console.error('No IPC channel entries parsed from', channelsPath)
  process.exit(1)
}

const bySection = new Map()
for (const e of entries) {
  if (!bySection.has(e.section)) bySection.set(e.section, [])
  bySection.get(e.section).push(e)
}

const parts = [staticPreamble]
parts.push(
  `*Total: **${entries.length}** channel strings (from \`IPC_CHANNELS\`).*\n\n`,
)

for (const [section, rows] of bySection) {
  parts.push(`### ${escapeMdCell(section)}\n\n`)
  parts.push('| Constant | Channel string |\n')
  parts.push('|---|---|\n')
  for (const { key, channel } of rows) {
    parts.push(`| \`${key}\` | \`${escapeMdCell(channel)}\` |\n`)
  }
  parts.push('\n')
}

parts.push(staticPostamble)
writeFileSync(outPath, parts.join(''), 'utf8')
console.log(`Wrote ${outPath} (${entries.length} channels)`)
