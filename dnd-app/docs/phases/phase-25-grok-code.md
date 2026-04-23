# Phase 25: Homebrew & Custom Content Analysis - Grok Code

## Executive Summary

This D&D 5e virtual tabletop application has a **partially implemented** homebrew and custom content system. While users can create custom content through a flexible UI, significant gaps exist in validation, sharing, mechanics integration, and data consistency. The system supports basic creation but lacks the depth needed for robust custom content management.

## Current Implementation Status

### ✅ Functional Components

#### 1. Homebrew Creation System
- **Location**: `src/renderer/src/components/library/HomebrewCreateModal.tsx`
- **Supported Types**: species, class, subclass, background, feat, spell, item, monster, magic-item, weapon, armor, tool, other
- **Features**:
  - Dynamic field addition/removal
  - Support for multiple data types (boolean, number, string, arrays, objects)
  - Based-on relationships (create variants of official content)
  - Timestamps and versioning

#### 2. Storage Architecture
- **Homebrew Storage**: `src/main/storage/homebrew-storage.ts`
  - Stored in `userData/homebrew/` directory
  - Organized by category subdirectories
  - UUID-based filenames
- **Custom Creatures**: `src/main/storage/custom-creature-storage.ts`
  - Stored in `userData/custom-creatures/` directory
  - Flat structure for monster/creature content

#### 3. Data Integration
- **Merge Logic**: `src/renderer/src/stores/use-data-store.ts:mergeHomebrew()`
- **Integration**: Homebrew content merges with official data in data store
- **Library Display**: `src/renderer/src/services/library-service.ts:homebrewToLibraryItems()`
- **Source Tagging**: Homebrew items tagged with `source: 'homebrew'`

#### 4. Basic Validation
- **Service**: `src/renderer/src/services/homebrew-validation.ts`
- **Checks**: Required fields (name, type, id), duplicate names, basic integrity
- **Zod Schemas**: Exist for classes, feats, backgrounds in `scripts/schemas/`
- **Script Validation**: `scripts/validate-homebrew.ts` for development-time validation

### ❌ Critical Gaps & Issues

#### 1. **No Sharing or Synchronization System**
- **Problem**: Custom content cannot be shared between campaigns or users
- **Impact**: Campaign-specific homebrew cannot be easily transferred or backed up
- **Missing**: No export/import functionality for homebrew content
- **Evidence**: Entity export system (`src/renderer/src/services/io/entity-io.ts`) doesn't include homebrew types

#### 2. **Limited Validation & Schema Support**
- **Problem**: Only basic validation exists; deep schema validation incomplete
- **Evidence**:
  - Zod schemas exist only for classes, feats, backgrounds
  - No schemas for spells, monsters, magic items, etc.
  - Validation script only handles 3 content types
- **Impact**: Invalid custom content can break the system

#### 3. **Custom Mechanics Not Implemented**
- **Problem**: Custom feats/spells don't work in combat/character sheet
- **Evidence**: `src/renderer/src/services/character/feat-mechanics-5e.ts` only handles official feats
- **Impact**: Custom content appears but has no functional mechanics

#### 4. **Character Sheet & Combat Engine Integration Issues**
- **Problem**: Custom content may not integrate properly with calculations
- **Evidence**:
  - No references to homebrew in character sheet components
  - Combat services don't account for custom content
  - Character auto-populate service doesn't handle homebrew
- **Impact**: Custom classes/feats may break character sheet display or calculations

#### 5. **Dual Storage Systems Create Confusion**
- **Problem**: Homebrew vs Custom Creatures are separate systems
- **Evidence**:
  - Homebrew: `homebrew/` directory, category-organized
  - Custom Creatures: `custom-creatures/` directory, flat
- **Impact**: Users don't understand the difference; content fragmentation

#### 6. **Campaign-Specific Content Not Supported**
- **Problem**: No way to create campaign-specific homebrew
- **Evidence**: Campaign storage (`src/main/storage/campaign-storage.ts`) doesn't include homebrew
- **Impact**: All homebrew is global, not campaign-scoped

#### 7. **Backup/Restore Incomplete**
- **Problem**: Full backup (`src/renderer/src/services/io/import-export.ts`) includes homebrew but restore process may be incomplete
- **Evidence**: Backup payload includes homebrew array but validation of completeness unclear

## Technical Architecture Analysis

### Data Flow
```
User Creation → HomebrewCreateModal → homebrew-storage.ts → Data Store → Library Service → UI Display
Official Data → Data Provider → Data Store (merged with homebrew) → Components
```

### Storage Structure
```
userData/
├── homebrew/           # Homebrew content by category
│   ├── species/
│   ├── feats/
│   ├── spells/
│   └── ...
└── custom-creatures/   # Monster-specific storage
    ├── creature1.json
    └── creature2.json
```

### Integration Points
- **Data Store**: Merges homebrew with official data
- **Library Service**: Converts homebrew entries to library items
- **Validation Service**: Basic integrity checks
- **UI Components**: Display homebrew alongside official content

## Specific Findings by Research Question

### 1. System for Creating Custom Items, Spells, Feats, Monsters?
**✅ Partially Implemented**
- **UI**: Flexible creation modal with dynamic fields
- **Storage**: Category-organized JSON files
- **Types Supported**: 13 content types
- **Limitations**: No validation for most content types, no mechanics implementation

### 2. Can Custom Content Be Shared/Synced Within Campaigns?
**❌ Not Implemented**
- **Current State**: All homebrew is global, no campaign association
- **Missing**: No sharing mechanism, no campaign-specific storage
- **Impact**: Cannot create campaign-specific content or share between sessions

### 3. Are Data Schemas Flexible Enough for Custom Modifiers/Effects?
**⚠️ Partially Flexible**
- **Storage**: JSON allows arbitrary fields
- **Validation**: Only basic validation, no deep schema enforcement
- **Integration**: Data merges successfully but mechanics don't work
- **Issue**: No guarantee custom fields are understood by consuming systems

### 4. Is There Validation to Prevent Breaking Character Sheet/Combat Engine?
**❌ Insufficient Validation**
- **Exists**: Basic field validation (name, type, id)
- **Missing**: Schema validation for most content types
- **Issue**: Custom content can have invalid structure and break systems
- **Evidence**: Only 3/13 content types have Zod schemas

### 5. What's Missing/Broken/Incomplete?
**Major Issues**:
1. **No Content Sharing**: Cannot export/import/share homebrew
2. **Incomplete Validation**: Most content types lack schema validation
3. **No Custom Mechanics**: Custom feats/spells don't function
4. **Character Sheet Gaps**: Custom content may not display correctly
5. **Dual Systems**: Confusing homebrew vs custom creatures split
6. **No Campaign Scoping**: All content is global
7. **Backup Incomplete**: Full restore process unverified

## Recommendations

### High Priority
1. **Implement Zod Schemas** for all supported content types
2. **Add Export/Import** for homebrew content
3. **Create Mechanics System** for custom feats/spells
4. **Unify Storage Systems** (merge homebrew and custom creatures)
5. **Add Campaign Scoping** for content organization

### Medium Priority
1. **Deep Validation Integration** with character sheet/combat systems
2. **Sharing Mechanism** (JSON export/import at minimum)
3. **Content Versioning** and conflict resolution
4. **UI Improvements** for content management

### Low Priority
1. **Advanced Validation** (cross-reference checking)
2. **Content Marketplace** or community sharing
3. **Automated Testing** for custom content

## Conclusion

The homebrew system provides a solid foundation for user-generated content with flexible creation tools and basic storage/integration. However, critical gaps in validation, sharing, and mechanics implementation prevent it from being a complete solution. Users can create custom content that displays in the library, but it may not function properly in actual gameplay scenarios.