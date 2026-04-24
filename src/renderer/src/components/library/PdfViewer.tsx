import type { PDFDocumentProxy } from 'pdfjs-dist'
import * as pdfjsLib from 'pdfjs-dist'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { DrawingStroke, DrawingTool, PageDrawings } from './PdfDrawingOverlay'

// Fetch the worker script and create a blob URL — works in both dev and production Electron
import PdfDrawingOverlay, { DrawingToolbar } from './PdfDrawingOverlay'
;(async () => {
  try {
    const resp = await fetch('/pdf.worker.min.mjs')
    const text = await resp.text()
    const blob = new Blob([text], { type: 'application/javascript' })
    pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob)
  } catch (err) {
    console.warn('[PdfViewer] Failed to load worker, PDF parsing will run on main thread:', err)
  }
})()

interface BookmarkEntry {
  id: string
  bookId: string
  page: number
  label: string
  color?: string
  createdAt: string
}

interface AnnotationEntry {
  id: string
  bookId: string
  page: number
  text: string
  highlight?: { x: number; y: number; width: number; height: number }
  createdAt: string
}

interface PdfViewerProps {
  bookId: string
  filePath: string
  title: string
  onClose: () => void
  onOpenBook?: (bookId: string, page: number) => void
}

type SearchHighlight = { x: number; y: number; width: number; height: number }

interface TocEntry {
  title: string
  page: number
  level: number // 0 = top-level, 1 = sub-section, 2 = sub-sub
  crossRef?: { bookId: string; page: number } // optional cross-book reference
}

// Fallback ToC for PDFs without embedded outlines (DMG has none)
const FALLBACK_TOC: Record<string, TocEntry[]> = {
  'dmg-2024': [
    { title: 'Cover', page: 1, level: 0 },
    { title: 'Credits', page: 6, level: 0 },
    { title: 'Table of Contents', page: 7, level: 0 },

    // Chapter 1: The Basics
    { title: 'Ch 1: The Basics', page: 9, level: 0 },
    { title: 'What Does a DM Do?', page: 9, level: 1 },
    { title: 'Things You Need', page: 10, level: 1 },
    { title: 'Rulebooks', page: 10, level: 2 },
    { title: 'Note-Taking Materials', page: 10, level: 2 },
    { title: 'Place to Play', page: 10, level: 2 },
    { title: 'Useful Additions', page: 11, level: 2 },
    { title: 'Preparing a Session', page: 12, level: 1 },
    { title: 'The One-Hour Guideline', page: 12, level: 2 },
    { title: 'How to Run a Session', page: 13, level: 1 },
    { title: 'Ending a Session', page: 14, level: 2 },
    { title: 'Passing Time', page: 14, level: 2 },
    { title: 'Example of Play', page: 14, level: 1 },
    { title: 'Every DM Is Unique', page: 17, level: 1 },
    { title: 'Play Style', page: 17, level: 2 },
    { title: 'Delegation', page: 17, level: 2 },
    { title: 'House Rules', page: 17, level: 2 },
    { title: 'Game Expectations', page: 18, level: 1 },
    { title: 'Hopes and Expectations', page: 18, level: 2 },
    { title: 'Potentially Sensitive Elements', page: 18, level: 2 },
    { title: 'Ensuring Fun for All', page: 19, level: 1 },
    { title: 'Mutual Respect', page: 19, level: 2 },
    { title: 'Everyone Contributes', page: 20, level: 2 },
    { title: 'Respect for the Players', page: 21, level: 1 },
    { title: 'Respect for the DM', page: 22, level: 1 },
    { title: 'The Social Contract', page: 22, level: 2 },
    { title: 'Rules for the Virtual Table', page: 23, level: 2 },

    // Chapter 2: Running the Game
    { title: 'Ch 2: Running the Game', page: 25, level: 0 },
    { title: 'Know Your Players', page: 25, level: 1 },
    { title: 'Acting', page: 25, level: 2 },
    { title: 'Exploring', page: 25, level: 2 },
    { title: 'Fighting', page: 25, level: 2 },
    { title: 'Instigating', page: 25, level: 2 },
    { title: 'Optimizing', page: 25, level: 2 },
    { title: 'Problem-Solving', page: 26, level: 2 },
    { title: 'Socializing', page: 26, level: 2 },
    { title: 'Storytelling', page: 26, level: 2 },
    { title: 'Group Size', page: 27, level: 1 },
    { title: 'Large Groups', page: 27, level: 2 },
    { title: 'Small Groups', page: 27, level: 2 },
    { title: 'NPC Party Members', page: 27, level: 2 },
    { title: 'Absent Players', page: 28, level: 2 },
    { title: 'Incorporating New Players', page: 28, level: 2 },
    { title: 'Multiple DMs', page: 29, level: 1 },
    { title: 'Concurrent Campaigns', page: 29, level: 2 },
    { title: 'Shared Worlds', page: 29, level: 2 },
    { title: 'Guest DMs', page: 29, level: 2 },
    { title: 'Joint DMs', page: 29, level: 2 },
    { title: 'Narration', page: 30, level: 1 },
    { title: 'Lead by Example', page: 30, level: 2 },
    { title: 'Secrets and Discovery', page: 30, level: 2 },
    { title: 'Atmosphere', page: 30, level: 2 },
    { title: 'Resolving Outcomes', page: 31, level: 1 },
    { title: 'Ability Checks', page: 31, level: 2 },
    { title: 'Attack Rolls', page: 33, level: 2 },
    { title: 'Saving Throws', page: 33, level: 2 },
    { title: 'Difficulty Class', page: 33, level: 2 },
    { title: 'Advantage and Disadvantage', page: 33, level: 2 },
    { title: 'Consequences', page: 34, level: 1 },
    { title: 'Improvising Damage', page: 34, level: 2 },
    { title: 'Improvising Answers', page: 35, level: 2 },
    { title: 'Running Social Interaction', page: 36, level: 1 },
    { title: 'Roleplaying', page: 36, level: 2 },
    { title: 'Attitude', page: 36, level: 2 },
    { title: 'Running Exploration', page: 37, level: 1 },
    { title: 'Using a Map', page: 37, level: 2 },
    { title: 'Actions in Exploration', page: 38, level: 2 },
    { title: 'Perception', page: 39, level: 2 },
    { title: 'Travel', page: 40, level: 2 },
    { title: 'Weather', page: 42, level: 2 },
    { title: 'Running Combat', page: 46, level: 1 },
    { title: 'Rolling Initiative', page: 46, level: 2 },
    { title: 'Tracking Initiative', page: 46, level: 2 },
    { title: "Tracking Monsters' Hit Points", page: 46, level: 2 },
    { title: 'Using and Tracking Conditions', page: 47, level: 2 },
    { title: 'Miniatures', page: 48, level: 2 },
    { title: 'Tracking Position at Long Range', page: 49, level: 2 },
    { title: 'Narration in Combat', page: 50, level: 2 },
    { title: 'Keeping Combat Moving', page: 51, level: 2 },
    { title: 'Adjusting Difficulty', page: 52, level: 2 },
    { title: 'Fight or Flight', page: 52, level: 2 },
    { title: 'Character Advancement', page: 52, level: 1 },
    { title: 'Awarding XP', page: 52, level: 2 },
    { title: 'Noncombat Challenges', page: 53, level: 2 },
    { title: 'Level Advancement Without XP', page: 53, level: 2 },
    { title: 'Leveling Up', page: 53, level: 2 },

    // Chapter 3: DM's Toolbox
    { title: "Ch 3: DM's Toolbox", page: 55, level: 0 },
    { title: 'Alignment', page: 55, level: 1 },
    { title: 'Monster Alignment', page: 55, level: 2 },
    { title: 'Character Alignment', page: 55, level: 2 },
    { title: 'Chases', page: 56, level: 1 },
    { title: 'Beginning a Chase', page: 56, level: 2 },
    { title: 'Running the Chase', page: 56, level: 2 },
    { title: 'Ending a Chase', page: 57, level: 2 },
    { title: 'Chase Complications', page: 57, level: 2 },
    { title: 'Splitting Up', page: 57, level: 2 },
    { title: 'Role Reversal', page: 57, level: 2 },
    { title: 'Creating a Background', page: 59, level: 1 },
    { title: 'Creating a Creature', page: 60, level: 1 },
    { title: 'Minor Alterations', page: 60, level: 2 },
    { title: 'Creating a Magic Item', page: 62, level: 1 },
    { title: 'Modifying a Magic Item', page: 62, level: 2 },
    { title: 'Creating a New Item', page: 62, level: 2 },
    { title: 'Creating a Spell', page: 63, level: 1 },
    { title: 'Curses and Magical Contagions', page: 64, level: 1 },
    { title: 'Curses', page: 64, level: 2 },
    { title: 'Magical Contagions', page: 65, level: 2 },
    { title: 'Death', page: 66, level: 1 },
    { title: 'Death Must Be Fair', page: 66, level: 2 },
    { title: 'Scaling Lethality', page: 66, level: 2 },
    { title: 'Death Scenes', page: 67, level: 2 },
    { title: 'Dealing with Death', page: 67, level: 2 },
    { title: 'Doors', page: 68, level: 1 },
    { title: 'Common Doors', page: 68, level: 2 },
    { title: 'Secret Doors', page: 68, level: 2 },
    { title: 'Dungeons', page: 69, level: 1 },
    { title: 'Mapping a Dungeon', page: 70, level: 2 },
    { title: 'Designing Dungeon Rooms', page: 70, level: 2 },
    { title: 'Dungeon Decay', page: 71, level: 2 },
    { title: 'Environmental Effects', page: 72, level: 1 },
    { title: 'Extreme Cold', page: 72, level: 2 },
    { title: 'Extreme Heat', page: 72, level: 2 },
    { title: 'Dead Magic Zone', page: 72, level: 2 },
    { title: 'Deep Water', page: 72, level: 2 },
    { title: 'Heavy Precipitation', page: 73, level: 2 },
    { title: 'High Altitude', page: 73, level: 2 },
    { title: 'Strong Wind', page: 73, level: 2 },
    { title: 'Wild Magic Zone', page: 73, level: 2 },
    { title: 'Fear and Mental Stress', page: 74, level: 1 },
    { title: 'Fear Effects', page: 74, level: 2 },
    { title: 'Mental Effects', page: 74, level: 2 },
    { title: 'Firearms and Explosives', page: 76, level: 1 },
    { title: 'Firearms', page: 76, level: 2 },
    { title: 'Explosives', page: 76, level: 2 },
    { title: 'Alien Technology', page: 77, level: 2 },
    { title: 'Gods and Other Powers', page: 78, level: 1 },
    { title: 'Divine Rank', page: 78, level: 2 },
    { title: 'Home Plane', page: 78, level: 2 },
    { title: 'Creating Religions', page: 79, level: 2 },
    { title: 'Divine Knowledge', page: 79, level: 2 },
    { title: 'Hazards', page: 80, level: 1 },
    { title: 'Severity and Level', page: 80, level: 2 },
    { title: 'Example Hazards', page: 80, level: 2 },
    { title: 'Marks of Prestige', page: 84, level: 1 },
    { title: 'Letters of Recommendation', page: 84, level: 2 },
    { title: 'Medals', page: 85, level: 2 },
    { title: 'Parcels of Land', page: 85, level: 2 },
    { title: 'Mobs', page: 86, level: 1 },
    { title: 'Areas of Effect', page: 86, level: 2 },
    { title: 'Nonplayer Characters', page: 88, level: 1 },
    { title: 'Detailed NPCs', page: 88, level: 2 },
    { title: 'NPC Tracker', page: 91, level: 2 },
    { title: 'NPCs as Party Members', page: 92, level: 2 },
    { title: 'Recurring NPCs', page: 92, level: 2 },
    { title: 'Poison', page: 94, level: 1 },
    { title: 'Sample Poisons', page: 94, level: 2 },
    { title: 'Renown', page: 96, level: 1 },
    { title: 'Gaining Renown', page: 96, level: 2 },
    { title: 'Losing Renown', page: 96, level: 2 },
    { title: 'Benefits of Renown', page: 96, level: 2 },
    { title: 'Settlements', page: 97, level: 1 },
    { title: 'Settlement Tracker', page: 99, level: 2 },
    { title: 'Siege Equipment', page: 100, level: 1 },
    { title: 'Supernatural Gifts', page: 102, level: 1 },
    { title: 'Blessings', page: 102, level: 2 },
    { title: 'Charms', page: 103, level: 2 },
    { title: 'Traps', page: 104, level: 1 },
    { title: 'Parts of a Trap', page: 104, level: 2 },
    { title: 'Example Traps', page: 104, level: 2 },
    { title: 'Building Your Own', page: 107, level: 2 },

    // Chapter 4: Creating Adventures
    { title: 'Ch 4: Creating Adventures', page: 109, level: 0 },
    { title: 'Step-by-Step Adventures', page: 109, level: 1 },
    { title: 'Lay Out the Premise', page: 109, level: 2 },
    { title: 'Adventure Conflict', page: 110, level: 2 },
    { title: 'Adventure Situations by Level', page: 110, level: 2 },
    { title: 'Adventure Setting', page: 113, level: 2 },
    { title: 'Draw In the Players', page: 114, level: 1 },
    { title: 'Adventure Patrons', page: 114, level: 2 },
    { title: 'Supernatural Hooks', page: 115, level: 2 },
    { title: 'Happenstance Hooks', page: 115, level: 2 },
    { title: 'Plan Encounters', page: 116, level: 1 },
    { title: 'Character Objectives', page: 116, level: 2 },
    { title: 'Keeping the Adventure Moving', page: 116, level: 2 },
    { title: 'Something for Everyone', page: 117, level: 2 },
    { title: 'Multiple Ways to Progress', page: 117, level: 2 },
    { title: 'Social Interaction Encounters', page: 118, level: 2 },
    { title: 'Exploration Encounters', page: 118, level: 2 },
    { title: 'Combat Encounters', page: 118, level: 2 },
    { title: 'Monster Behavior', page: 120, level: 2 },
    { title: 'Encounter Pace and Tension', page: 122, level: 1 },
    { title: 'Random Encounters', page: 123, level: 2 },
    { title: 'Bring It to an End', page: 124, level: 1 },
    { title: 'Denouement', page: 124, level: 2 },
    { title: 'Adventure Rewards', page: 124, level: 1 },
    { title: 'Individual Treasure', page: 124, level: 2 },
    { title: 'Treasure Hoards', page: 124, level: 2 },
    { title: 'Quest Rewards', page: 125, level: 2 },
    { title: 'Adventure Examples', page: 126, level: 1 },
    { title: 'The Fouled Stream', page: 126, level: 2 },
    { title: 'The Winged God', page: 127, level: 2 },
    { title: 'Horns of the Beast', page: 128, level: 2 },
    { title: 'Boreal Ball', page: 129, level: 2 },

    // Chapter 5: Creating Campaigns
    { title: 'Ch 5: Creating Campaigns', page: 131, level: 0 },
    { title: 'Step-by-Step Campaigns', page: 131, level: 1 },
    { title: 'Your Campaign Journal', page: 131, level: 1 },
    { title: 'Campaign Premise', page: 133, level: 1 },
    { title: 'Campaign Characters', page: 133, level: 2 },
    { title: "DM's Character Tracker", page: 134, level: 2 },
    { title: 'Campaign Conflicts', page: 135, level: 2 },
    { title: 'Flavors of Fantasy', page: 135, level: 2 },
    { title: 'Campaign Setting', page: 140, level: 1 },
    { title: 'Campaign Start', page: 141, level: 1 },
    { title: 'Session Zero', page: 141, level: 2 },
    { title: 'Starting Location', page: 142, level: 2 },
    { title: 'Plan Adventures', page: 143, level: 1 },
    { title: 'Episodes and Serials', page: 143, level: 2 },
    { title: 'Getting Players Invested', page: 144, level: 1 },
    { title: 'Time in the Campaign', page: 146, level: 1 },
    { title: 'Ending a Campaign', page: 146, level: 1 },
    { title: 'Greyhawk', page: 147, level: 1 },
    { title: 'Important Names', page: 147, level: 2 },
    { title: "Greyhawk's Premise", page: 147, level: 2 },
    { title: 'Greyhawk Conflicts', page: 147, level: 2 },
    { title: 'The Greyhawk Setting', page: 149, level: 2 },
    { title: 'Free City of Greyhawk', page: 153, level: 1 },
    { title: 'How to Use the City', page: 154, level: 2 },
    { title: 'City Overview', page: 155, level: 2 },
    { title: 'City Neighborhoods', page: 156, level: 2 },
    { title: 'City Locations', page: 156, level: 2 },
    { title: 'Beyond the City Walls', page: 163, level: 2 },
    { title: 'Greyhawk Gazetteer', page: 164, level: 1 },
    { title: 'Central Flanaess', page: 166, level: 2 },
    { title: 'Eastern Flanaess', page: 168, level: 2 },
    { title: 'Northern Flanaess', page: 170, level: 2 },
    { title: 'Old Keoland', page: 173, level: 2 },
    { title: 'Western Flanaess', page: 174, level: 2 },

    // Chapter 6: Cosmology
    { title: 'Ch 6: Cosmology', page: 177, level: 0 },
    { title: 'The Planes', page: 177, level: 1 },
    { title: 'Material Realms', page: 177, level: 2 },
    { title: 'The Great Wheel', page: 177, level: 2 },
    { title: 'Inner Planes', page: 178, level: 2 },
    { title: 'Outer Planes', page: 178, level: 2 },
    { title: 'Planar Travel', page: 180, level: 1 },
    { title: 'Planar Portals', page: 180, level: 2 },
    { title: 'The Outer Planes', page: 181, level: 2 },
    { title: 'The Blood War', page: 182, level: 2 },
    { title: 'Planar Adventuring', page: 182, level: 1 },
    { title: 'Planar Adventure Situations', page: 182, level: 2 },
    { title: 'Tour of the Multiverse', page: 184, level: 1 },
    { title: 'Abyss', page: 184, level: 2 },
    { title: 'Acheron', page: 186, level: 2 },
    { title: 'Arborea', page: 187, level: 2 },
    { title: 'Arcadia', page: 187, level: 2 },
    { title: 'Astral Plane', page: 188, level: 2 },
    { title: 'Beastlands', page: 190, level: 2 },
    { title: 'Bytopia', page: 190, level: 2 },
    { title: 'Carceri', page: 191, level: 2 },
    { title: 'Demiplanes', page: 191, level: 2 },
    { title: 'Elemental Plane of Air', page: 192, level: 2 },
    { title: 'Elemental Plane of Earth', page: 193, level: 2 },
    { title: 'Elemental Plane of Fire', page: 194, level: 2 },
    { title: 'Elemental Plane of Water', page: 194, level: 2 },
    { title: 'Elysium', page: 195, level: 2 },
    { title: 'Ethereal Plane', page: 196, level: 2 },
    { title: 'Far Realm', page: 198, level: 2 },
    { title: 'Feywild', page: 199, level: 2 },
    { title: 'Gehenna', page: 201, level: 2 },
    { title: 'Hades', page: 201, level: 2 },
    { title: 'Limbo', page: 202, level: 2 },
    { title: 'Material Plane', page: 202, level: 2 },
    { title: 'Mechanus', page: 204, level: 2 },
    { title: 'Mount Celestia', page: 204, level: 2 },
    { title: 'Negative Plane', page: 205, level: 2 },
    { title: 'Nine Hells', page: 205, level: 2 },
    { title: 'Outlands', page: 209, level: 2 },
    { title: 'Pandemonium', page: 210, level: 2 },
    { title: 'Para-Elemental Planes', page: 211, level: 2 },
    { title: 'Positive Plane', page: 214, level: 2 },
    { title: 'Shadowfell', page: 212, level: 2 },

    // Chapter 7: Treasure
    { title: 'Ch 7: Treasure', page: 217, level: 0 },
    { title: 'Treasure Themes', page: 217, level: 1 },
    { title: 'Trade Bars and Goods', page: 217, level: 2 },
    { title: 'Magic Items', page: 219, level: 1 },
    { title: 'Magic Item Categories', page: 219, level: 2 },
    { title: 'Magic Item Rarity', page: 220, level: 2 },
    { title: 'Awarding Magic Items', page: 221, level: 2 },
    { title: 'Activating a Magic Item', page: 222, level: 2 },
    { title: 'Cursed Items', page: 222, level: 2 },
    { title: 'Magic Item Resilience', page: 223, level: 2 },
    { title: 'Crafting Magic Items', page: 223, level: 2 },
    { title: 'Magic Item Special Features', page: 224, level: 2 },
    { title: 'Magic Item Tracker', page: 225, level: 2 },
    { title: 'Artifacts', page: 228, level: 1 },
    { title: 'Sentient Magic Items', page: 230, level: 1 },
    { title: 'Magic Items A–Z', page: 231, level: 1 },
    { title: 'Random Magic Items', page: 328, level: 1 },

    // Chapter 8: Bastions
    { title: 'Ch 8: Bastions', page: 337, level: 0 },
    { title: 'Gaining a Bastion', page: 337, level: 1 },
    { title: 'Bastion Turns', page: 337, level: 1 },
    { title: 'Bastion Map', page: 338, level: 1 },
    { title: 'Basic Facilities', page: 339, level: 1 },
    { title: 'Special Facilities', page: 339, level: 1 },
    { title: 'Hirelings', page: 340, level: 2 },
    { title: 'Special Facility Descriptions', page: 340, level: 2 },
    { title: 'Orders', page: 340, level: 1 },
    { title: 'Bastion Events', page: 354, level: 1 },
    { title: 'Event Descriptions', page: 354, level: 2 },
    { title: 'Fall of a Bastion', page: 356, level: 1 },
    { title: 'Bastion Tracker', page: 357, level: 2 },

    // Appendices
    { title: 'Appendix A: Lore Glossary', page: 358, level: 0 },
    { title: 'Appendix B: Maps', page: 369, level: 0 },
    { title: 'Barrow Crypt', page: 369, level: 1 },
    { title: 'Caravan Encampment', page: 370, level: 1 },
    { title: 'Crossroads Village', page: 371, level: 1 },
    { title: "Dragon's Lair", page: 372, level: 1 },
    { title: 'Dungeon Hideout', page: 373, level: 1 },
    { title: 'Farmstead', page: 374, level: 1 },
    { title: 'Keep', page: 375, level: 1 },
    { title: 'Manor', page: 376, level: 1 },
    { title: 'Mine', page: 377, level: 1 },
    { title: 'Roads', page: 378, level: 1 },
    { title: 'Ship', page: 379, level: 1 },
    { title: 'Spooky House', page: 380, level: 1 },
    { title: 'Underdark Warren', page: 381, level: 1 },
    { title: 'Volcanic Caves', page: 382, level: 1 },
    { title: 'Index', page: 384, level: 0 }
  ]
}

// Supplemental entries merged into extracted outlines for richer navigation
const SUPPLEMENTAL_TOC: Record<string, TocEntry[]> = {
  'phb-2024': [
    { title: 'Weapons Table', page: 214, level: 3 },
    { title: 'Armor Table', page: 218, level: 2 },
    { title: 'Adventuring Gear Table', page: 222, level: 3 },
    { title: 'Mounts and Other Animals Table', page: 228, level: 3 },
    { title: 'Lifestyle Expenses', page: 229, level: 3 },
    { title: 'Crafting Equipment', page: 232, level: 2 },
    { title: 'Spell Scroll Costs Table', page: 232, level: 3 }
  ],
  'mm-2025': [
    { title: 'Stat Block Overview', page: 7, level: 1 },
    { title: 'Parts of a Stat Block', page: 8, level: 1 },
    { title: 'Running a Monster', page: 10, level: 1 },
    { title: 'Monster Conversions', page: 376, level: 1 },
    { title: 'Monsters by Habitat', page: 377, level: 1 },
    { title: 'Monsters by Creature Type', page: 381, level: 1 },
    { title: 'Monsters by Group', page: 383, level: 1 },
    { title: 'Monsters by Challenge Rating', page: 384, level: 1 }
  ]
}

// Cross-book references for core books (within-book refs like Wizard Spell List are already in the outline)
const CROSS_BOOK_REFS: Record<string, TocEntry[]> = {
  'dmg-2024': [
    { title: '→ PHB: Character Classes', page: 48, level: 1, crossRef: { bookId: 'phb-2024', page: 48 } },
    { title: '→ PHB: Spells', page: 234, level: 1, crossRef: { bookId: 'phb-2024', page: 234 } },
    { title: '→ MM: Bestiary', page: 12, level: 1, crossRef: { bookId: 'mm-2025', page: 12 } }
  ],
  'mm-2025': [
    { title: '→ PHB: Rules Glossary', page: 359, level: 1, crossRef: { bookId: 'phb-2024', page: 359 } },
    { title: '→ DMG: Treasure', page: 217, level: 1, crossRef: { bookId: 'dmg-2024', page: 217 } }
  ]
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export default function PdfViewer({ bookId, filePath, title, onClose, onOpenBook }: PdfViewerProps): JSX.Element {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [scale, setScale] = useState(1.2)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pageInput, setPageInput] = useState('1')

  // PDF page labels (e.g., "i", "ii", "1", "2") — maps 1-based index to label
  const [pageLabels, setPageLabels] = useState<string[]>([])

  // Table of Contents
  const [tocEntries, setTocEntries] = useState<TocEntry[]>([])
  const [showToc, setShowToc] = useState(true)
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(new Set())
  const [userSelectedTocIdx, setUserSelectedTocIdx] = useState<number | null>(null)

  // View mode
  const [twoPageView, setTwoPageView] = useState(false)

  // Track which pages have been rendered and their dimensions
  const [_renderedPages, setRenderedPages] = useState<Set<number>>(new Set())
  const renderedPagesRef = useRef<Set<number>>(new Set())
  const [pageDimensions, setPageDimensions] = useState<Map<number, { width: number; height: number }>>(new Map())

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchResults, setSearchResults] = useState<Array<{ page: number; matches: number }>>([])
  const [currentSearchIdx, setCurrentSearchIdx] = useState(0)

  // Bookmarks & annotations
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([])
  const [annotations, setAnnotations] = useState<AnnotationEntry[]>([])
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [annotationText, setAnnotationText] = useState('')
  const [showAnnotationInput, setShowAnnotationInput] = useState(false)

  // Drawing tools
  const [drawingTool, setDrawingTool] = useState<DrawingTool>('none')
  const [drawingColor, setDrawingColor] = useState('#FACC15')
  const [drawingSize, setDrawingSize] = useState(20)
  const [pageDrawings, setPageDrawings] = useState<PageDrawings>({})
  const [redoStack, setRedoStack] = useState<PageDrawings>({})

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const pageRefsMap = useRef<Map<number, HTMLDivElement>>(new Map())
  const canvasRefsMap = useRef<Map<number, HTMLCanvasElement>>(new Map())
  const searchInputRef = useRef<HTMLInputElement>(null)
  const isScrollingToPage = useRef(false)
  const renderingPages = useRef<Set<number>>(new Set())
  const currentPageRef = useRef(currentPage)
  currentPageRef.current = currentPage
  const [pendingGoToPage, setPendingGoToPage] = useState<number | null>(null)

  // Load PDF
  useEffect(() => {
    let cancelled = false

    async function loadPdf(): Promise<void> {
      try {
        setLoading(true)
        setError(null)

        const result = await window.api.books.readFile(filePath)

        if (!result.success || !result.data) {
          setError(result.error ?? 'Failed to read PDF file')
          setLoading(false)
          return
        }

        const typedArray = new Uint8Array(result.data)
        const loadingTask = pdfjsLib.getDocument({ data: typedArray })
        const doc = await loadingTask.promise

        if (!cancelled) {
          setPdfDoc(doc)
          setTotalPages(doc.numPages)

          // Fetch PDF page labels (roman numerals, custom numbering, etc.)
          try {
            const labels = await doc.getPageLabels()
            if (labels && labels.length > 0) {
              setPageLabels(labels)
              setPageInput(labels[0] ?? '1')
            }
          } catch {
            // No page labels — fall back to sequential numbers
          }

          // Build Table of Contents from PDF outline, fallback, or cross-book refs
          try {
            let entries: TocEntry[] = []

            const outline = await doc.getOutline()
            if (outline && outline.length > 0) {
              async function walkOutline(items: typeof outline, level: number): Promise<void> {
                for (const item of items) {
                  let pageNum = 1
                  if (item.dest) {
                    try {
                      const dest = typeof item.dest === 'string' ? await doc.getDestination(item.dest) : item.dest
                      if (dest?.[0]) {
                        const pageIdx = await doc.getPageIndex(dest[0])
                        pageNum = pageIdx + 1
                      }
                    } catch {
                      /* keep default page 1 */
                    }
                  }
                  entries.push({ title: item.title, page: pageNum, level })
                  if (item.items && item.items.length > 0) {
                    await walkOutline(item.items, level + 1)
                  }
                }
              }
              await walkOutline(outline, 0)
            } else if (FALLBACK_TOC[bookId]) {
              entries = [...FALLBACK_TOC[bookId]]
            }

            // Merge supplemental entries (adds navigation points not in the PDF outline)
            if (SUPPLEMENTAL_TOC[bookId]) {
              const existing = new Set(entries.map((e) => `${e.title}:${e.page}`))
              for (const supp of SUPPLEMENTAL_TOC[bookId]) {
                if (!existing.has(`${supp.title}:${supp.page}`)) {
                  entries.push(supp)
                }
              }
            }

            // Append cross-book references
            if (CROSS_BOOK_REFS[bookId]) {
              entries.push({ title: '─── Cross References ───', page: 0, level: 0 })
              entries.push(...CROSS_BOOK_REFS[bookId])
            }

            if (!cancelled && entries.length > 0) {
              // Sort siblings by page number to fix out-of-order entries
              // (skip cross-refs at the end — they have page 0 or foreign pages)
              const mainEntries = entries.filter((e) => !e.crossRef && e.page > 0)
              const crossRefEntries = entries.filter((e) => e.crossRef || e.page === 0)

              function sortByPage(flat: TocEntry[]): TocEntry[] {
                type Node = { entry: TocEntry; children: Node[] }
                const roots: Node[] = []
                const stack: Node[] = []

                for (const entry of flat) {
                  const node: Node = { entry, children: [] }
                  while (stack.length > 0 && stack[stack.length - 1].entry.level >= entry.level) {
                    stack.pop()
                  }
                  if (stack.length === 0) {
                    roots.push(node)
                  } else {
                    stack[stack.length - 1].children.push(node)
                  }
                  stack.push(node)
                }

                function sortChildren(nodes: Node[]): void {
                  nodes.sort((a, b) => a.entry.page - b.entry.page)
                  for (const n of nodes) sortChildren(n.children)
                }
                sortChildren(roots)

                const result: TocEntry[] = []
                function flatten(nodes: Node[]): void {
                  for (const n of nodes) {
                    result.push(n.entry)
                    flatten(n.children)
                  }
                }
                flatten(roots)
                return result
              }

              const sortedEntries = [...sortByPage(mainEntries), ...crossRefEntries]
              setTocEntries(sortedEntries)
              // Collapse all sections that have children by default
              const collapsed = new Set<number>()
              for (let i = 0; i < sortedEntries.length; i++) {
                if (i < sortedEntries.length - 1 && sortedEntries[i + 1].level > sortedEntries[i].level) {
                  collapsed.add(i)
                }
              }
              setCollapsedSections(collapsed)
            }
          } catch {
            // No outline available — try fallback
            if (FALLBACK_TOC[bookId]) {
              const entries = [...FALLBACK_TOC[bookId]]
              if (CROSS_BOOK_REFS[bookId]) {
                entries.push({ title: '─── Cross References ───', page: 0, level: 0 })
                entries.push(...CROSS_BOOK_REFS[bookId])
              }
              setTocEntries(entries)
              const collapsed = new Set<number>()
              for (let i = 0; i < entries.length; i++) {
                if (i < entries.length - 1 && entries[i + 1].level > entries[i].level) {
                  collapsed.add(i)
                }
              }
              setCollapsedSections(collapsed)
            }
          }

          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load PDF')
          setLoading(false)
        }
      }
    }

    loadPdf()
    return () => {
      cancelled = true
    }
  }, [filePath, bookId])

  // Pre-fetch page dimensions so placeholders have the right size
  useEffect(() => {
    if (!pdfDoc) return
    let cancelled = false

    async function fetchDimensions(): Promise<void> {
      const dims = new Map<number, { width: number; height: number }>()
      // Fetch first page dimension as a default
      const firstPage = await pdfDoc!.getPage(1)
      const firstVp = firstPage.getViewport({ scale })
      const defaultDim = { width: firstVp.width, height: firstVp.height }

      for (let i = 1; i <= pdfDoc!.numPages; i++) {
        dims.set(i, defaultDim)
      }

      if (!cancelled) {
        setPageDimensions(dims)
      }
    }

    fetchDimensions()
    return () => {
      cancelled = true
    }
  }, [pdfDoc, scale])

  // Render a single page to its canvas
  const renderPageToCanvas = useCallback(
    async (pageNum: number) => {
      if (!pdfDoc) return
      if (renderingPages.current.has(pageNum)) return
      renderingPages.current.add(pageNum)

      try {
        const canvas = canvasRefsMap.current.get(pageNum)
        if (!canvas) {
          renderingPages.current.delete(pageNum)
          return
        }

        const page = await pdfDoc.getPage(pageNum)
        const viewport = page.getViewport({ scale })
        const context = canvas.getContext('2d')
        if (!context) {
          renderingPages.current.delete(pageNum)
          return
        }

        canvas.width = viewport.width
        canvas.height = viewport.height

        await page.render({ canvasContext: context, viewport }).promise
        renderedPagesRef.current.add(pageNum)
        setRenderedPages((prev) => new Set(prev).add(pageNum))

        // Update actual dimensions
        setPageDimensions((prev) => {
          const next = new Map(prev)
          next.set(pageNum, { width: viewport.width, height: viewport.height })
          return next
        })
      } catch {
        // Render failure — canvas stays blank
      } finally {
        renderingPages.current.delete(pageNum)
      }
    },
    [pdfDoc, scale]
  )

  // Clear rendered pages when scale changes
  useEffect(() => {
    renderedPagesRef.current = new Set()
    setRenderedPages(new Set())
    renderingPages.current.clear()
  }, [])

  // Get the display label for a page
  const getPageLabel = useCallback(
    (pageNum: number): string => {
      if (pageLabels.length > 0 && pageNum >= 1 && pageNum <= pageLabels.length) {
        return pageLabels[pageNum - 1] ?? String(pageNum)
      }
      return String(pageNum)
    },
    [pageLabels]
  )
  const getPageLabelRef = useRef(getPageLabel)
  getPageLabelRef.current = getPageLabel

  // Resolve a label string to a 1-based page index
  const resolvePageFromInput = useCallback(
    (input: string): number | null => {
      const trimmed = input.trim()

      // Check PDF-embedded labels
      if (pageLabels.length > 0) {
        const lower = trimmed.toLowerCase()
        const idx = pageLabels.findIndex((l) => l?.toLowerCase() === lower)
        if (idx >= 0) return idx + 1
      }

      // Try Arabic number
      const num = parseInt(trimmed, 10)
      if (!Number.isNaN(num) && num >= 1 && num <= totalPages) return num

      return null
    },
    [totalPages, pageLabels]
  )

  // Stable ref for renderPageToCanvas so observer doesn't re-fire on scale change
  const renderPageRef = useRef(renderPageToCanvas)
  renderPageRef.current = renderPageToCanvas

  // IntersectionObserver — only tracks current page + triggers render for unrendered pages
  useEffect(() => {
    if (!pdfDoc || pageDimensions.size === 0) return

    const container = scrollContainerRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pageNum = Number(entry.target.getAttribute('data-page'))
          if (!pageNum) continue

          if (entry.isIntersecting) {
            if (!renderedPagesRef.current.has(pageNum) && !renderingPages.current.has(pageNum)) {
              renderPageRef.current(pageNum)
            }
          }
        }

        // Update current page from the most visible page
        if (!isScrollingToPage.current) {
          const visibleEntries = entries.filter((e) => e.isIntersecting)
          if (visibleEntries.length > 0) {
            let bestEntry = visibleEntries[0]
            for (const e of visibleEntries) {
              if (e.intersectionRatio > bestEntry.intersectionRatio) {
                bestEntry = e
              }
            }
            const pageNum = Number(bestEntry.target.getAttribute('data-page'))
            if (pageNum && pageNum !== currentPageRef.current) {
              setCurrentPage(pageNum)
              setPageInput(getPageLabelRef.current(pageNum))
              setUserSelectedTocIdx(null)
            }
          }
        }
      },
      {
        root: container,
        rootMargin: '400px 0px',
        threshold: [0, 0.25, 0.5, 0.75, 1.0]
      }
    )

    // Observe all page placeholders
    for (const [, el] of pageRefsMap.current) {
      observer.observe(el)
    }

    return () => observer.disconnect()
  }, [pdfDoc, pageDimensions])

  // Background pre-render using requestIdleCallback for smooth scrolling
  useEffect(() => {
    if (!pdfDoc || totalPages === 0 || pageDimensions.size === 0) return

    let cancelled = false
    let nextPage = 1

    const renderNext = (deadline?: IdleDeadline) => {
      if (cancelled) return

      // Render pages while we have idle time (or in small batches via setTimeout fallback)
      const timeLimit = deadline ? () => deadline.timeRemaining() > 5 : () => true
      let rendered = 0

      while (nextPage <= totalPages && timeLimit() && rendered < 3) {
        if (
          !renderedPagesRef.current.has(nextPage) &&
          !renderingPages.current.has(nextPage) &&
          canvasRefsMap.current.has(nextPage)
        ) {
          renderPageRef.current(nextPage)
          rendered++
        }
        nextPage++
      }

      if (nextPage <= totalPages && !cancelled) {
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(renderNext, { timeout: 2000 })
        } else {
          setTimeout(() => renderNext(), 100)
        }
      }
    }

    // Start after a short delay to let visible pages render first
    const timer = setTimeout(() => {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(renderNext, { timeout: 2000 })
      } else {
        renderNext()
      }
    }, 500)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [pdfDoc, totalPages, pageDimensions])

  // Re-render all pages when view mode changes
  useEffect(() => {
    renderedPagesRef.current = new Set()
    setRenderedPages(new Set())
    renderingPages.current = new Set()
  }, [])

  // Ref that always holds the best-known "last page" — survives React render cycles
  const savedLastPageRef = useRef(1)
  // Refs for latest values so unmount save captures current state
  const bookmarksRef = useRef(bookmarks)
  bookmarksRef.current = bookmarks
  const annotationsRef = useRef(annotations)
  annotationsRef.current = annotations
  const pageDrawingsRef = useRef(pageDrawings)
  pageDrawingsRef.current = pageDrawings

  // Update savedLastPageRef whenever user scrolls past page 1
  useEffect(() => {
    if (currentPage > 1) {
      savedLastPageRef.current = currentPage
    }
  }, [currentPage])

  // Load bookmarks & annotations & drawings & last page
  useEffect(() => {
    window.api.books.loadData(bookId).then((data) => {
      setBookmarks(data.bookmarks as BookmarkEntry[])
      setAnnotations(data.annotations as AnnotationEntry[])
      if (data.drawings) setPageDrawings(data.drawings as PageDrawings)
      if (data.lastPage && typeof data.lastPage === 'number' && data.lastPage > 1) {
        savedLastPageRef.current = data.lastPage as number
        setPendingGoToPage(data.lastPage as number)
      }
    })
  }, [bookId])

  // Helper to build save payload using ref for lastPage (never overwrites with 1)
  const doSave = useCallback(() => {
    window.api.books.saveData(bookId, {
      bookmarks,
      annotations,
      drawings: pageDrawings,
      lastPage: savedLastPageRef.current
    })
  }, [bookId, bookmarks, annotations, pageDrawings])

  // Save on bookmark/annotation/drawing changes
  const hasSavedInitial = useRef(false)
  useEffect(() => {
    // Skip the very first render (initial empty state)
    if (!hasSavedInitial.current) {
      hasSavedInitial.current = true
      return
    }
    if (bookmarks.length > 0 || annotations.length > 0 || Object.keys(pageDrawings).length > 0) {
      doSave()
    }
  }, [bookmarks, annotations, pageDrawings, doSave])

  // Debounced save for page changes while scrolling
  useEffect(() => {
    if (currentPage <= 1) return
    const timer = setTimeout(() => doSave(), 1000)
    return () => clearTimeout(timer)
  }, [currentPage, doSave])

  // Save on unmount so lastPage is always persisted
  useEffect(() => {
    return () => {
      window.api.books.saveData(bookId, {
        bookmarks: bookmarksRef.current,
        annotations: annotationsRef.current,
        drawings: pageDrawingsRef.current,
        lastPage: savedLastPageRef.current
      })
    }
  }, [bookId])

  // Page navigation — scrolls to the target page
  const goToPage = useCallback(
    (page: number) => {
      const p = Math.max(1, Math.min(page, totalPages))
      setCurrentPage(p)
      setPageInput(getPageLabel(p))

      const el = pageRefsMap.current.get(p)
      if (el) {
        isScrollingToPage.current = true
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        setTimeout(() => {
          isScrollingToPage.current = false
        }, 500)
      }
    },
    [totalPages, getPageLabel]
  )

  // Navigate to last-read page once pages are mounted and loading is complete
  useEffect(() => {
    if (loading) return
    if (pendingGoToPage && pageDimensions.size > 0 && totalPages > 0) {
      const target = Math.max(1, Math.min(pendingGoToPage, totalPages))
      setPendingGoToPage(null)

      // Explicitly render the target page and nearby pages first
      const pagesToRender = [target - 2, target - 1, target, target + 1, target + 2].filter(
        (p) => p >= 1 && p <= totalPages
      )
      for (const p of pagesToRender) {
        if (!renderedPagesRef.current.has(p)) {
          renderPageRef.current(p)
        }
      }

      // Wait a frame for DOM to update, then scroll to the exact element
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = pageRefsMap.current.get(target)
          if (el) {
            isScrollingToPage.current = true
            el.scrollIntoView({ behavior: 'instant', block: 'start' })
            setTimeout(() => {
              isScrollingToPage.current = false
            }, 500)
          }
          setCurrentPage(target)
          setPageInput(getPageLabel(target))
        })
      })
    }
  }, [pendingGoToPage, pageDimensions, totalPages, getPageLabel, loading])

  const nextPage = useCallback(() => {
    goToPage(currentPage + 1)
  }, [currentPage, goToPage])

  const prevPage = useCallback(() => {
    goToPage(currentPage - 1)
  }, [currentPage, goToPage])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault()
        setSearchOpen((prev) => !prev)
        setTimeout(() => searchInputRef.current?.focus(), 100)
        return
      }
      if (e.key === 'Escape') {
        if (searchOpen) {
          setSearchOpen(false)
        } else {
          onClose()
        }
        return
      }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault()
        nextPage()
      }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        prevPage()
      }
      if (e.key === '+' && e.ctrlKey) {
        e.preventDefault()
        setScale((s) => Math.min(s + 0.2, 3.0))
      }
      if (e.key === '-' && e.ctrlKey) {
        e.preventDefault()
        setScale((s) => Math.max(s - 0.2, 0.4))
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [searchOpen, onClose, nextPage, prevPage])

  // Listen for cross-book navigation events
  useEffect(() => {
    function handleGoToPage(e: Event): void {
      const detail = (e as CustomEvent).detail
      if (detail?.page) {
        goToPage(detail.page)
      }
    }
    window.addEventListener('pdf-go-to-page', handleGoToPage)
    return () => window.removeEventListener('pdf-go-to-page', handleGoToPage)
  }, [goToPage])

  // Search highlights per page
  const [searchHighlights, setSearchHighlights] = useState<Map<number, SearchHighlight[]>>(new Map())

  // Text search — also extracts highlight rectangles for matching text
  const handleSearch = useCallback(async () => {
    if (!pdfDoc || !searchQuery.trim()) return

    const results: Array<{ page: number; matches: number }> = []
    const highlights = new Map<number, SearchHighlight[]>()
    const query = searchQuery.toLowerCase()

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      try {
        const page = await pdfDoc.getPage(i)
        const textContent = await page.getTextContent()
        const viewport = page.getViewport({ scale })

        const pageHighlights: SearchHighlight[] = []
        let totalMatches = 0

        for (const item of textContent.items) {
          if (!('str' in item) || !item.str) continue
          const str = item.str.toLowerCase()
          if (!str.includes(query)) continue

          // Count matches in this item
          let pos = 0
          while ((pos = str.indexOf(query, pos)) !== -1) {
            totalMatches++
            pos += query.length
          }

          // Extract position from the transform matrix [scaleX, skewX, skewY, scaleY, tx, ty]
          const tx = item.transform[4]
          const ty = item.transform[5]
          const fontSize = Math.abs(item.transform[0]) || 12
          // Convert PDF coordinates to canvas coordinates via viewport
          const [x, y] = viewport.convertToViewportPoint(tx, ty)
          const itemWidth = item.width * viewport.scale
          const itemHeight = fontSize * viewport.scale

          pageHighlights.push({
            x,
            y: y - itemHeight,
            width: itemWidth,
            height: itemHeight
          })
        }

        if (totalMatches > 0) {
          results.push({ page: i, matches: totalMatches })
          highlights.set(i, pageHighlights)
        }
      } catch {
        // Skip page
      }
    }

    setSearchResults(results)
    setSearchHighlights(highlights)
    setCurrentSearchIdx(0)
    if (results.length > 0) {
      goToPage(results[0].page)
    }
  }, [pdfDoc, searchQuery, goToPage, scale])

  const nextSearchResult = useCallback(() => {
    if (searchResults.length === 0) return
    const next = (currentSearchIdx + 1) % searchResults.length
    setCurrentSearchIdx(next)
    goToPage(searchResults[next].page)
  }, [searchResults, currentSearchIdx, goToPage])

  const prevSearchResult = useCallback(() => {
    if (searchResults.length === 0) return
    const prev = (currentSearchIdx - 1 + searchResults.length) % searchResults.length
    setCurrentSearchIdx(prev)
    goToPage(searchResults[prev].page)
  }, [searchResults, currentSearchIdx, goToPage])

  // Bookmark management
  const addBookmark = useCallback(() => {
    const bookmark: BookmarkEntry = {
      id: generateId(),
      bookId,
      page: currentPage,
      label: `Page ${currentPage}`,
      createdAt: new Date().toISOString()
    }
    setBookmarks((prev) => [...prev, bookmark])
  }, [bookId, currentPage])

  const removeBookmark = useCallback((id: string) => {
    setBookmarks((prev) => prev.filter((b) => b.id !== id))
  }, [])

  const isPageBookmarked = bookmarks.some((b) => b.page === currentPage)

  // Annotation management
  const addAnnotation = useCallback(() => {
    if (!annotationText.trim()) return
    const annotation: AnnotationEntry = {
      id: generateId(),
      bookId,
      page: currentPage,
      text: annotationText.trim(),
      createdAt: new Date().toISOString()
    }
    setAnnotations((prev) => [...prev, annotation])
    setAnnotationText('')
    setShowAnnotationInput(false)
  }, [bookId, currentPage, annotationText])

  const removeAnnotation = useCallback((id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id))
  }, [])

  // Drawing callbacks
  const handleStrokeComplete = useCallback((_page: number, stroke: DrawingStroke) => {
    setPageDrawings((prev) => {
      const existing = prev[_page] || []
      return { ...prev, [_page]: [...existing, stroke] }
    })
    setRedoStack((prev) => {
      const next = { ...prev }
      delete next[_page]
      return next
    })
  }, [])

  const handleUndoDrawing = useCallback(() => {
    setPageDrawings((prev) => {
      const existing = prev[currentPage]
      if (!existing || existing.length === 0) return prev
      const removed = existing[existing.length - 1]
      setRedoStack((rs) => ({
        ...rs,
        [currentPage]: [...(rs[currentPage] || []), removed]
      }))
      return { ...prev, [currentPage]: existing.slice(0, -1) }
    })
  }, [currentPage])

  const handleRedoDrawing = useCallback(() => {
    setRedoStack((prev) => {
      const stack = prev[currentPage]
      if (!stack || stack.length === 0) return prev
      const restored = stack[stack.length - 1]
      setPageDrawings((pd) => ({
        ...pd,
        [currentPage]: [...(pd[currentPage] || []), restored]
      }))
      return { ...prev, [currentPage]: stack.slice(0, -1) }
    })
  }, [currentPage])

  const handleClearPageDrawings = useCallback(() => {
    const existing = pageDrawings[currentPage]
    if (!existing || existing.length === 0) return
    // Push all cleared strokes (reversed) onto redo so clear can be undone
    setRedoStack((prev) => ({
      ...prev,
      [currentPage]: [...(prev[currentPage] || []), ...existing.slice().reverse()]
    }))
    setPageDrawings((prev) => {
      const next = { ...prev }
      delete next[currentPage]
      return next
    })
  }, [currentPage, pageDrawings])

  const currentPageHasStrokes = (pageDrawings[currentPage]?.length ?? 0) > 0
  const currentPageHasRedo = (redoStack[currentPage]?.length ?? 0) > 0

  const _pageAnnotations = annotations.filter((a) => a.page === currentPage)

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-amber-400 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-300 text-lg">Loading {title}...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-50 bg-gray-950 flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-red-400 text-lg mb-2">Failed to load PDF</p>
          <p className="text-gray-400 text-sm mb-4">{error}</p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col">
      {/* Top toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        <button
          onClick={onClose}
          className="px-2 py-1 text-gray-400 hover:text-gray-200 transition-colors"
          title="Close (Esc)"
        >
          ✕
        </button>
        <span className="text-gray-200 font-medium truncate max-w-xs">{title}</span>

        <div className="flex-1" />

        {/* Page navigation */}
        <button
          onClick={prevPage}
          disabled={currentPage <= 1}
          className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded disabled:opacity-40 transition-colors"
        >
          ◀
        </button>
        <div className="flex items-center gap-1 text-sm text-gray-300">
          <input
            type="text"
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const resolved = resolvePageFromInput(pageInput)
                if (resolved) goToPage(resolved)
              }
            }}
            onBlur={() => {
              const resolved = resolvePageFromInput(pageInput)
              if (resolved) goToPage(resolved)
              else setPageInput(getPageLabel(currentPage))
            }}
            className="w-16 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-center text-gray-200 text-sm"
          />
          <span>/ {totalPages}</span>
        </div>
        <button
          onClick={nextPage}
          disabled={currentPage >= totalPages}
          className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded disabled:opacity-40 transition-colors"
        >
          ▶
        </button>

        <div className="w-px h-6 bg-gray-700 mx-1" />
        <button
          onClick={() => setScale((s) => Math.max(s - 0.2, 0.4))}
          className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
          title="Zoom out (Ctrl+-)"
        >
          −
        </button>
        <span className="text-sm text-gray-400 w-12 text-center">{Math.round(scale * 100)}%</span>
        <button
          onClick={() => setScale((s) => Math.min(s + 0.2, 3.0))}
          className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
          title="Zoom in (Ctrl++)"
        >
          +
        </button>

        <div className="w-px h-6 bg-gray-700 mx-1" />

        {/* Search */}
        <button
          onClick={() => {
            setSearchOpen(!searchOpen)
            setTimeout(() => searchInputRef.current?.focus(), 100)
          }}
          className={`px-2 py-1 rounded text-sm transition-colors ${
            searchOpen ? 'bg-amber-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
          }`}
          title="Search (Ctrl+F)"
        >
          🔍
        </button>

        {/* Two-page view toggle */}
        <button
          onClick={() => setTwoPageView(!twoPageView)}
          className={`px-2 py-1 rounded text-sm transition-colors ${
            twoPageView ? 'bg-amber-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
          }`}
          title={twoPageView ? 'Single page view' : 'Two-page view'}
        >
          📖
        </button>

        {/* Table of Contents toggle */}
        <button
          onClick={() => setShowToc(!showToc)}
          className={`px-2 py-1 rounded text-sm transition-colors ${
            showToc ? 'bg-amber-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
          }`}
          title="Table of Contents"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4 inline"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="16" y2="12" />
            <line x1="3" y1="18" x2="18" y2="18" />
          </svg>
        </button>

        {/* Bookmarks toggle */}
        <button
          onClick={() => setShowBookmarks(!showBookmarks)}
          className={`px-2 py-1 rounded text-sm transition-colors ${
            showBookmarks ? 'bg-amber-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
          }`}
          title="Bookmarks & annotations"
        >
          📑
        </button>

        {/* Add bookmark */}
        <button
          onClick={addBookmark}
          className={`px-2 py-1 rounded text-sm transition-colors ${
            isPageBookmarked ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
          }`}
          title={isPageBookmarked ? 'Page bookmarked' : 'Bookmark this page'}
        >
          {isPageBookmarked ? '🔖' : '📌'}
        </button>

        {/* Add annotation */}
        <button
          onClick={() => setShowAnnotationInput(!showAnnotationInput)}
          className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm transition-colors"
          title="Add annotation"
        >
          📝
        </button>

        <div className="w-px h-6 bg-gray-700 mx-1" />

        {/* Drawing tools */}
        <DrawingToolbar
          activeTool={drawingTool}
          color={drawingColor}
          size={drawingSize}
          onToolChange={setDrawingTool}
          onColorChange={setDrawingColor}
          onSizeChange={setDrawingSize}
          onUndo={handleUndoDrawing}
          onRedo={handleRedoDrawing}
          onClearPage={handleClearPageDrawings}
          hasStrokes={currentPageHasStrokes}
          hasRedo={currentPageHasRedo}
        />
      </div>

      {/* Search bar */}
      {searchOpen && (
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-900/90 border-b border-gray-800 shrink-0">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (searchResults.length > 0 && searchQuery.trim().length > 0) {
                  nextSearchResult()
                } else {
                  handleSearch()
                }
              }
            }}
            placeholder="Search text..."
            className="flex-1 max-w-sm bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-amber-500"
          />
          <button
            onClick={handleSearch}
            className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-sm transition-colors"
          >
            Search
          </button>
          {searchResults.length > 0 && (
            <>
              <span className="text-sm text-gray-400">
                {currentSearchIdx + 1} of {searchResults.length} pages
              </span>
              <button
                onClick={prevSearchResult}
                className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm"
              >
                ▲
              </button>
              <button
                onClick={nextSearchResult}
                className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm"
              >
                ▼
              </button>
            </>
          )}
          {searchResults.length === 0 && searchQuery.trim() && (
            <span className="text-sm text-gray-500">No results</span>
          )}
        </div>
      )}

      {/* Annotation input */}
      {showAnnotationInput && (
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-900/90 border-b border-gray-800 shrink-0">
          <span className="text-sm text-gray-400">Note for page {currentPage}:</span>
          <input
            type="text"
            value={annotationText}
            onChange={(e) => setAnnotationText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addAnnotation()
            }}
            placeholder="Type your annotation..."
            className="flex-1 max-w-md bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-amber-500"
            autoFocus
          />
          <button
            onClick={addAnnotation}
            disabled={!annotationText.trim()}
            className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-sm transition-colors disabled:opacity-40"
          >
            Add
          </button>
          <button
            onClick={() => setShowAnnotationInput(false)}
            className="px-2 py-1 text-gray-400 hover:text-gray-200 text-sm"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Table of Contents sidebar */}
        {showToc && tocEntries.length > 0 && (
          <div className="w-64 bg-gray-900 border-r border-gray-800 shrink-0 flex flex-col">
            <div className="p-3 border-b border-gray-800">
              <h3 className="text-sm font-bold text-amber-400">Table of Contents</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-1">
              {(() => {
                // Find the active entry: last entry whose page <= currentPage
                // If user clicked a specific entry, prefer that while on the same page
                let activeIdx = -1
                if (userSelectedTocIdx !== null && tocEntries[userSelectedTocIdx]?.page === currentPage) {
                  activeIdx = userSelectedTocIdx
                } else {
                  for (let i = 0; i < tocEntries.length; i++) {
                    const e = tocEntries[i]
                    if (e.crossRef || e.page === 0) continue
                    if (e.page <= currentPage) {
                      activeIdx = i
                    }
                  }
                }

                return tocEntries.map((entry, idx) => {
                  // Determine if this entry has children (next entry has higher level)
                  const hasChildren = idx < tocEntries.length - 1 && tocEntries[idx + 1].level > entry.level
                  const isCollapsed = collapsedSections.has(idx)

                  // Check if this entry is hidden because an ancestor is collapsed
                  let hidden = false
                  {
                    let searchLevel = entry.level
                    for (let p = idx - 1; p >= 0 && searchLevel > 0; p--) {
                      if (tocEntries[p].level < searchLevel) {
                        if (collapsedSections.has(p)) {
                          hidden = true
                          break
                        }
                        searchLevel = tocEntries[p].level
                      }
                    }
                  }

                  if (hidden) return null

                  const isCrossRefDivider = entry.page === 0 && !entry.crossRef
                  const isActive = idx === activeIdx && !isCrossRefDivider

                  const toggleCollapse = (e: React.MouseEvent) => {
                    e.stopPropagation()
                    setCollapsedSections((prev) => {
                      const next = new Set(prev)
                      if (next.has(idx)) next.delete(idx)
                      else next.add(idx)
                      return next
                    })
                  }

                  return (
                    <div
                      key={`${entry.title}-${entry.page}-${idx}`}
                      className={`flex items-center rounded transition-colors ${
                        isActive
                          ? 'bg-amber-600/20 text-amber-400'
                          : 'text-gray-300 hover:bg-gray-800 hover:text-gray-200'
                      }`}
                      style={{ paddingLeft: `${4 + entry.level * 12}px` }}
                    >
                      {/* Expand/collapse toggle */}
                      {hasChildren ? (
                        <button
                          onClick={toggleCollapse}
                          className="w-4 h-4 flex items-center justify-center text-[10px] text-gray-500 hover:text-gray-300 shrink-0"
                        >
                          {isCollapsed ? '▶' : '▼'}
                        </button>
                      ) : (
                        <span className="w-4 shrink-0" />
                      )}

                      {/* Navigation button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (entry.crossRef && onOpenBook) {
                            onOpenBook(entry.crossRef.bookId, entry.crossRef.page)
                          } else if (entry.page > 0) {
                            setUserSelectedTocIdx(idx)
                            goToPage(entry.page)
                          }
                        }}
                        className={`flex-1 text-left px-1 py-1 text-xs flex items-center justify-between gap-1 min-w-0 ${
                          entry.crossRef ? 'text-blue-400 hover:text-blue-300' : ''
                        }`}
                      >
                        <span className="truncate">{entry.title}</span>
                        {entry.page > 0 && (
                          <span className="text-[10px] text-gray-500 shrink-0">
                            {entry.crossRef ? '↗' : entry.page}
                          </span>
                        )}
                      </button>
                    </div>
                  )
                })
              })()}
            </div>
          </div>
        )}

        {/* Bookmarks & Annotations sidebar */}
        {showBookmarks && (
          <div className="w-64 bg-gray-900 border-r border-gray-800 overflow-y-auto shrink-0 p-3">
            <h3 className="text-sm font-bold text-amber-400 mb-3">Bookmarks</h3>
            {bookmarks.length === 0 ? (
              <p className="text-xs text-gray-500">No bookmarks yet</p>
            ) : (
              <div className="space-y-1 mb-4">
                {bookmarks
                  .sort((a, b) => a.page - b.page)
                  .map((bm) => (
                    <div key={bm.id} className="flex items-center gap-1 group">
                      <button
                        onClick={() => goToPage(bm.page)}
                        className={`flex-1 text-left text-xs px-2 py-1 rounded transition-colors ${
                          bm.page === currentPage ? 'bg-amber-600/20 text-amber-400' : 'text-gray-300 hover:bg-gray-800'
                        }`}
                      >
                        🔖 {bm.label}
                      </button>
                      <button
                        onClick={() => removeBookmark(bm.id)}
                        className="text-gray-600 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
              </div>
            )}

            <h3 className="text-sm font-bold text-amber-400 mb-3 mt-4">Annotations</h3>
            {annotations.length === 0 ? (
              <p className="text-xs text-gray-500">No annotations yet</p>
            ) : (
              <div className="space-y-2">
                {annotations
                  .sort((a, b) => a.page - b.page)
                  .map((ann) => (
                    <div key={ann.id} className="group bg-gray-800/50 rounded p-2">
                      <div className="flex items-center justify-between mb-1">
                        <button
                          onClick={() => goToPage(ann.page)}
                          className="text-[10px] text-amber-500 hover:text-amber-400"
                        >
                          Page {ann.page}
                        </button>
                        <button
                          onClick={() => removeAnnotation(ann.id)}
                          className="text-gray-600 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ✕
                        </button>
                      </div>
                      <p className="text-xs text-gray-300">{ann.text}</p>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Scrollable page area */}
        <div className="flex-1 overflow-auto" ref={scrollContainerRef} style={{ willChange: 'transform' }}>
          <div className="flex flex-col items-center py-4">
            {(() => {
              const renderPage = (pageNum: number) => {
                const dim = pageDimensions.get(pageNum)
                const pageAnns = annotations.filter((a) => a.page === pageNum)
                const highlights = searchHighlights.get(pageNum)
                const pageStrokes = pageDrawings[pageNum]
                const hasStrokes = pageStrokes && pageStrokes.length > 0
                // Only mount drawing canvas on pages that need it
                const showDrawingOverlay =
                  dim && (hasStrokes || (drawingTool !== 'none' && Math.abs(pageNum - currentPage) <= 2))

                return (
                  <div key={pageNum} className="flex flex-col items-center">
                    <div
                      data-page={pageNum}
                      ref={(el) => {
                        if (el) pageRefsMap.current.set(pageNum, el)
                        else pageRefsMap.current.delete(pageNum)
                      }}
                      className="relative shrink-0"
                      style={{
                        width: dim ? dim.width : 600,
                        minHeight: dim ? dim.height : 800,
                        contentVisibility: 'auto',
                        containIntrinsicSize: `${dim ? dim.width : 600}px ${dim ? dim.height : 800}px`
                      }}
                    >
                      <canvas
                        ref={(el) => {
                          if (el) canvasRefsMap.current.set(pageNum, el)
                          else canvasRefsMap.current.delete(pageNum)
                        }}
                        className="shadow-2xl block"
                      />

                      {highlights && highlights.length > 0 && (
                        <div className="absolute inset-0 pointer-events-none">
                          {highlights.map((hl, idx) => (
                            <div
                              key={idx}
                              className="absolute bg-yellow-400/40 border border-yellow-500/60 rounded-sm"
                              style={{
                                left: hl.x,
                                top: hl.y,
                                width: hl.width,
                                height: hl.height
                              }}
                            />
                          ))}
                        </div>
                      )}

                      {showDrawingOverlay && (
                        <PdfDrawingOverlay
                          page={pageNum}
                          width={dim!.width}
                          height={dim!.height}
                          activeTool={drawingTool}
                          color={drawingColor}
                          size={drawingSize}
                          strokes={pageStrokes || []}
                          onStrokeComplete={handleStrokeComplete}
                        />
                      )}

                      {pageAnns.length > 0 && (
                        <div className="absolute top-2 right-2 flex flex-col gap-1 max-w-48">
                          {pageAnns.map((ann) => (
                            <span
                              key={ann.id}
                              className="text-[10px] text-amber-300 bg-amber-900/70 px-1.5 py-0.5 rounded truncate"
                            >
                              📝 {ann.text}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              }

              if (twoPageView) {
                const rows: JSX.Element[] = []
                for (let i = 1; i <= totalPages; i += 2) {
                  const leftPage = i
                  const rightPage = i + 1 <= totalPages ? i + 1 : null
                  rows.push(
                    <div key={`spread-${i}`} className="flex flex-col items-center">
                      <div className="py-2 text-xs text-gray-500 select-none">
                        {leftPage}
                        {rightPage ? `–${rightPage}` : ''} / {totalPages}
                      </div>
                      <div className="flex gap-1">
                        {renderPage(leftPage)}
                        {rightPage && renderPage(rightPage)}
                      </div>
                    </div>
                  )
                }
                return rows
              }

              return Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                <div key={pageNum} className="flex flex-col items-center">
                  <div className="py-2 text-xs text-gray-500 select-none">
                    {pageNum} / {totalPages}
                  </div>
                  {renderPage(pageNum)}
                </div>
              ))
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}
