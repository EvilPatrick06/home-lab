# Project Audit Report
Generated: 2026-03-02T22:31:36.072Z

## Summary Dashboard
| # | Check | Category | Status | Issues | Time |
|---|-------|----------|--------|--------|------|
| 1 | TypeScript type-check | Core Quality | ✅ PASS | 0 | 2.0s |
| 2 | Biome lint | Core Quality | ⚠️ WARN | 3 | 5.9s |
| 3 | Biome format check | Core Quality | ⚠️ WARN | 0 | 4.1s |
| 4 | Unit tests | Core Quality | ✅ PASS | 0 | 43.1s |
| 5 | Test coverage | Core Quality | ✅ PASS | 0 | 56.3s |
| 6 | Production build | Core Quality | ✅ PASS | 0 | 49.7s |
| 7 | OxLint | Core Quality | ⚠️ WARN | 3 | 2.2s |
| 8 | npm audit | Security | ✅ PASS | 0 | 6.3s |
| 9 | Lockfile lint | Security | ✅ PASS | 0 | 1.7s |
| 10 | Electron security scan | Security | ✅ PASS | 0 | 0.0s |
| 11 | Hardcoded secrets scan | Security | ✅ PASS | 0 | 0.6s |
| 12 | eval() / new Function() | Security | ✅ PASS | 0 | 0.5s |
| 13 | dangerouslySetInnerHTML | Security | ✅ PASS | 0 | 0.4s |
| 14 | Circular dependencies | Dependencies | ✅ PASS | 0 | 1.5s |
| 15 | Dead code (knip) | Dependencies | ⚠️ WARN | 110 | 12.7s |
| 16 | Outdated packages | Dependencies | ℹ️ INFO | 2 | 2.7s |
| 17 | License compliance | Dependencies | ✅ PASS | 0 | 3.4s |
| 18 | Unused exports (ts-prune) | Dependencies | ✅ PASS | 0 | 2.0s |
| 19 | Duplicate packages | Dependencies | ✅ PASS | 50 | 2.2s |
| 20 | React hooks lint (OxLint) | React & Hooks | ⚠️ WARN | 3 | 1.5s |
| 21 | Missing export default on lazy components | React & Hooks | ✅ PASS | 0 | 0.0s |
| 22 | Missing key prop in .map() | React & Hooks | ✅ PASS | 0 | 0.3s |
| 23 | CRLF line endings | Code Quality | ✅ PASS | 0 | 0.6s |
| 24 | console.log leaks | Code Quality | ✅ PASS | 1 | 0.4s |
| 25 | TODO/FIXME/HACK count | Code Quality | ✅ PASS | 0 | 0.6s |
| 26 | Large files (>1000 lines) | Code Quality | ✅ PASS | 4 | 0.5s |
| 27 | `any` type usage | Code Quality | ✅ PASS | 0 | 0.4s |
| 28 | Empty catch blocks | Code Quality | ✅ PASS | 0 | 0.4s |
| 29 | Functions >200 lines | Code Quality | ✅ PASS | 43 | 0.7s |
| 30 | Code duplication (jscpd) | Code Quality | ✅ PASS | 639 | 71.1s |
| 31 | Regex safety (ReDoS) | Code Quality | ✅ PASS | 0 | 0.5s |
| 32 | Git status (uncommitted changes) | Project Hygiene | ℹ️ INFO | 39 | 0.2s |
| 33 | File naming conventions | Project Hygiene | ✅ PASS | 0 | 0.2s |
| 34 | Missing test files | Project Hygiene | ✅ PASS | 7 | 0.4s |
| 35 | Orphan files (not imported) | Project Hygiene | ✅ PASS | 0 | 2.4s |
| 36 | Type coverage % | Project Hygiene | ✅ PASS | 0 | 137.4s |

**Total: 0 errors, 5 warnings, 2 informational**

---

## Detailed Results

### Core Quality

#### 1. TypeScript type-check
**Status**: ✅ PASS  
**Issues**: 0

```
0 errors across all projects
```

#### 2. Biome lint
**Status**: ⚠️ WARN  
**Issues**: 3

```
The number of diagnostics exceeds the limit allowed. Use --max-diagnostics to increase it.
Diagnostics not shown: 47.
Checked 4351 files in 3s. No fixes applied.
Found 15 errors.
Found 52 warnings.
src\renderer\src\components\campaign\MapConfigStep.tsx:92:22 lint/correctness/useExhaustiveDependencies ━━━━━━━━━━

  ! createMapEntry changes on every re-render and should not be used as a hook dependency.
  
    90 │       }
    91 │     },
  > 92 │     [maps, onChange, createMapEntry]
       │                      ^^^^^^^^^^^^^^
    93 │   )
    94 │ 
  
  i To fix this, wrap the definition of createMapEntry in its own useCallback() hook.
  

src\renderer\src\components\game\dice3d\DiceHistory.tsx:26:3 lint/correctness/useExhaustiveDependencies  FIXABLE  ━━━━━━━━━━

  ! This hook specifies more dependencies than necessary: filtered.length.
  
    25 │   // Auto-scroll to bottom on new entries
  > 26 │   useEffect(() => {
       │   ^^^^^^^^^
    27 │     if (scrollRef.current) {
    28 │       scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  
  i This dependency can be removed from the list.
  
    28 │       scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    29 │     }
  > 30 │   }, [filtered.length])
       │       ^^^^^^^^^^^^^^^
    31 │ 
    32 │   const formatTime = useCallback((ts: number) => {
  
  i React relies on hook dependencies to determine when to re-compute Effects.
    Specifying more dependencies than required can lead to unnecessary re-rendering
    and degraded performance.
  
  i Unsafe fix: Remove the extra dependencies from the list.
  
    30 │ ··},·[filtered.length])
       │       ---------------  

src\renderer\src\components\game\dice3d\DiceRenderer.tsx:51:3 lint/correctness/useExhaustiveDependencies  FIXABLE  ━━━━━━━━━━

  ! This hook does not specify its dependency on height.
  
    49 │   // ── Setup Three.js scene (once) ──────────────────────────
    50 │ 
  > 51 │   useEffect(() => {
       │   ^^^^^^^^^
    52 │     if (!containerRef.current) return
    53 │ 
  
  i This dependency is being used here, but is not specified in the hook dependency list.
  
    66 │       powerPreference: 'high-performance'
    67 │     })
  > 68 │     renderer.setSize(width, height)
       │                             ^^^^^^
    69 │     renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    70 │     renderer.shadowMap.enabled = true
  
  i This dependency is being used here, but is not specified in the hook dependency list.
  
    55 │     sceneRef.current = scene
    56 │ 
  > 57 │     const aspect = width > 0 && height > 0 ? width / height : 16 / 9
       │                                                      ^^^^^^
    58 │     const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100)
    59 │     camera.position.set(0, 8, 6)
  
  i This dependency is being used here, but is not specified in the hook dependency list.
  
    55 │     sceneRef.current = scene
    56 │ 
  > 57 │     const
```

#### 3. Biome format check
**Status**: ⚠️ WARN  
**Issues**: 0

```
Checked 4350 files in 2s. No fixes applied.
Found 15 errors.
src\renderer\public\data\5e\equipment\tools\index.json format ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  × Formatter would have printed the following content:
  
     1    │ - [␍
     2    │ - ··{·"id":·"disguise-kit",·"path":·"equipment/tools/disguise-kit.json"·},␍
     3    │ - ··{·"id":·"forgery-kit",·"path":·"equipment/tools/forgery-kit.json"·},␍
     4    │ - ··{·"id":·"herbalism-kit",·"path":·"equipment/tools/herbalism-kit.json"·},␍
     5    │ - ··{·"id":·"navigators-tools",·"path":·"equipment/tools/navigators-tools.json"·},␍
     6    │ - ··{·"id":·"poisoners-kit",·"path":·"equipment/tools/poisoners-kit.json"·},␍
     7    │ - ··{·"id":·"thieves-tools",·"path":·"equipment/tools/thieves-tools.json"·},␍
     8    │ - ··{·"id":·"alchemists-supplies",·"path":·"equipment/tools/artisan-tools/alchemists-supplies.json"·},␍
     9    │ - ··{·"id":·"brewers-supplies",·"path":·"equipment/tools/artisan-tools/brewers-supplies.json"·},␍
    10    │ - ··{·"id":·"calligraphers-supplies",·"path":·"equipment/tools/artisan-tools/calligraphers-supplies.json"·},␍
    11    │ - ··{·"id":·"carpenters-tools",·"path":·"equipment/tools/artisan-tools/carpenters-tools.json"·},␍
    12    │ - ··{·"id":·"cartographers-tools",·"path":·"equipment/tools/artisan-tools/cartographers-tools.json"·},␍
    13    │ - ··{·"id":·"cobblers-tools",·"path":·"equipment/tools/artisan-tools/cobblers-tools.json"·},␍
    14    │ - ··{·"id":·"cooks-utensils",·"path":·"equipment/tools/artisan-tools/cooks-utensils.json"·},␍
    15    │ - ··{·"id":·"glassblowers-tools",·"path":·"equipment/tools/artisan-tools/glassblowers-tools.json"·},␍
    16    │ - ··{·"id":·"jewelers-tools",·"path":·"equipment/tools/artisan-tools/jewelers-tools.json"·},␍
    17    │ - ··{·"id":·"leatherworkers-tools",·"path":·"equipment/tools/artisan-tools/leatherworkers-tools.json"·},␍
    18    │ - ··{·"id":·"masons-tools",·"path":·"equipment/tools/artisan-tools/masons-tools.json"·},␍
    19    │ - ··{·"id":·"painters-supplies",·"path":·"equipment/tools/artisan-tools/painters-supplies.json"·},␍
    20    │ - ··{·"id":·"potters-tools",·"path":·"equipment/tools/artisan-tools/potters-tools.json"·},␍
    21    │ - ··{·"id":·"smiths-tools",·"path":·"equipment/tools/artisan-tools/smiths-tools.json"·},␍
    22    │ - ··{·"id":·"tinkers-tools",·"path":·"equipment/tools/artisan-tools/tinkers-tools.json"·},␍
    23    │ - ··{·"id":·"weavers-tools",·"path":·"equipment/tools/artisan-tools/weavers-tools.json"·},␍
    24    │ - ··{·"id":·"woodcarvers-tools",·"path":·"equipment/tools/artisan-tools/woodcarvers-tools.json"·},␍
    25    │ - ··{·"id":·"dice",·"path":·"equipment/tools/gaming-sets/dice.json"·},␍
    26    │ - ··{·"id":·"dragonchess",·"path":·"equipment/tools/gaming-sets/dragonchess.json"·},␍
    27    │ - ··{·"id":·"playing-cards",·"path":·"equipment/tools/gaming-sets/playing-cards.json"·},␍
    28    │ - ··{·"id":·"three-dragon-ante",·"path":·"equipment/tools/gam
```

#### 4. Unit tests
**Status**: ✅ PASS  
**Issues**: 0

```
605 passed, 0 failed

```

#### 5. Test coverage
**Status**: ✅ PASS  
**Issues**: 0

```
Statement coverage: 64.09%
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
-------------------|---------|----------|---------|---------|-------------------
All files          |   64.09 |     53.8 |   62.95 |   65.07 |                   
 data              |   81.94 |     62.2 |   88.52 |   84.07 |                   
  ...scriptions.ts |     100 |      100 |     100 |     100 |                   
  ...ion-events.ts |   58.33 |    41.79 |   57.89 |   55.96 | 151-161,184-260   
  ...ar-presets.ts |     100 |       80 |     100 |     100 | 28-35             
  ...-resources.ts |      95 |    73.68 |   92.85 |   94.11 | 20,84             
  conditions.ts    |      88 |     87.5 |      80 |   86.36 | 42-43,62          
  ...efinitions.ts |   85.18 |       50 |     100 |     100 | 18-50             
  ...scriptions.ts |     100 |      100 |     100 |     100 |                   
  light-sources.ts |     100 |      100 |     100 |     100 |                   
  moderation.ts    |   85.71 |      100 |      50 |   85.71 | 8                 
  ...requisites.ts |     100 |      100 |     100 |     100 |                   
  ...appearance.ts |     100 |       50 |     100 |     100 | 12-17             
  ...mannerisms.ts |     100 |       50 |     100 |     100 | 8-9               
  ...ity-tables.ts |     100 |    85.71 |     100 |     100 | 36,55             
  ...ient-items.ts |     100 |    54.16 |     100 |     100 | 23-27,58,64-75    
  skills.ts        |     100 |       75 |     100 |     100 | 24                
```

#### 6. Production build
**Status**: ✅ PASS  
**Issues**: 0

```
Build succeeded
```

#### 7. OxLint
**Status**: ⚠️ WARN  
**Issues**: 3

```

  ! eslint(no-unused-vars): Variable 'bg' is declared but never used. Unused variables should start with a '_'.
     ,-[src/renderer/src/systems/dnd5e/index.ts:138:13]
 137 |       const backgrounds = await load5eBackgrounds()
 138 |       const bg = backgrounds.find((b) => b.id === backgroundId)
     :             ^|
     :              `-- 'bg' is declared here
 139 |       const gold = 10
     `----
  help: Consider removing this declaration.

  ! eslint(no-unused-vars): Type 'SpeciesTrait' is imported but never used.
    ,-[src/renderer/src/services/data-provider.ts:50:3]
 49 |   SpeciesSpellsFile,
 50 |   SpeciesTrait,
    :   ^^^^^^|^^^^^
    :         `-- 'SpeciesTrait' is imported here
 51 |   SpellData,
    `----
  help: Consider removing this import.

  ! eslint(no-unused-vars): Variable 'basePath' is declared but never used. Unused variables should start with a '_'.
     ,-[src/renderer/src/services/data-provider.ts:459:9]
 458 |   const index = await loadJson<IndexEntry[]>(indexPath)
 459 |   const basePath = indexPath.substring(0, indexPath.lastIndexOf('/') + 1).replace('./data/5e/', '')
     :         ^^^^|^^^
     :             `-- 'basePath' is declared here
 460 |   const results = await Promise.all(
     `----
  help: Consider removing this declaration.

Found 3 warnings and 0 errors.
Finished in 180ms on 1324 files with 93 rules using 22 threads.

```

### Security

#### 8. npm audit
**Status**: ✅ PASS  
**Issues**: 0

```
# npm audit report

fast-xml-parser  5.0.0 - 5.3.7
fast-xml-parser has stack overflow in XMLBuilder with preserveOrder - https://github.com/advisories/GHSA-fj3w-jwp8-x2g3
fix available via `npm audit fix --force`
Will install @aws-sdk/client-s3@3.893.0, which is a breaking change
node_modules/fast-xml-parser
  @aws-sdk/xml-builder  >=3.894.0
  Depends on vulnerable versions of fast-xml-parser
  node_modules/@aws-sdk/xml-builder
    @aws-sdk/core  >=3.894.0
    Depends on vulnerable versions of @aws-sdk/xml-builder
    node_modules/@aws-sdk/core
      @aws-sdk/client-s3  >=3.894.0
      Depends on vulnerable versions of @aws-sdk/core
      Depends on vulnerable versions of @aws-sdk/credential-provider-node
      Depends on vulnerable versions of @aws-sdk/middleware-flexible-checksums
      Depends on vulnerable versions of @aws-sdk/middleware-sdk-s3
      Depends on vulnerable versions of @aws-sdk/middleware-user-agent
      Depends on vulnerable versions of @aws-sdk/signature-v4-multi-region
      Depends on vulnerable versions of @aws-sdk/util-user-agent-node
      node_modules/@aws-sdk/client-s3
      @aws-sdk/credential-provider-env  >=3.894.0
      Depends on vulnerable versions of @aws-sdk/core
      node_modules/@aws-sdk/credential-provider-env
        @aws-sdk/credential-provider-node  >=3.894.0
        Depends on vulnerable versions of @aws-sdk/credential-provider-env
        Depends on vulnerable versions of @aws-sdk/credential-provider-http
        Depends on vulnerable versions of @aws-sdk/credential-provider-ini
        Depends on vulnerable versions of @aws-sdk/credential-provider-process
        Depends on vulnerable versions of @aws-sdk/credential-provider-sso
        Depends on vulnerable versions of @aws-sdk/credential-provider-web-identity
        node_modules/@aws-sdk/credential-provider-node
      @aws-sdk/credential-provider-http  >=3.894.0
      Depends on vulnerable versions of @aws-sdk/core
      node_modules/@aws-sdk/credential-provider-http
      @aws-sdk/credential-provider-ini  >=3.894.0
      Depends on vulnerable versions of @aws-sdk/core
      Depends on vulnerable versions of @aws-sdk/credential-provider-env
      Depends on vulnerable versions of @aws-sdk/credential-provider-http
      Depends on vulnerable versions of @aws-sdk/credential-provider-login
      Depends on vulnerable versions of @aws-sdk/credential-provider-process
      Depends on vulnerable versions of @aws-sdk/credential-provider-sso
      Depends on vulnerable versions of @aws-sdk/credential-provider-web-identity
      Depends on vulnerable versions of @aws-sdk/nested-clients
      node_modules/@aws-sdk/credential-provider-ini
      @aws-sdk/credential-provider-login  *
      Depends on vulnerable versions of @aws-sdk/core
      Depends on vulnerable versions of @aws-sdk/nested-clients
      node_modules/@aws-sdk/credential-provider-login
      @aws-sdk/credential-provider-process  >=3.894.0
      Depends on vulnerable versions of @aws-sdk/core
 
```

#### 9. Lockfile lint
**Status**: ✅ PASS  
**Issues**: 0

```
Lockfile is valid
```

#### 10. Electron security scan
**Status**: ✅ PASS  
**Issues**: 0

```
**nodeIntegration must be false**: PASS

**contextIsolation must be true**: PASS

**sandbox must be true**: PASS

**CSP headers present**: PASS

**webSecurity not disabled**: PASS

**shell.openExternal validated**: PASS

**IPC channel validation**: PASS

**No allowRunningInsecureContent**: PASS

**Preload script isolation**: PASS

```

#### 11. Hardcoded secrets scan
**Status**: ✅ PASS  
**Issues**: 0

```
No hardcoded secrets found
```

#### 12. eval() / new Function()
**Status**: ✅ PASS  
**Issues**: 0

```
No eval/Function usage
```

#### 13. dangerouslySetInnerHTML
**Status**: ✅ PASS  
**Issues**: 0

```
No dangerouslySetInnerHTML usage
```

### Dependencies

#### 14. Circular dependencies
**Status**: ✅ PASS  
**Issues**: 0

```
No circular dependencies (barrel + lazy-require false positives excluded)
```

#### 15. Dead code (knip)
**Status**: ⚠️ WARN  
**Issues**: 110

```
[93m[4mUnused exports[24m[39m (42)
CR_OPTIONS                          src/renderer/src/pages/library/LibraryFilters.tsx:5:10         
SIZE_OPTIONS                        src/renderer/src/pages/library/LibraryFilters.tsx:5:22         
sizeOrder                           src/renderer/src/pages/library/LibraryFilters.tsx:5:36         
TABS                                src/renderer/src/pages/library/LibraryFilters.tsx:5:47         
TYPE_OPTIONS                        src/renderer/src/pages/library/LibraryFilters.tsx:5:53         
applyDamageToToken                  src/renderer/src/services/combat/attack-resolver.ts:36:30      
buildAttackSummary                  src/renderer/src/services/combat/attack-resolver.ts:36:50      
doubleDiceInFormula                 src/renderer/src/services/combat/attack-resolver.ts:36:70      
rollDamage                          src/renderer/src/services/combat/attack-resolver.ts:36:91      
resolveUnarmedStrikeBase            src/renderer/src/services/combat/attack-resolver.ts:39:10      
resolveUnarmedStrike      function  src/renderer/src/services/combat/attack-resolver.ts:141:17     
shouldTriggerLairAction             src/renderer/src/services/combat/combat-resolver.ts:47:10      
spendLegendaryAction                src/renderer/src/services/combat/combat-resolver.ts:47:35      
useLegendaryResistance              src/renderer/src/services/combat/combat-resolver.ts:47:57      
resolveAttack             function  src/renderer/src/services/combat/combat-resolver.ts:304:17     
resolveSavingThrow        function  src/renderer/src/services/combat/combat-resolver.ts:593:17     
applyDamageToToken                  src/renderer/src/services/combat/damage-resolver.ts:41:3       
buildAttackSummary                  src/renderer/src/services/combat/damage-resolver.ts:42:3       
doubleDiceInFormula                 src/renderer/src/services/combat/damage-resolver.ts:43:3       
resolveUnarmedStrike                src/renderer/src/services/combat/damage-resolver.ts:44:3       
resolveUnarmedStrikeBase            src/renderer/src/services/combat/damage-resolver.ts:45:3       
rollDamage                          src/renderer/src/services/combat/damage-resolver.ts:46:3       
resolveSavingThrow                  src/renderer/src/services/combat/damage-resolver.ts:51:3       
shouldTriggerLairAction             src/renderer/src/services/combat/damage-resolver.ts:53:3       
spendLegendaryAction                src/renderer/src/services/combat/damage-resolver.ts:54:3       
useLegendaryResistance              src/renderer/src/services/combat/damage-resolver.ts:55:3       
getEffectiveSpeed                   src/renderer/src/services/combat/damage-resolver.ts:59:10      
isConnected                         src/renderer/src/network/index.ts:5:3                          
getConnectedPeers                   src/renderer/src/network/index.ts:19:3                         
getInviteCode                       src/renderer/src/network/index.ts:20:3                         
isHosting                           src/renderer/src/network/index.ts:22:3                         
createMessageRouter                 src/renderer/src/network/index.ts:37:10                        
createPeer                          src/renderer/src/network/index.ts:40:3                         
destroyPeer                         src/renderer/src/network/index.ts:41:3                         
generateInviteCode                  src/renderer/src/network/index.ts:42:3                         
getPeer                             src/renderer/src/network/index.ts:44:3                         
validateNetworkMessage              src/renderer/src/network/index.ts:53:75                        
GAME_SYSTEMS                        src/renderer/src/types/index.ts:17:10                          
formatBytes               function  src/renderer/src/components/ui/OllamaModelList.tsx:42:17       
timeAgo                   function  src/renderer/src/componen
```

#### 16. Outdated packages
**Status**: ℹ️ INFO  
**Issues**: 2

```
 @biomejs/biome   ^2.4.4  →   ^2.4.5
 oxlint          ^1.50.0  →  ^1.51.0
```

#### 17. License compliance
**Status**: ✅ PASS  
**Issues**: 0

```
No copyleft licenses in production deps
```

#### 18. Unused exports (ts-prune)
**Status**: ✅ PASS  
**Issues**: 0

```
No unused exports
```

#### 19. Duplicate packages
**Status**: ✅ PASS  
**Issues**: 50

```
50 packages with multiple versions installed
@anthropic-ai/sdk: 0.78.0, 0.74.0
tslib: 2.8.1, 1.14.1
@smithy/util-utf8: 2.3.0, 4.2.1
@smithy/util-buffer-from: 2.2.0, 4.2.1
@smithy/is-array-buffer: 2.2.0, 4.2.1
ansi-styles: 5.2.0, 4.3.0, 6.2.3
p-queue: 6.6.2, 9.1.0
uuid: 10.0.0, 11.1.0, 13.0.0
eventemitter3: 4.0.7, 5.0.4
p-timeout: 3.2.0, 7.0.1
argparse: 2.0.1, 1.0.10
@types/node: 25.3.3, 24.11.0
undici-types: 7.18.2, 7.16.0
js-tokens: 4.0.0, 10.0.0
lru-cache: 5.1.1, 10.4.3, 6.0.0
yallist: 3.1.1, 4.0.0, 5.0.0
debug: 4.4.3, 3.2.7
estree-walker: 3.0.3, 2.0.2
ajv: 8.18.0, 6.14.0
json-schema-traverse: 1.0.0, 0.4.1
dotenv: 17.3.1, 16.6.1
glob: 7.2.3, 10.5.0
@electron/get: 3.1.0, 2.0.3
isbinaryfile: 4.0.10, 5.0.7
minipass: 7.1.3, 3.3.6
signal-exit: 4.1.0, 3.0.7
emoji-regex: 8.0.0, 9.2.2, 10.6.0
strip-ansi: 6.0.1, 7.2.0
string-width: 5.1.2, 4.2.3, 7.2.0
ansi-regex: 5.0.1, 6.2.2
```

### React & Hooks

#### 20. React hooks lint (OxLint)
**Status**: ⚠️ WARN  
**Issues**: 3

```

  ! eslint(no-unused-vars): Variable 'bg' is declared but never used. Unused variables should start with a '_'.
     ,-[src/renderer/src/systems/dnd5e/index.ts:138:13]
 137 |       const backgrounds = await load5eBackgrounds()
 138 |       const bg = backgrounds.find((b) => b.id === backgroundId)
     :             ^|
     :              `-- 'bg' is declared here
 139 |       const gold = 10
     `----
  help: Consider removing this declaration.

  ! eslint(no-unused-vars): Type 'SpeciesTrait' is imported but never used.
    ,-[src/renderer/src/services/data-provider.ts:50:3]
 49 |   SpeciesSpellsFile,
 50 |   SpeciesTrait,
    :   ^^^^^^|^^^^^
    :         `-- 'SpeciesTrait' is imported here
 51 |   SpellData,
    `----
  help: Consider removing this import.

  ! eslint(no-unused-vars): Variable 'basePath' is declared but never used. Unused variables should start with a '_'.
     ,-[src/renderer/src/services/data-provider.ts:459:9]
 458 |   const index = await loadJson<IndexEntry[]>(indexPath)
 459 |   const basePath = indexPath.substring(0, indexPath.lastIndexOf('/') + 1).replace('./data/5e/', '')
     :         ^^^^|^^^
     :             `-- 'basePath' is declared here
 460 |   const results = await Promise.all(
     `----
  help: Consider removing this declaration.

Found 3 warnings and 0 errors.
Finished in 119ms on 1324 files with 93 rules using 22 threads.

```

#### 21. Missing export default on lazy components
**Status**: ✅ PASS  
**Issues**: 0

```
All 15 lazy components have default exports
```

#### 22. Missing key prop in .map()
**Status**: ✅ PASS  
**Issues**: 0

```
All .map() calls appear to have key props
```

### Code Quality

#### 23. CRLF line endings
**Status**: ✅ PASS  
**Issues**: 0

```
All files use LF
```

#### 24. console.log leaks
**Status**: ✅ PASS  
**Issues**: 1

```
src/renderer/src/services/combat/combat-resolver.ts:883 — console.warn(
```

#### 25. TODO/FIXME/HACK count
**Status**: ✅ PASS  
**Issues**: 0

```
No developer notes
```

#### 26. Large files (>1000 lines)
**Status**: ✅ PASS  
**Issues**: 4

```
src/renderer/src/components/game/modals/mechanics/DowntimeModal.tsx — 1111 lines
src/renderer/src/pages/SettingsPage.tsx — 1029 lines
src/renderer/src/services/json-schema.test.ts — 1028 lines
src/renderer/src/services/data-provider.ts — 1016 lines
```

#### 27. `any` type usage
**Status**: ✅ PASS  
**Issues**: 0

```
No `any` usage
```

#### 28. Empty catch blocks
**Status**: ✅ PASS  
**Issues**: 0

```
No empty catch blocks
```

#### 29. Functions >200 lines
**Status**: ✅ PASS  
**Issues**: 43

```
src/renderer/src/stores/builder/slices/build-character-5e.ts:41 — buildCharacter5e (617 lines)
src/renderer/src/pages/SettingsPage.tsx:427 — SettingsPage (602 lines)
src/renderer/src/components/builder/5e/SpellsTab5e.tsx:17 — SpellsTab5e (471 lines)
src/renderer/src/components/builder/5e/CharacterBuilder5e.tsx:20 — CharacterBuilder5e (453 lines)
src/renderer/src/pages/CharacterSheet5ePage.tsx:35 — CharacterSheet5ePage (414 lines)
src/renderer/src/components/campaign/CampaignWizard.tsx:39 — CampaignWizard (383 lines)
src/renderer/src/pages/BastionPage.tsx:30 — BastionPage (379 lines)
src/renderer/src/components/ui/OllamaManagement.tsx:22 — OllamaManagement (370 lines)
src/renderer/src/stores/network-store/client-handlers.ts:85 — handleClientMessage (370 lines)
src/main/ipc/ai-handlers.ts:65 — registerAiHandlers (368 lines)
src/renderer/src/components/builder/shared/AsiModal.tsx:10 — AsiModal (359 lines)
src/renderer/src/components/game/bottom/DMAudioPanel.tsx:41 — DMAudioPanel (352 lines)
src/renderer/src/services/io/import-foundry.ts:104 — importFoundryCharacter (347 lines)
src/renderer/src/components/builder/5e/SpecialAbilitiesTab5e.tsx:32 — SpecialAbilitiesTab5e (340 lines)
src/renderer/src/stores/network-store/host-handlers.ts:32 — handleHostMessage (335 lines)
src/renderer/src/pages/AboutPage.tsx:48 — AboutPage (333 lines)
src/renderer/src/components/game/player/ShopView.tsx:94 — ShopView (330 lines)
src/renderer/src/components/builder/5e/DetailsTab5e.tsx:10 — DetailsTab5e (316 lines)
src/renderer/src/pages/LibraryPage.tsx:22 — LibraryPage (311 lines)
src/renderer/src/components/game/modals/utility/WeatherOverridePanel.tsx:50 — WeatherOverridePanel (307 lines)
src/renderer/src/components/builder/shared/AbilityScoreModal.tsx:16 — AbilityScoreModal (300 lines)
src/renderer/src/stores/use-ai-dm-store.ts:106 — useAiDmStore (291 lines)
src/renderer/src/pages/ViewCharactersPage.tsx:22 — ViewCharactersPage (289 lines)
src/renderer/src/pages/LobbyPage.tsx:16 — LobbyPage (287 lines)
src/renderer/src/stores/builder/slices/load-character-5e.ts:12 — loadCharacterForEdit5e (286 lines)
src/renderer/src/components/lobby/ChatInput.tsx:15 — ChatInput (285 lines)
src/renderer/src/pages/CampaignDetailPage.tsx:28 — CampaignDetailPage (285 lines)
src/renderer/src/services/combat/combat-resolver.ts:304 — resolveAttack (285 lines)
src/renderer/src/pages/CalendarPage.tsx:53 — CalendarPage (276 lines)
src/renderer/src/stores/level-up/feature-selection-slice.ts:10 — createFeatureSelectionSlice (266 lines)
src/renderer/src/services/library-service.ts:150 — loadCategoryItems (256 lines)
src/renderer/src/stores/use-lobby-store.ts:78 — useLobbyStore (253 lines)
src/renderer/src/stores/network-store/index.ts:34 — useNetworkStore (249 lines)
src/main/ipc/storage-handlers.ts:39 — registerStorageHandlers (243 lines)
src/renderer/src/App.tsx:36 — App (240 lines)
src/main/ai/campaign-context.ts:11 — formatCampaignForContext (236 lines)
src/renderer/src/services/combat/effect-resolver-5e.ts:103 — resolveEffects (236 lines)
src/renderer/src/pages/InGamePage.tsx:14 — InGamePage (227 lines)
src/renderer/src/pages/JoinGamePage.tsx:8 — JoinGamePage (217 lines)
src/renderer/src/stores/level-up/index.ts:16 — useLevelUpStore (209 lines)
src/renderer/src/components/builder/5e/CharacterSummaryBar5e.tsx:120 — CharacterSummaryBar5e (208 lines)
src/renderer/src/components/game/dm/DMNotepad.tsx:6 — DMNotepad (202 lines)
src/renderer/src/components/game/map/map-event-handlers.ts:162 — setupMouseHandlers (202 lines)
```

#### 30. Code duplication (jscpd)
**Status**: ✅ PASS  
**Issues**: 639

```
──────────[39m[90m┬────────────────[39m[90m┬─────────────[39m[90m┬──────────────[39m[90m┬──────────────[39m[90m┬──────────────────[39m[90m┬───────────────────┐[39m
[90m│[39m[31m Format     [39m[90m│[39m[31m Files analyzed [39m[90m│[39m[31m Total lines [39m[90m│[39m[31m Total tokens [39m[90m│[39m[31m Clones found [39m[90m│[39m[31m Duplicated lines [39m[90m│[39m[31m Duplicated tokens [39m[90m│[39m
[90m├────────────[39m[90m┼────────────────[39m[90m┼─────────────[39m[90m┼──────────────[39m[90m┼──────────────[39m[90m┼──────────────────[39m[90m┼───────────────────┤[39m
[90m│[39m typescript [90m│[39m 705            [90m│[39m 121346      [90m│[39m 1173311      [90m│[39m 507          [90m│[39m 7497 (6.18%)     [90m│[39m 79429 (6.77%)     [90m│[39m
[90m├────────────[39m[90m┼────────────────[39m[90m┼─────────────[39m[90m┼──────────────[39m[90m┼──────────────[39m[90m┼──────────────────[39m[90m┼───────────────────┤[39m
[90m│[39m javascript [90m│[39m 335            [90m│[39m 36527       [90m│[39m 322599       [90m│[39m 6            [90m│[39m 181 (0.5%)       [90m│[39m 1479 (0.46%)      [90m│[39m
[90m├────────────[39m[90m┼────────────────[39m[90m┼─────────────[39m[90m┼──────────────[39m[90m┼──────────────[39m[90m┼──────────────────[39m[90m┼───────────────────┤[39m
[90m│[39m tsx        [90m│[39m 612            [90m│[39m 71093       [90m│[39m 663549       [90m│[39m 126          [90m│[39m 1316 (1.85%)     [90m│[39m 13621 (2.05%)     [90m│[39m
[90m├────────────[39m[90m┼────────────────[39m[90m┼─────────────[39m[90m┼──────────────[39m[90m┼──────────────[39m[90m┼──────────────────[39m[90m┼───────────────────┤[39m
[90m│[39m css        [90m│[39m 1              [90m│[39m 61          [90m│[39m 290          [90m│[39m 0            [90m│[39m 0 (0%)           [90m│[39m 0 (0%)            [90m│[39m
[90m├────────────[39m[90m┼────────────────[39m[90m┼─────────────[39m[90m┼──────────────[39m[90m┼──────────────[39m[90m┼──────────────────[39m[90m┼───────────────────┤[39m
[90m│[39m json       [90m│[39m 3              [90m│[39m 161         [90m│[39m 755          [90m│[39m 0            [90m│[39m 0 (0%)           [90m│[39m 0 (0%)            [90m│[39m
[90m├────────────[39m[90m┼────────────────[39m[90m┼─────────────[39m[90m┼──────────────[39m[90m┼──────────────[39m[90m┼──────────────────[39m[90m┼───────────────────┤[39m
[90m│[39m [1mTotal:[22m     [90m│[39m 1656           [90m│[39m 229188      [90m│[39m 2160504      [90m│[39m 639          [90m│[39m 8994 (3.92%)     [90m│[39m 94529 (4.38%)     [90m│[39m
[90m└────────────[39m[90m┴────────────────[39m[90m┴─────────────[39m[90m┴──────────────[39m[90m┴──────────────[39m[90m┴──────────────────[39m[90m┴───────────────────┘[39m
[90mFound 639 clones.[39m
[3m[90mDetection time:[39m[23m: 1:08.360 (m:ss.mmm)

```

#### 31. Regex safety (ReDoS)
**Status**: ✅ PASS  
**Issues**: 0

```
No ReDoS-prone patterns found
```

### Project Hygiene

#### 32. Git status (uncommitted changes)
**Status**: ℹ️ INFO  
**Issues**: 39

```
 D CLAUDE.md
 D src/renderer/public/data/5e/character/backgrounds.json
 D src/renderer/public/data/5e/character/classes.json
 D src/renderer/public/data/5e/character/feats.json
 D src/renderer/public/data/5e/character/species-traits.json
 D src/renderer/public/data/5e/character/species.json
 M src/renderer/src/components/builder/5e/BackstoryEditor5e.tsx
 M src/renderer/src/components/builder/5e/CharacterBuilder5e.tsx
 M src/renderer/src/components/builder/5e/CharacterSummaryBar5e.tsx
 M src/renderer/src/components/builder/5e/DetailsTab5e.tsx
 M src/renderer/src/components/builder/5e/GearTab5e.tsx
 M src/renderer/src/components/builder/5e/SpecialAbilitiesTab5e.tsx
 M src/renderer/src/components/builder/shared/AsiModal.tsx
 M src/renderer/src/components/game/modals/utility/CompendiumModal.tsx
 M src/renderer/src/components/levelup/5e/AsiSelector5e.tsx
 M src/renderer/src/components/levelup/5e/FeatSelector5e.tsx
 M src/renderer/src/components/library/LibraryDetailModal.tsx
 M src/renderer/src/components/sheet/5e/FeatureCard5e.tsx
 M src/renderer/src/components/sheet/5e/FeaturesSection5e.tsx
 M src/renderer/src/services/character/stat-calculator-5e.ts
 M src/renderer/src/services/data-paths.test.ts
 M src/renderer/src/services/data-paths.ts
 M src/renderer/src/services/data-provider.ts
 M src/renderer/src/services/json-schema.test.ts
 M src/renderer/src/services/library-service.ts
 M src/renderer/src/stores/builder/slices/build-character-5e.ts
 M src/renderer/src/stores/builder/slices/builder-spells.ts
 M src/renderer/src/stores/builder/slices/character-details-slice.ts
 M src/renderer/src/stores/builder/slices/load-character-5e.ts
 M src/renderer/src/stores/builder/slices/selection-slice.ts
```

#### 33. File naming conventions
**Status**: ✅ PASS  
**Issues**: 0

```
All files follow naming conventions
```

#### 34. Missing test files
**Status**: ✅ PASS  
**Issues**: 7

```
7 source files without test counterpart
src/renderer/src/components/sheet/5e/defense-utils.ts
src/renderer/src/components/sheet/5e/equipment-utils.ts
src/renderer/src/pages/bastion/bastion-constants.ts
src/renderer/src/pages/bastion/bastion-modal-types.ts
src/renderer/src/pages/library/library-constants.ts
src/renderer/src/test-helpers.ts
src/shared/constants.ts
```

#### 35. Orphan files (not imported)
**Status**: ✅ PASS  
**Issues**: 0

```
No orphan files
```

#### 36. Type coverage %
**Status**: ✅ PASS  
**Issues**: 0

```
Type coverage: 99.26%
(290882 / 293041) 99.26%
type-coverage success.

```

---

## Recommendations

1. **[HIGH]** Review: Biome lint (3 issues)
1. **[HIGH]** Review: Biome format check (0 issues)
1. **[HIGH]** Review: OxLint (3 issues)
1. **[HIGH]** Review: Dead code (knip) (110 issues)
1. **[LOW]** Consider: Outdated packages (2 items)
1. **[HIGH]** Review: React hooks lint (OxLint) (3 issues)
1. **[LOW]** Consider: Git status (uncommitted changes) (39 items)

---

## Quick Fix Reference

- **Check 2** (Biome lint): Run `npx biome check --write src/` to auto-fix lint issues.
- **Check 3** (Biome format check): Run `npx biome format --write src/` to fix formatting.
- **Check 7** (OxLint): Run `npx oxlint src/` and fix reported issues. Prefix unused vars with `_`.

---

## Dead Code Verdict

**Knip baseline**: ~394 items (10 unused files, 138 unused exports, 246 unused exported types)
**After triage**: ~80% are PLANNED public API surface or cross-process types; ~15% are dead barrel re-exports; ~5% are genuinely dead code.

### Unused Files (10)

| File | Verdict | Reason |
|------|---------|--------|
| `constants/index.ts` | DEAD | Barrel file — all imports go directly to subfiles |
| `network/index.ts` | DEAD | Barrel file — all imports go directly to subfiles |
| `types/index.ts` | DEAD | Barrel file — all imports go directly to subfiles |
| `types/user.ts` | DEAD | UserProfile interface never used anywhere |
| `components/library/index.ts` | WIP | Barrel for library sub-component redesign |
| `components/library/HomebrewCreateModal.tsx` | WIP | Homebrew content creator, awaiting library page integration |
| `components/library/LibraryCategoryGrid.tsx` | WIP | Category grid view, awaiting library page integration |
| `components/library/LibraryDetailModal.tsx` | WIP | Detail viewer, awaiting library page integration |
| `components/library/LibraryItemList.tsx` | WIP | Item list component, awaiting library page integration |
| `components/library/LibrarySidebar.tsx` | WIP | Sidebar navigation, awaiting library page integration |

### Unused Exports — PLANNED: Public API Surface (98 items)

Exported functions/constants that form module public APIs, consumed via dynamic dispatch, or planned for future consumers.

| Category | Count | Examples |
|----------|-------|---------|
| Data provider loaders (`load5e*`) | 21 | `load5eSoundEvents`, `load5eThemes`, `load5eBuiltInMaps` |
| Bastion event data tables | 12 | `ALL_IS_WELL_FLAVORS`, `GAMING_HALL_WINNINGS`, `FORGE_CONSTRUCTS` |
| Sound manager functions | 8 | `registerCustomSound`, `playSpellSound`, `preloadEssential` |
| Combat resolver functions | 7 | `resolveAttack`, `resolveGrapple`, `resolveShove` |
| Notification service functions | 5 | `notify`, `setEventEnabled`, `setSoundEnabled` |
| AI service functions | 4 | `generateSessionSummary`, `describeChange`, `getSearchEngine` |
| Character/spell data | 6 | `SPELLCASTING_ABILITY_MAP`, `getSpellcastingAbility` |
| Other (network, plugin, theme, dice, IO) | 35 | `rollForDm`, `importDndBeyondCharacter`, `announce` |

### Unused Exports — DEAD: Barrel Re-exports (28 items)

Re-exports from barrel `index.ts` files that nothing imports from:

| Barrel File | Dead Re-exports |
|-------------|----------------|
| `lobby/index.ts` | CharacterSelector, ChatInput, ChatPanel, PlayerCard, PlayerList, ReadyButton (6) |
| `campaign/index.ts` | AdventureSelector, AudioStep, DetailsStep, MapConfigStep, ReviewStep, RulesStep, SystemStep (7) |
| `game/player/index.ts` | CharacterMiniSheet, ConditionTracker, PlayerHUD, ShopView, SpellSlotTracker (5) |
| `game/dm/index.ts` | MonsterStatBlockView (1) |
| `ui/index.ts` | EmptyState, Skeleton (2) |
| Other barrels | AsiSelector5e, GeneralFeatPicker, ReviewStep default, RulesStep default, etc. (7) |

### Unused Exports — DEAD: Genuinely Unused Code (12 items)

| Export | File | Reason |
|--------|------|--------|
| `_createSolidMaterial` | dice-textures.ts | Internal helper never called |
| `RECONNECT_DELAY_MS` | app-constants.ts | Constant defined but never referenced |
| `MAX_READ_FILE_SIZE` | app-constants.ts | Constant defined but never referenced |
| `MAX_WRITE_CONTENT_SIZE` | app-constants.ts | Constant defined but never referenced |
| `LIFESTYLE_COSTS` | stat-calculator-5e.ts | Data constant, never referenced |
| `TOOL_SKILL_INTERACTIONS` | stat-calculator-5e.ts | Data constant, never referenced |
| `resolveDataPath` | data-provider.ts | Helper function, superseded |
| `cdnProvider` | data-provider.ts | CDN provider object, not yet wired |
| `meetsPrerequisites` | LevelUpConfirm5e.tsx | Helper function, not imported elsewhere |
| `SummaryCard` | BastionTabs.tsx | Sub-component re-export, not consumed |
| `GeneralFeatPicker` | AsiSelector5e.tsx | Sub-component, only via unused barrel |
| `AsiAbilityPicker5e` | AsiSelector5e.tsx | Sub-component, only via unused barrel |

### Unused Exported Types (246 items) — PLANNED

Public API type definitions following standard TypeScript export patterns:

| Category | Count | Verdict |
|----------|-------|---------|
| Network payload types (`types.ts` + `message-types.ts`) | 62 | PLANNED — consumed via switch/case dispatch |
| Data schema types (character, spell, equipment, world) | 45 | PLANNED — JSON data file shape definitions |
| Combat/game mechanic types | 30 | PLANNED — public API contracts |
| Cross-process IPC types (main/renderer) | 18 | PLANNED — invisible to knip across Electron processes |
| Service/store state types | 25 | PLANNED — Zustand store shape exports |
| Calendar/weather/map types | 15 | PLANNED — service contracts |
| IO/plugin/dice types | 15 | PLANNED — module contracts |
| Barrel re-export types (`data/index.ts`, etc.) | 20 | DEAD — from unused barrel files |
| Bastion event + misc types | 16 | PLANNED — bastion event system + misc |

### Previously Triaged (from orphan analysis)

| File | Status | Verdict | Reason |
|------|--------|---------|--------|
| CombatLogPanel.tsx | Orphan | WIP | Fully implemented, awaiting sidebar integration |
| JournalPanel.tsx | Orphan | WIP | TipTap journal, awaiting sidebar integration |
| sentient-items.ts | Unused | PLANNED | DMG 2024 sentient item generation framework |
| RollRequestOverlay.tsx | Orphan | WIP | DM roll request overlay, awaiting P2P wiring |
| ThemeSelector.tsx | Orphan | WIP | Theme picker, awaiting settings integration |
| PrintSheet.tsx | Orphan | WIP | Print-ready character sheet layout |
| cloud-sync.ts | Untracked | PLANNED | S3 cloud backup/sync infrastructure |
| cdn-provider.ts | Untracked | PLANNED | CDN provider for game data/images |

---

## Automation Scripts (Tests/)

| Script | Purpose | Usage |
|--------|---------|-------|
| `run-audit.js` | Master audit — runs all checks, generates this report | `node Tests/run-audit.js` |
| `electron-security.js` | Electron security scan (CSP, sandbox, etc.) | Called by run-audit.js check #10 |
| `rename-to-kebab.js` | Rename camelCase files to kebab-case + update imports | `node Tests/rename-to-kebab.js [--dry-run]` |
| `replace-console-logs.js` | Replace console.* with structured logger | `node Tests/replace-console-logs.js [--dry-run|--count]` |

All scripts are modular and export reusable functions for programmatic use.

---

## Remaining Implementation Work

Items are automatically removed from this list when their completion criteria are met.

### 7a. Split GameLayout.tsx
Current size: 946 lines
Extract from `src/renderer/src/components/game/GameLayout.tsx`:
1. `GameModalDispatcher.tsx` — all lazy modal imports + render logic
2. `hooks/use-game-network.ts` — host/client network message handlers
3. `hooks/use-game-sound.ts` — sound event mapping
4. `hooks/use-token-movement.ts` — drag/drop/pathfinding handlers
**Pattern**: Extract custom hooks and sub-components, keep GameLayout as orchestrator.

### 7c. Split remaining large files (>1000 lines)
Apply the same extraction pattern to these files:
| File | Lines | Suggested Split |
|------|-------|----------------|
| DowntimeModal.tsx | 1111 | Extract sub-components / helpers |
| SettingsPage.tsx | 1029 | Extract sub-components / helpers |
| data-provider.ts | 1016 | Extract sub-components / helpers |



---

## AI Prompting Quick Reference

Copy-pasteable prompts for an AI agent to fix common issues:

### Split large files
```
Follow the patterns in stores/game/ (Zustand slices) and
services/game-actions/ (action sub-modules). Extract sub-components,
hooks, or helper modules into new files.
```

### Split GameLayout.tsx
```
Extract from GameLayout.tsx: (1) GameModalDispatcher.tsx with all 46 lazy modal
imports, (2) hooks/use-game-network.ts with host/client message handlers,
(3) hooks/use-game-sound.ts with sound event mapping, (4) hooks/use-token-movement.ts.
Keep GameLayout.tsx as the orchestrator that imports these sub-modules.
```

### Split CampaignDetailPage.tsx
```
Extract from CampaignDetailPage.tsx into pages/campaign-detail/ directory:
NPCManager.tsx, RuleManager.tsx, LoreManager.tsx, AdventureWizard.tsx, MonsterLinker.tsx.
Each manager is a self-contained React component with its own local state.
```

### Wire orphan WIP components
```
Integrate these completed but unused components: CombatLogPanel.tsx and
JournalPanel.tsx into game sidebar tabs, RollRequestOverlay.tsx to P2P
"dm:roll-request" message type, ThemeSelector.tsx to SettingsDropdown.tsx,
PrintSheet.tsx to character sheet header.
```