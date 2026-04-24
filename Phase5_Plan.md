# SYSTEM OVERRIDE: IMPLEMENTATION MODE
You are Claude Opus 4.6 Max. Your job is to execute the following architectural plan for Phase 5 of the D&D VTT project.

Phase 5 covers the **Library System** — content browsing, search, stat block rendering, and integration with game components. The audit found solid content coverage (391 spells, 563 monsters, all classes/subclasses/backgrounds/feats) but identified **three critical gaps**: no drag-and-drop from library to game, no visual stat block rendering in the library, and no content linking system.

---

## 🏗️ Architecture & Environment Split

### Windows 11 Machine (`C:\Users\evilp\dnd\`) — ALL WORK IS HERE

Phase 5 is entirely client-side. No Raspberry Pi involvement.

**CORRECTION FROM PHASE 1 AUDIT:** The Phase 1 audit claimed library redesign components were "WIP and awaiting library page integration." This is WRONG — `LibraryPage.tsx` already imports and uses all library components (LibraryCategoryGrid, LibraryDetailModal, LibraryItemList, LibrarySidebar, HomebrewCreateModal, CoreBooksGrid, LibraryFilterBar, PdfViewer). They ARE integrated.

**Library Page & Components:**

| File | Role |
|------|------|
| `src/renderer/src/pages/LibraryPage.tsx` | Main library page — uses Fuse.js for search, renders sidebar + grid/list + detail modal |
| `src/renderer/src/components/library/LibrarySidebar.tsx` | Category navigation sidebar |
| `src/renderer/src/components/library/LibraryCategoryGrid.tsx` | Grid view of items in a category |
| `src/renderer/src/components/library/LibraryItemList.tsx` | List view of items — NO drag-and-drop |
| `src/renderer/src/components/library/LibraryDetailModal.tsx` | Item detail view — uses generic key-value rendering, NOT visual stat blocks |
| `src/renderer/src/components/library/LibraryFilterBar.tsx` | Search and filter controls |
| `src/renderer/src/components/library/HomebrewCreateModal.tsx` | Homebrew content creation |
| `src/renderer/src/components/library/CoreBooksGrid.tsx` | Core book reference grid |
| `src/renderer/src/components/library/PdfViewer.tsx` | PDF viewer for reference books |
| `src/renderer/src/components/library/AudioPlayerItem.tsx` | Audio playback item |
| `src/renderer/src/components/library/ImagePreviewItem.tsx` | Image preview item |
| `src/renderer/src/components/library/index.ts` | Barrel export |

**In-Game Compendium:**

| File | Role |
|------|------|
| `src/renderer/src/components/game/modals/utility/CompendiumModal.tsx` | In-game reference modal — uses `.includes()` search (NOT Fuse.js), NO drag-and-drop |

**Monster Stat Block (exists but NOT used in library):**

| File | Role |
|------|------|
| `src/renderer/src/components/game/dm/MonsterStatBlockView.tsx` | Formatted D&D-style stat block — only used in `CreatureModal.tsx` and `TokenPlacer.tsx` |

**Search & Data:**

| File | Role |
|------|------|
| `src/renderer/src/services/library-service.ts` | Library data loading + Fuse.js search via `searchAllCategories` (line ~1084) |
| `src/renderer/src/services/data-provider.ts` | Game data loading — monster search uses `.includes()` (lines 469-479), NO Fuse.js |
| `src/renderer/src/stores/library-store.ts` | Library state (category, search, favorites, recently viewed, homebrew) |

**Existing Drag-and-Drop in the App (NOT in library):**

| File | What |
|------|------|
| `src/renderer/src/components/game/dm/InitiativeTracker.tsx` | Initiative entry reordering |
| `src/renderer/src/components/game/Hotbar.tsx` | Hotbar slot drag |
| Map config steps | Audio/image file drops |

**Content Data:**
- Spells: `src/renderer/public/data/5e/spells/` — 391 individual JSON files, aggregated in `spells.json`
- Monsters: `src/renderer/public/data/5e/dm/npcs/monsters/` — 563 individual JSON files, aggregated in `monsters.json`
- Equipment: `src/renderer/public/data/5e/equipment/`
- Classes: `src/renderer/public/data/5e/classes/`
- Feats: `src/renderer/public/data/5e/feats/`

### Raspberry Pi (`patrick@bmo`) — NO WORK THIS PHASE

---

## 📋 Core Objectives & Corrections

### CRITICAL: Drag-and-Drop System

Complete absence of drag-and-drop between library and game. Need to implement:
1. Drag monsters from library → map (spawn token)
2. Drag spells from library → character sheet (add to prepared)
3. Drag items from library → character inventory (add equipment)
4. Drag monsters from library → initiative tracker (add to combat)

### CRITICAL: Visual Stat Block Rendering in Library

`LibraryDetailModal` renders monster data as generic key-value pairs. `MonsterStatBlockView` already exists and renders proper D&D-style stat blocks — but it's only used in `CreatureModal` and `TokenPlacer`, NOT in the library. Need to integrate.

### HIGH: Content Linking System

No way to link/reference library items from game entities. Need a linking mechanism so characters can reference library spells, encounters can reference library monsters, etc.

### MEDIUM: Search Improvements

- CompendiumModal uses basic `.includes()` instead of Fuse.js
- No tag-based search
- No advanced search operators
- Basic filter options

### LOW: Content Coverage

- Some PHB2024 spells potentially missing
- No MM2025 monster content
- Rules not centralized

---

## 🛠️ Step-by-Step Execution Plan

### Sub-Phase A: Drag-and-Drop Infrastructure

**Step 1 — Create Drag-and-Drop Context/Types**
- Create a shared drag-and-drop type system:
  ```typescript
  // In a new file or shared types
  export type LibraryDragType =
    | 'library-monster'
    | 'library-spell'
    | 'library-item'
    | 'library-equipment'

  export interface LibraryDragData {
    type: LibraryDragType
    itemId: string
    itemName: string
    itemData: Record<string, unknown>
  }
  ```
- Use the HTML5 Drag and Drop API (already used elsewhere in the app — see InitiativeTracker, Hotbar patterns)
- Create a custom hook `useLibraryDrag` that wraps drag start/end logic

**Step 2 — Make Library Items Draggable**
- Open `src/renderer/src/components/library/LibraryItemList.tsx`
- Add `draggable={true}` to each list item
- Add `onDragStart` handler that serializes the item data:
  ```typescript
  const handleDragStart = (e: React.DragEvent, item: LibraryItem) => {
    const dragData: LibraryDragData = {
      type: getDragTypeForCategory(item.category),
      itemId: item.id,
      itemName: item.name,
      itemData: item
    }
    e.dataTransfer.setData('application/json', JSON.stringify(dragData))
    e.dataTransfer.effectAllowed = 'copy'
  }
  ```
- Add visual drag feedback (ghost image, cursor change)

**Step 3 — Make LibraryDetailModal Items Draggable**
- Open `src/renderer/src/components/library/LibraryDetailModal.tsx`
- Add a drag handle or make the header draggable
- Same serialization pattern as LibraryItemList

**Step 4 — Make CompendiumModal Items Draggable**
- Open `src/renderer/src/components/game/modals/utility/CompendiumModal.tsx`
- Add same draggable behavior to items in the in-game compendium

### Sub-Phase B: Drop Targets

**Step 5 — Map Canvas Drop Target (Monsters)**
- Open `src/renderer/src/components/game/map/MapCanvas.tsx`
- Add `onDragOver` and `onDrop` handlers to the canvas container
- When a `library-monster` is dropped:
  - Calculate grid position from drop coordinates
  - Create a new token from the monster data (name, HP, AC, speed, size)
  - Add token to the current map via game store
  - Use the existing `place_token` or token creation logic
  ```typescript
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const raw = e.dataTransfer.getData('application/json')
    if (!raw) return
    const dragData: LibraryDragData = JSON.parse(raw)
    if (dragData.type === 'library-monster') {
      const gridPos = screenToGrid(e.clientX, e.clientY)
      gameStore.addToken({
        label: dragData.itemName,
        entityType: 'enemy',
        gridX: gridPos.x,
        gridY: gridPos.y,
        currentHP: dragData.itemData.hp,
        maxHP: dragData.itemData.hp,
        ac: dragData.itemData.ac,
        // ... other monster fields
      })
    }
  }
  ```

**Step 6 — Initiative Tracker Drop Target (Monsters)**
- Open `src/renderer/src/components/game/dm/InitiativeTracker.tsx` (already has drag-and-drop for reordering)
- Add a drop zone for `library-monster` type that adds the monster to initiative:
  - Roll initiative for the monster (Dex mod + d20)
  - Insert into the initiative order

**Step 7 — Character Sheet Drop Target (Spells)**
- Find the spell list section on the character sheet
- Add `onDragOver` and `onDrop` for `library-spell` type
- When dropped, add the spell to the character's prepared/known spell list
- Validate: correct class, correct spell level, slot available

**Step 8 — Character Sheet Drop Target (Equipment)**
- Find the equipment/inventory section on the character sheet
- Add `onDragOver` and `onDrop` for `library-item` and `library-equipment` types
- When dropped, add item to character inventory

### Sub-Phase C: Visual Stat Block in Library

**Step 9 — Integrate MonsterStatBlockView Into LibraryDetailModal**
- Open `src/renderer/src/components/library/LibraryDetailModal.tsx`
- When the selected item is a monster (category check), render `MonsterStatBlockView` instead of the generic key-value display:
  ```typescript
  if (item.category === 'monsters' || item.type === 'monster') {
    return <MonsterStatBlockView monster={formatForStatBlock(item)} />
  }
  ```
- Import `MonsterStatBlockView` from `src/renderer/src/components/game/dm/MonsterStatBlockView.tsx`
- May need an adapter function `formatForStatBlock()` to map the library item shape to the stat block component's expected props
- Also add `MonsterStatBlockView` to the CompendiumModal for in-game monster lookups

**Step 10 — Add Spell Card Rendering**
- Create a `SpellCardView` component for formatted spell display:
  - Spell name, level, school
  - Casting time, range, components (V, S, M with material description)
  - Duration, concentration indicator
  - Description text with formatted paragraphs
  - At Higher Levels section
  - Class list
- Use this in `LibraryDetailModal` when the item is a spell

**Step 11 — Add Item Card Rendering**
- Create an `ItemCardView` component for formatted equipment/magic item display:
  - Item name, type, rarity
  - Weight, cost
  - Properties (for weapons: damage, range, mastery, etc.)
  - Description
  - Attunement requirements
- Use in `LibraryDetailModal` for equipment items

### Sub-Phase D: Content Linking System

**Step 12 — Define Content Reference Type**
- Create a content reference system:
  ```typescript
  export interface ContentReference {
    type: 'spell' | 'monster' | 'item' | 'feat' | 'condition' | 'rule'
    id: string
    name: string
    source: string // 'srd', 'phb2024', 'homebrew', etc.
  }
  ```
- This allows any game entity (character, encounter, map) to reference library content by ID

**Step 13 — Inline Content Links in Text**
- Add a text rendering utility that detects `[[Spell Name]]` or `@spell[Fireball]` syntax in description text
- Render these as clickable links that open the item in the library/compendium
- Apply to: monster descriptions, spell descriptions, feat descriptions, journal entries

**Step 14 — Quick Reference Tooltip**
- When hovering over a content link, show a tooltip with the item summary
- For monsters: AC, HP, CR
- For spells: level, school, casting time, brief description
- For items: type, rarity, brief description

### Sub-Phase E: Search Improvements

**Step 15 — Upgrade CompendiumModal Search to Fuse.js**
- Open `src/renderer/src/components/game/modals/utility/CompendiumModal.tsx`
- Replace the `.includes()` search with Fuse.js (already a dependency, used in LibraryPage):
  ```typescript
  import Fuse from 'fuse.js'
  const fuse = new Fuse(items, {
    keys: ['name', 'summary', 'type'],
    threshold: 0.3
  })
  const results = searchTerm ? fuse.search(searchTerm).map(r => r.item) : items
  ```

**Step 16 — Add Tag-Based Search**
- Add a `tags` field to library items (many monster JSONs already have `tags` arrays)
- Update Fuse.js search keys to include tags
- Add tag filter chips in the filter bar for quick category refinement
- Common tags: school (for spells), creature type (for monsters), rarity (for items), source book

**Step 17 — Add Filter Improvements**
- Open `src/renderer/src/components/library/LibraryFilterBar.tsx`
- Add filter options:
  - Spells: by level (0-9), school, ritual, concentration, class
  - Monsters: by CR range, type, size, environment
  - Items: by rarity, type, attunement
  - Equipment: by type (weapon/armor/tool), properties
- Use multi-select dropdowns or chip selectors

### Sub-Phase F: Content Coverage Gaps

**Step 18 — Audit PHB2024 Spell Coverage**
- Compare the 391 spells against the complete PHB2024 spell list
- Identify specifically which spells are missing
- Note: "Absorb Elements" and "Catnap" are from Xanathar's Guide, NOT PHB2024. The audit may be wrong about these being PHB2024 spells. Verify before adding.
- Add any genuinely missing PHB2024 spells as JSON files in `src/renderer/public/data/5e/spells/`
- Update `spells.json` aggregate

**Step 19 — Centralize Rules Reference**
- Create `src/renderer/public/data/5e/rules/` directory structure:
  ```
  rules/
    ability-checks.json
    combat.json
    conditions.json
    movement.json
    spellcasting.json
    resting.json
    death-saves.json
  ```
- Aggregate existing rule text from scattered locations
- Add as a "Rules" category in the library sidebar

---

## ⚠️ Constraints & Edge Cases

### Drag-and-Drop
- **PixiJS canvas**: The map canvas uses PixiJS which has its own event system. The HTML5 drag-and-drop events must be handled on the DOM wrapper element AROUND the PixiJS canvas, then coordinates translated to grid positions. Do NOT try to add HTML drag events inside PixiJS.
- **Cross-modal drag**: Dragging from `LibraryDetailModal` (which is a modal overlay) to the map underneath requires the modal to NOT block pointer events on the canvas. Consider closing the modal on drag start, or using a portal/floating approach.
- **Data transfer size**: `dataTransfer.setData` has browser limits. For large monster stat blocks, transfer only the ID and name, then look up full data from the data provider on drop.
- **Drag cursor feedback**: Set appropriate `effectAllowed` ('copy' for library items, 'move' for reordering) and drop zone visual indicators (highlight border, ghost token at cursor position).

### Stat Block Rendering
- `MonsterStatBlockView` expects a specific prop shape. The library item data shape may differ. Create an adapter function rather than modifying the stat block component.
- Spell card and item card components should be pure presentational — no game state dependencies. They should work in both the library page and the in-game compendium.

### Content Linking
- Content references must use stable IDs. If spell/monster IDs change between data updates, links break. Use slugified names as IDs (e.g., `fireball`, `ancient-red-dragon`).
- The `[[Spell Name]]` link syntax must not conflict with existing markdown rendering or TipTap editor syntax in the JournalPanel.

### Search Performance
- Fuse.js fuzzy search on 563 monsters + 391 spells + hundreds of items is fine for the library page (loaded once). But the CompendiumModal opens/closes frequently during gameplay — pre-build the Fuse index on first open and cache it.
- Tag-based filtering should use Set intersection for performance, not repeated `.includes()` on arrays.

### Content Coverage
- Do NOT add copyrighted content. Only add spells/monsters that are in the SRD or that the user has licensed data for. The existing content appears to be SRD-compatible — maintain this standard.
- "Absorb Elements" and "Catnap" are from Xanathar's Guide to Everything, NOT the 2024 PHB. Do not add them as "missing PHB2024 content" — the audit was incorrect on this point.

Begin implementation now. Start with Sub-Phase A (Steps 1-4) to build the drag-and-drop infrastructure, then Sub-Phase B (Steps 5-8) for drop targets. The visual stat block integration (Sub-Phase C) is a high-impact quick win — prioritize Step 9 right after drag-and-drop.
