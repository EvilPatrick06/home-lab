# SYSTEM OVERRIDE: IMPLEMENTATION MODE
You are Claude Opus 4.6 Max. Your job is to execute the following architectural plan for Phase 20 of the D&D VTT project.

Phase 20 is a **Security Audit** scoring 7/10. Electron configuration is excellent (sandbox, contextIsolation, CSP). Network validation is strong (Zod schemas, rate limiting, size limits). The gaps are in **credential storage** (API keys in plaintext), **input sanitization** (chat messages, user data), **plugin integrity** (no signature verification), **hardcoded TURN credentials**, and **AI file access scope**. The "no authentication" finding is noted but deprioritized — this is a desktop P2P app where invite codes serve as session auth.

---

## 🏗️ Architecture & Environment Split

### Windows 11 Machine (`C:\Users\evilp\dnd\`) — ALL WORK IS HERE

Phase 20 is entirely client-side security hardening. No Raspberry Pi involvement.

### Cross-Phase Overlap (DO NOT duplicate)

| Issue | Owned By |
|-------|----------|
| Path traversal (campaignId, fileName, book paths) | Phase 17 (NET-1, NET-12, NET-13) |
| IPC handlers without try-catch | Phase 17 (NET-6, NET-29, NET-30) |
| IPC save validation | Phase 7 (Sub-Phase E) |
| Plugin execution sandboxing | Phase 1 (C2) |
| Network `z.unknown()` schemas | Phase 7 (Sub-Phase G) |

**Verified as EXCELLENT (no action needed):**
- Electron: sandbox=true, contextIsolation=true, nodeIntegration=false
- CSP: Strict content security policy
- WebRTC: Forces relay-only (`iceTransportPolicy: 'relay'`), wss:/https: only for signaling
- Rate limiting: 200 msg/sec, 65KB per message, file size limits

---

## 📋 Core Objectives (Net-New Only)

### HIGH PRIORITY

| # | Issue | File | Impact |
|---|-------|------|--------|
| S1 | API keys stored in plaintext JSON | `ai-service.ts:244-255` | Key exposure if userData compromised |
| S2 | No chat message sanitization | `network/schemas.ts:39-53` | Potential XSS if rendered as HTML |
| S3 | TURN credentials hardcoded in source | `peer-manager.ts:21-32` | Credentials publicly visible in repo |
| S4 | Plugin ZIP install without integrity check | `plugin-handlers.ts:34-47` | Malicious plugin installation |
| S5 | AI file reader unrestricted in userData | `ai/file-reader.ts:64-109` | AI can read any file in userData |

### MEDIUM PRIORITY

| # | Issue | Impact |
|---|-------|--------|
| M1 | Binary file upload without content validation | Arbitrary file types written to disk |
| M2 | AI memory files without size limits | Disk exhaustion over time |
| M3 | No audit logging for security events | Cannot trace unauthorized actions |

---

## 🛠️ Step-by-Step Execution Plan

### Sub-Phase A: API Key Encryption (S1)

**Step 1 — Encrypt API Keys at Rest**
- Open `src/main/ai/ai-service.ts` lines 244-255
- Currently writes plaintext JSON to `ai-config.json`
- Use Electron's `safeStorage` API to encrypt sensitive fields:
  ```typescript
  import { safeStorage } from 'electron'

  function encryptKey(key: string): string {
    if (!safeStorage.isEncryptionAvailable()) return key
    return safeStorage.encryptString(key).toString('base64')
  }

  function decryptKey(encrypted: string): string {
    if (!safeStorage.isEncryptionAvailable()) return encrypted
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  }
  ```
- Before saving config, encrypt API key fields: `claudeApiKey`, `openaiApiKey`, `geminiApiKey`
- On load, decrypt them before passing to AI clients
- `safeStorage` uses the OS credential store (Windows Credential Manager, macOS Keychain, Linux Secret Service)

**Step 2 — Encrypt Discord Bot Token**
- Apply same encryption to Discord bot token in discord config
- Load and decrypt on access, never keep decrypted in memory longer than needed

**Step 3 — Add API Key Format Validation**
- Before saving, validate key formats:
  ```typescript
  function validateApiKeyFormat(provider: string, key: string): boolean {
    switch (provider) {
      case 'claude': return key.startsWith('sk-ant-')
      case 'openai': return key.startsWith('sk-')
      case 'gemini': return key.length > 20
      default: return key.length > 0
    }
  }
  ```
- Show validation error in the AI settings UI for malformed keys

### Sub-Phase B: Chat Message Sanitization (S2)

**Step 4 — Sanitize Chat Messages Before Display**
- Chat messages from network peers are validated by Zod schema but NOT sanitized for HTML/XSS
- If chat messages are rendered using `dangerouslySetInnerHTML` or any HTML-injecting pattern, this is a risk
- Check how chat messages are rendered in `ChatPanel.tsx`:
  - If using React JSX text nodes (`{message.content}`), React auto-escapes — NO action needed
  - If using `dangerouslySetInnerHTML` or `innerHTML`, add DOMPurify sanitization
- Install DOMPurify if needed: `npm install dompurify @types/dompurify`
- Apply to any user-generated content rendered as HTML (chat, journal entries, notes, NPC descriptions)

**Step 5 — Sanitize Chat Link Rendering**
- Open `src/renderer/src/utils/chat-links.tsx` (renamed from .ts in Phase 17)
- The `renderChatContent()` function creates JSX elements from user text
- Ensure URLs are validated before rendering as clickable links:
  ```typescript
  function isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url)
      return ['http:', 'https:'].includes(parsed.protocol)
    } catch { return false }
  }
  ```
- Do NOT render `javascript:`, `data:`, or `file:` URLs as clickable links

### Sub-Phase C: Remove Hardcoded TURN Credentials (S3)

**Step 6 — Move TURN Credentials to Settings**
- Open `src/renderer/src/network/peer-manager.ts` lines 21-32
- Find the hardcoded TURN credentials (`dndvtt:dndvtt-relay`)
- Remove from source code and move to user-configurable settings:
  ```typescript
  function getTurnServers(): RTCIceServer[] {
    const settings = loadSettings()
    if (settings.turnServers?.length) {
      return settings.turnServers
    }
    return [
      { urls: 'stun:stun.cloudflare.com:3478' }
    ]
  }
  ```
- The TURN server config is already in `AppSettings.turnServers` (from Phase 8 analysis). Wire the peer manager to use it instead of hardcoded values.
- Remove all hardcoded usernames/passwords from the source code
- The `NetworkSettingsModal` already exists for configuring TURN servers — verify it works end-to-end

### Sub-Phase D: Plugin Integrity Verification (S4)

**Step 7 — Add Plugin Checksum Verification**
- Open `src/main/ipc/plugin-handlers.ts` lines 34-47
- Before installing a plugin ZIP, compute and verify a checksum:
  ```typescript
  import { createHash } from 'node:crypto'

  async function computeChecksum(filePath: string): Promise<string> {
    const content = await readFile(filePath)
    return createHash('sha256').update(content).digest('hex')
  }
  ```
- If the plugin comes from a trusted source with a manifest, verify the checksum matches
- If no checksum is available (user-uploaded), show a warning: "This plugin is not verified. Install at your own risk?"

**Step 8 — Validate Plugin ZIP Contents**
- Before extracting, scan the ZIP for dangerous patterns:
  - Reject ZIPs with paths containing `..` (zip-slip vulnerability)
  - Reject ZIPs containing executable files (`.exe`, `.bat`, `.cmd`, `.ps1`, `.sh`)
  - Reject ZIPs larger than 50MB
  - Only allow expected file types: `.json`, `.js`, `.ts`, `.css`, `.png`, `.jpg`, `.svg`, `.md`
  ```typescript
  function validateZipEntry(entryName: string): boolean {
    if (entryName.includes('..')) return false
    const ext = path.extname(entryName).toLowerCase()
    const ALLOWED_EXTENSIONS = ['.json', '.js', '.ts', '.css', '.png', '.jpg', '.svg', '.md', '.txt']
    return ALLOWED_EXTENSIONS.includes(ext) || entryName.endsWith('/')
  }
  ```

### Sub-Phase E: AI File Access Restriction (S5)

**Step 9 — Restrict AI File Reader to Specific Directories**
- Open `src/main/ai/file-reader.ts` lines 64-109
- Currently the AI can read any text file in userData
- Restrict to only campaign-specific directories:
  ```typescript
  const ALLOWED_AI_READ_DIRS = [
    'campaigns',
    'ai-conversations',
    'characters'
  ]

  function isAiReadAllowed(filePath: string): boolean {
    const userDataDir = app.getPath('userData')
    const resolved = path.resolve(filePath)
    if (!resolved.startsWith(userDataDir)) return false
    const relative = path.relative(userDataDir, resolved)
    return ALLOWED_AI_READ_DIRS.some(dir => relative.startsWith(dir))
  }
  ```
- Reject reads outside allowed directories with a logged warning

**Step 10 — Add AI Memory File Size Limits (M2)**
- Open `src/main/ai/memory-manager.ts`
- Add a maximum file size for each memory file:
  ```typescript
  const MAX_MEMORY_FILE_SIZE = 1024 * 1024 // 1MB per memory file
  const MAX_TOTAL_MEMORY_SIZE = 10 * 1024 * 1024 // 10MB total

  async function checkMemoryLimits(campaignId: string): Promise<boolean> {
    const memoryDir = getMemoryDir(campaignId)
    const files = await readdir(memoryDir)
    let totalSize = 0
    for (const file of files) {
      const stat = await fsStat(path.join(memoryDir, file))
      if (stat.size > MAX_MEMORY_FILE_SIZE) return false
      totalSize += stat.size
    }
    return totalSize < MAX_TOTAL_MEMORY_SIZE
  }
  ```
- Before writing memory files, check limits. If exceeded, prune oldest entries.

### Sub-Phase F: File Upload Validation (M1)

**Step 11 — Validate Binary File Uploads**
- Open `src/preload/index.ts` lines 199-211 (or the relevant upload handler)
- Add content type validation for uploaded files:
  ```typescript
  const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
  const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm']

  function validateFileType(buffer: Buffer, expectedTypes: string[]): boolean {
    // Check magic bytes for file type verification
    const header = buffer.slice(0, 4).toString('hex')
    const magicBytes: Record<string, string> = {
      '89504e47': 'image/png',
      'ffd8ffe0': 'image/jpeg',
      'ffd8ffe1': 'image/jpeg',
      '52494646': 'audio/wav', // or image/webp
      '4f676753': 'audio/ogg',
    }
    const detected = magicBytes[header]
    return detected ? expectedTypes.includes(detected) : false
  }
  ```
- Apply to image uploads (token images, map backgrounds) and audio uploads (custom sounds)

### Sub-Phase G: Audit Logging (M3)

**Step 12 — Add Security Event Logging**
- Create `src/main/security-log.ts`:
  ```typescript
  import { logToFile } from './log'

  export function logSecurityEvent(event: string, details: Record<string, unknown>) {
    const timestamp = new Date().toISOString()
    logToFile(`[SECURITY] ${timestamp} ${event}: ${JSON.stringify(details)}`)
  }
  ```
- Log these security events:
  - Failed path traversal attempts
  - Invalid API key format submissions
  - Plugin installation (success/failure, filename, checksum)
  - AI file read attempts outside allowed directories
  - Network peer connection/disconnection
  - Kick/ban actions
  - Failed Zod validation on network messages (potential injection attempts)

---

## ⚠️ Constraints & Edge Cases

### API Key Encryption
- **`safeStorage.isEncryptionAvailable()`**: Returns `false` before `app.ready` event. Ensure encryption is only used after app is ready.
- **Migration**: Existing users have plaintext keys. On first load after this change, detect unencrypted keys (they won't have the base64 encryption marker) and encrypt them in place.
- **Fallback**: If `safeStorage` is unavailable (rare on Windows 10+), fall back to plaintext with a warning log. Do NOT prevent app from starting.

### Chat Sanitization
- **React auto-escapes JSX text**: If chat messages are rendered as `{message.content}` in JSX, React prevents XSS by default. Verify this is the case before adding DOMPurify — unnecessary sanitization adds complexity.
- **Markdown rendering**: If chat supports markdown (via a markdown renderer), the markdown-to-HTML step needs sanitization. Check if any chat rendering uses `dangerouslySetInnerHTML`.
- **Chat links**: The `renderChatContent` function creates JSX elements from parsed URLs. Ensure `href` attributes are validated (no `javascript:` protocol).

### TURN Credentials
- **Default fallback**: After removing hardcoded TURN, the default should be STUN-only (Cloudflare). This means direct P2P connections work but may fail behind strict NATs. Users who need TURN must configure their own server.
- **Do NOT remove the relay-only policy** (`iceTransportPolicy: 'relay'`). If no TURN server is configured and the policy is relay-only, connections will fail. Change the default policy to `'all'` (try direct first, fall back to relay) when no TURN is configured.

### Plugin Security
- **ZIP-slip is a real vulnerability**: The `..` check in entry names must use the resolved path, not just string matching. `path.resolve(extractDir, entryName).startsWith(extractDir)` is the correct check.
- **JS execution**: Even with safe file types, a malicious `.js` file in a plugin could execute arbitrary code if the plugin system runs it. Phase 1 addresses plugin sandboxing — this phase only handles the installation step.

### AI File Access
- **Don't break existing functionality**: The AI legitimately needs to read campaign data, NPC descriptions, and conversation history. The allowed directories list must cover all legitimate use cases.
- **Test after restricting**: Run an AI DM session after implementing the restriction to ensure context building still works (it reads from campaigns, characters, and AI conversations).

Begin implementation now. Start with Sub-Phase A (Steps 1-3) for API key encryption — this is the highest-impact security fix since keys are currently in plaintext. Then Sub-Phase C (Step 6) to remove hardcoded TURN credentials from the repo. Then Sub-Phase D (Steps 7-8) for plugin integrity.
