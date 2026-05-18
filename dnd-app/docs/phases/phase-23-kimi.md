# Phase 23: Character Sheets - Kimi K2.5 Analysis

## Executive Summary

The character sheet implementation in this D&D 5e VTT is comprehensive and well-architected but has several areas for improvement related to performance optimization, data binding patterns, and real-time sync edge cases.

---

## 1. UI Organization & Responsiveness

### Structure & Layout

The character sheet is organized in a clean, two-column responsive layout (`CharacterSheet5ePage.tsx`, lines 273-294):

```typescript
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
  <div className="space-y-6">
    <ClassResourcesSection5e character={character} readonly={readonly} />
    <SavingThrowsSection5e character={character} />
    <SkillsSection5e character={character} readonly={readonly} />
    <ConditionsSection5e character={character} readonly={readonly} />
    <FeaturesSection5e character={character} readonly={readonly} />
  </div>
  <div className="space-y-6">
    <OffenseSection5e character={character} readonly={readonly} />
    <DefenseSection5e character={character} readonly={readonly} />
    <SpellcastingSection5e character={character} readonly={readonly} />
    <EquipmentSection5e character={character} readonly={readonly} />
    <CompanionsSection5e character={character} readonly={readonly} />
    <CraftingSection5e character={character} readonly={readonly} />
  </div>
</div>
```

**Strengths:**
- Uses Tailwind's responsive grid (`grid-cols-1 lg:grid-cols-2`) for mobile-friendly layout
- Consistent section wrapper component (`SheetSectionWrapper`) provides collapsible containers
- All sections support `readonly` mode for viewing other players' characters (line 90)
- Toolbar provides quick access to Edit, Short Rest, Long Rest, Level Up, Print, and History functions

**Areas for Improvement:**
- No virtualization for long spell lists or equipment lists - could cause performance issues with 50+ spells
- The sheet uses eager loading for all sections; no lazy loading within the sheet itself (only PrintSheet is lazy-loaded)

---

## 2. Data Field Binding

### Character Store Architecture

Character state is managed via Zustand in `use-character-store.ts` (lines 22-185):

**Key Methods:**
- `saveCharacter()` - Persists to disk via IPC and updates local state (lines 49-80)
- `addCondition()` / `removeCondition()` / `updateConditionValue()` - Condition management (lines 149-184)
- `toggleArmorEquipped()` - Equipment state toggle (lines 129-147)

### Data Flow Pattern

The `useCharacterEditor` hook (`use-character-editor.ts`, lines 10-32) provides a standardized pattern:

```typescript
export function useCharacterEditor(characterId: string) {
  const getLatest = (): Character | undefined =>
    useCharacterStore.getState().characters.find((c) => c.id === characterId)

  const broadcastIfDM = (updated: Character): void => {
    const { role, sendMessage } = useNetworkStore.getState()
    if (role === 'host' && updated.playerId !== 'local') {
      sendMessage('dm:character-update', { characterId: updated.id, characterData: updated, targetPeerId: updated.playerId })
    }
  }

  const saveAndBroadcast = (updated: Character): void => {
    useCharacterStore.getState().saveCharacter(updated)
    broadcastIfDM(updated)
  }
}
```

### Combat Stats Binding (HP, AC, Speed)

**HitPointsBar5e.tsx** (lines 14-155):
- Uses local state for editing (`hpCurrent`, `hpMax`, `hpTemp`) with `useEffect` sync from props (lines 21-29)
- **ISSUE**: Race condition possible - component uses `effectiveCharacter` from props but gets latest from store on save

**AC Calculation** (`CombatStatsBar5e.tsx`, lines 40-71):
- Dynamically calculates AC from equipped armor, shields, feats (Defense Fighting Style, Medium Armor Master, Heavy Armor Master)
- Supports unarmored defense for Barbarian (CON), Monk (WIS), Draconic Sorcerer (CHA)
- Applies magic item effect bonuses via `resolveEffects()` (line 38)

**Speed Calculation** (`CombatStatsBar5e.tsx`, lines 157-213):
- Accounts for: base speed, Speedy feat (+10), Boon of Speed (+30), magic item bonuses
- **GOOD**: Properly applies condition penalties (Grappled/Restrained = 0 speed, Exhaustion = -5 ft per level)

### Skills & Saving Throws

**SkillsSection5e.tsx** (lines 13-61):
- Properly binds to `character.skills` array
- Calculates total modifier: ability mod + proficiency (if proficient) + expertise bonus (if expertise)
- Displays breakdown on expand showing math: "+5 = DEX(+2) + Prof(+3)"

**SavingThrowsSection5e.tsx** (lines 10-42):
- Binds to `character.proficiencies.savingThrows`
- **GOOD**: Implements dynamic proficiency for Rogue's Slippery Mind (WIS/CHA saves at L15+)

### Issues Found:

1. **Stale Data Risk**: Multiple components compute values from props instead of always using `getLatest()` from store
2. **Inconsistent Pattern**: Some components use `useCharacterEditor`, others call store methods directly
3. **No Optimistic Updates**: UI waits for IPC round-trip before reflecting changes

---

## 3. Real-Time Sync

### Sync Architecture

**Host-to-Client Flow:**
1. DM makes change → `saveCharacter()` → `broadcastIfDM()` → `dm:character-update` message
2. Client receives message → `handleClientMessage()` (`client-handlers.ts`, lines 734-745):

```typescript
case 'dm:character-update': {
  const payload = message.payload as CharacterUpdatePayload
  if (payload.characterData) {
    useLobbyStore.getState().setRemoteCharacter(payload.characterId, payload.characterData as Character5e)
  }
  break
}
```

**Permission System** (`CharacterSheet5ePage.tsx`, lines 81-88):
```typescript
const canEdit = (() => {
  if (character.playerId === 'local') return true
  if (role === 'host') return true
  const localPlayer = players.find((p) => p.peerId === localPeerId)
  if (localPlayer?.isCoDM) return true
  if (character.playerId === localPeerId) return true
  return false
})()
```

### Sync Issues Found:

1. **No Conflict Resolution**: If DM and player edit simultaneously, last-write-wins without warning
2. **Partial Updates**: The entire character object is sent on every change, not deltas
3. **No Sync Acknowledgment**: No confirmation that client received update
4. **Remote Character Storage**: Updates go to `lobbyStore.remoteCharacters`, not the character store - could cause inconsistency

### Testing Needed:
- High-latency scenarios (300ms+ round trip)
- Concurrent editing by DM and player
- Reconnection mid-edit behavior

---

## 4. Inventory System

### Equipment Management

**EquipmentListPanel5e.tsx** (lines 23-449) provides:
- Add custom items (name + quantity)
- Remove items
- Sell items (half price with automatic currency conversion)
- Open equipment packs (Explorer's Pack, etc.) into component items
- Gear shop with search and buy functionality

**Currency Management** (`EquipmentSection5e.tsx`, lines 30-38):
```typescript
const saveCurrencyDenom = (denom: string, newValue: number): void => {
  const latest = getLatest() || character
  const updated = {
    ...latest,
    treasure: { ...latest.treasure, [denom]: newValue },
    updatedAt: new Date().toISOString()
  } as Character
  saveAndBroadcast(updated)
}
```

### Weight/Encumbrance

**Weight Calculator** (`weight-calculator.ts`, lines 46-76):
```typescript
export function calculateTotalWeight(character: Character5e): number {
  let total = 0
  // Weapons, Armor, Equipment, Magic items
  for (const w of character.weapons ?? []) { total += w.weight ?? 0 }
  for (const a of character.armor ?? []) { total += a.weight ?? 0 }
  for (const item of character.equipment ?? []) { total += item.weight ?? 0 }
  for (const mi of character.magicItems ?? []) { total += mi.weight ?? 0 }
  // Currency: 50 coins = 1 lb
  const totalCoins = (currency.cp ?? 0) + (currency.sp ?? 0) + (currency.ep ?? 0) + (currency.gp ?? 0) + (currency.pp ?? 0)
  total += totalCoins / 50
  return Math.round(total * 100) / 100
}
```

**Encumbrance Display** (`EquipmentSection5e.tsx`, lines 59-94):
- Visual progress bar showing current/max weight
- Color coding: green (<75%), amber (75%+ or encumbered), red (over limit)
- PHB 2024 rules: STR × 15 = carry capacity, STR × 30 = drag/lift/push
- Size multipliers: Tiny (×0.5), Small/Medium (×1), Large (×2), Huge (×4), Gargantuan (×8)

### Attunement System

**AttunementTracker5e.tsx** (lines 11-135):
- Visual 3-slot tracker (max 3 attuned items per PHB)
- Shows attuned items with remove buttons
- Empty slots show "+ Attune" button
- **ISSUE**: Magic items panel shows separate attunement count (`MagicItemsPanel5e.tsx`, lines 57-61) that may not match

### Armor Equipping

`use-character-store.ts` (lines 129-147):
```typescript
toggleArmorEquipped: async (characterId: string, armorId: string) => {
  const updatedArmor = char.armor.map((a) => {
    if (a.id === armorId) {
      return { ...a, equipped: !a.equipped }
    }
    // Unequip other armor of same type when equipping
    if (char.armor.find((x) => x.id === armorId)?.type === a.type && a.id !== armorId) {
      return { ...a, equipped: false }
    }
    return a
  })
}
```

**Good**: Automatically unequips same-type armor when equipping new piece.

---

## 5. Spellbook / Spell Management

### Spellcasting Section

**SpellcastingSection5e.tsx** (lines 32-456) provides:
- Spell slot tracker with visual grid
- Spell save DC and attack bonus display
- Cantrip count vs maximum
- Prepared spell count vs maximum
- Multiclass advisor button
- Spell preparation optimizer

**Spell List Display** (`SpellList5e.tsx`, lines 258-305):
- Groups spells by level (Cantrips through 9th)
- Collapsible spell rows with expandable details
- Shows: casting time, range, duration, components, school, description
- **GOOD**: Ritual casting support with 10-minute warning
- **GOOD**: At Higher Levels text display

### Spell Preparation

**Prepare/Unprepare** (`SpellcastingSection5e.tsx`, lines 92-104):
```typescript
function handleTogglePrepared(spellId: string): void {
  const latest = useCharacterStore.getState().characters.find((c) => c.id === character.id) || character
  const currentPrepared = latest.preparedSpellIds ?? []
  let updatedPrepared: string[]
  if (currentPrepared.includes(spellId)) {
    updatedPrepared = currentPrepared.filter((id) => id !== spellId)
  } else {
    updatedPrepared = [...currentPrepared, spellId]
  }
  const updated = { ...latest, preparedSpellIds: updatedPrepared, updatedAt: new Date().toISOString() } as Character
  useCharacterStore.getState().saveCharacter(updated)
}
```

### Spell Slot Management

**SpellSlotTracker5e.tsx** (lines 14-144):
- Visual slot tracker with filled/empty circles
- Click to expend/restore slots
- Separate tracking for Pact Magic slots (Warlock)
- "Restore Slots" button for long rest simulation

**Casting with Upcasting** (`SpellList5e.tsx`, lines 190-226):
- Click "Cast" button opens slot picker
- Shows only available slots at spell's level or higher
- Visual distinction between base level (amber) and upcast levels (indigo)
- No slots available shows red warning

### Innate Spellcasting

**Innate Use Tracking** (`SpellList5e.tsx`, lines 130-150):
- Displays pips (filled circles) for innate uses
- Click to toggle between used/available
- Supports PB (proficiency bonus) scaling uses (max = -1 means PB uses)

### Issues Found:

1. **No Spell Filtering**: Can't filter spells by school, casting time, or components
2. **No Quick Search**: No search box within spell list
3. **Concentration Tracking**: UI shows concentration warning but doesn't prevent casting
4. **Component Tracking**: Shows V/S/M indicators but doesn't enforce requirements

---

## 6. Conditions & Mathematical Effects

### Condition System

**Condition Data** (`conditions.ts`, lines 1-69):
```typescript
export interface ConditionDef {
  name: string
  description: string
  system: 'dnd5e'
  hasValue?: boolean  // For stackable conditions (Exhaustion)
  maxValue?: number
}
```

**ConditionsSection5e.tsx** (lines 13-254):
- Displays active conditions with color coding (red=condition, green=buff)
- Supports conditions with values (Exhaustion levels 1-6)
- Custom condition creation
- Picker with tabs: Conditions / Buffs / Custom

### Exhaustion Effects

**CombatStatsBar5e.tsx** (lines 166-172):
```typescript
const exhaustionLevel = (() => {
  const exh = conditions.find((c) => c.name?.toLowerCase() === 'exhaustion')
  return exh?.value ?? 0
})()
const speedZero = hasGrappled || hasRestrained
const exhaustionPenalty = exhaustionLevel * 5
const effectiveSpeed = speedZero ? 0 : Math.max(0, baseSpeed - exhaustionPenalty)
```

**Passive Perception** (`CombatStatsBar5e.tsx`, lines 263-284):
```typescript
const exhCond = conditions.find((c) => c.name?.toLowerCase() === 'exhaustion')
const exhPenalty = (exhCond?.value ?? 0) * 2
const passivePerc = 10 + abilityModifier(effectiveCharacter.abilityScores.wisdom) + percBonus - exhPenalty
```

**ConditionsSection5e.tsx** (lines 127-132):
```typescript
{cond.name === 'Exhaustion' && cond.value != null && cond.value > 0 && (
  <div className="text-[10px] text-amber-400 mt-1 bg-amber-900/20 rounded px-2 py-1">
    d20 Tests: {cond.value * -2} | Speed: -{cond.value * 5} ft
    {cond.value >= 6 && <span className="text-red-400 font-bold ml-2">DEATH</span>}
  </div>
)}
```

### Rest Integration

**Long Rest** (`rest-service-5e.ts`, lines 340-467):
- Reduces Exhaustion by 1 level (lines 392-402)
- Restores all HP, hit dice (up to half), spell slots, class resources
- Restores innate spell uses
- Restores Wild Shape uses
- Restores magic item charges (long-rest recharge type)

**Short Rest** (`rest-service-5e.ts`, lines 170-291):
- Ranger Tireless (L10+): Reduces Exhaustion by 1 (lines 242-251)
- Restores hit dice, class resources (short rest restore), pact magic slots
- Supports Arcane Recovery (Wizard) and Natural Recovery (Druid)

### Issues Found:

1. **Limited Automation**: Conditions display penalties but don't automatically apply to all rolls
2. **No Concentration Save**: Taking damage doesn't prompt for concentration CON save
3. **No Death Save Automation**: Must manually track death saves

---

## 7. Performance Issues & Missing Features

### Performance Issues

**1. No Virtualization**
- `SpellList5e.tsx` renders all spells without virtualization
- `EquipmentListPanel5e.tsx` renders all equipment items
- With 100+ spells or items, this causes rendering lag

**2. Excessive Re-renders**
- Many components recalculate values on every render instead of using `useMemo`
- Only `CombatStatsBar5e.tsx` (line 38) and `FeaturesSection5e.tsx` use memoization

**3. Deep Object Cloning**
- Every save operation creates new objects via spread operator
- No structural sharing or immutable updates library

**4. Spell Slot Grid**
- `SpellSlotGrid5e.tsx` (implied from usage) likely renders individual buttons for each slot
- High-level casters (L17+) have 20+ slots - could optimize

### Missing/Broken Features

**Missing:**
1. **Quick Actions**: No quick buttons for common actions (Attack, Dash, Disengage, etc.)
2. **Temp HP Automation**: No way to apply temporary HP from spells/features easily
3. **Damage/Healing Calculator**: No built-in damage application with resistance calculation
4. **Inventory Categories**: No filtering/sorting of equipment by category
5. **Spell Scrolls**: No support for consumable spell scrolls
6. **Consumable Tracking**: No tracking for consumable items (potions, ammo, etc.)
7. **Tool Proficiency Checks**: No way to roll tool checks from sheet
8. **Initiative Rolling**: No initiative roll button on sheet
9. **Hit Dice Rolling**: Short rest modal exists but no individual hit die rolling

**Potentially Broken:**
1. **Weight Calculation**: May not account for container weights properly
2. **Currency Conversion**: Selling items adds currency but may not properly handle CP/SP/GP/PP conversion
3. **Armor AC Calculation**: Complex logic in `CombatStatsBar5e.tsx` - needs testing with multiclass characters
4. **Condition Sync**: Conditions may not sync properly in multiplayer - no specific condition sync message type found

### Code Quality Issues

1. **Type Safety**: Some `as Character` type assertions bypass type checking
2. **Error Handling**: Limited error handling for failed save operations
3. **Test Coverage**: No test files found for sheet components
4. **Accessibility**: Limited ARIA labels, focus management not implemented

---

## 8. Recommendations

### High Priority

1. **Add Virtualization**: Use `react-window` or similar for spell lists and equipment lists
2. **Optimize Re-renders**: Wrap sections in `React.memo` and use `useMemo` for expensive calculations
3. **Implement Optimistic Updates**: Update UI immediately, rollback on error
4. **Add Spell Search**: Filter box for spell list
5. **Fix Condition Sync**: Ensure conditions sync properly in multiplayer

### Medium Priority

1. **Add Quick Actions Panel**: Common combat actions
2. **Implement Damage Calculator**: Apply damage with resistance/vulnerability math
3. **Add Consumable Tracking**: Track ammo, potions, spell scrolls
4. **Improve Tool Checks**: Rollable tool proficiencies
5. **Add Inventory Categories**: Organize equipment by type

### Low Priority

1. **Accessibility Audit**: Add ARIA labels, keyboard navigation
2. **Test Coverage**: Add unit tests for sheet components
3. **Performance Profiling**: Profile with 50+ spells/items
4. **Mobile Optimization**: Better responsive design for small screens

---

## Conclusion

The character sheet is feature-rich and functional for typical use cases. The architecture using Zustand + IPC + WebRTC is solid. However, performance optimization is needed for high-level characters with many spells/items, and some quality-of-life features (quick actions, damage calculator, spell search) would significantly improve the user experience.

The sync system works but could benefit from conflict resolution and delta updates rather than full character object synchronization.
