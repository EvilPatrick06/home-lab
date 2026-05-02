import React, { useState, useEffect, useRef, useMemo } from 'react';
import { usePlayerState } from './hooks/usePlayerState.js';
import { SignInButton } from './components/SignInButton.jsx';
import { consumeOAuthCallback, signOut } from './services/supabase.js';
import { useAuth } from './hooks/useAuth.js';
import { MergeChooser } from './components/MergeChooser.jsx';
import { ProfileChip } from './components/ProfileChip.jsx';
import { AccountPanel } from './components/AccountPanel.jsx';
import PromptModal from './components/PromptModal.jsx';
import DungeonExplore from './components/DungeonExplore.jsx';
import { Shield, Zap, Brain, FlaskConical, MessageSquare, Upload, Download, Trophy, Flame, Heart, Star, Target, BookOpen, ChevronRight, X, Check, RotateCcw, Sparkles, Lock, Award, TrendingUp, Clock, AlertTriangle, Skull, Crown, Eye, EyeOff, Play, Home, Settings, FileJson, Plus, Minus, ArrowLeft, Send, Loader2, HelpCircle, Calendar, Swords, Scroll, Wand2, Castle, Gem, Library, Trash2, Copy, Edit2, BookMarked, Share2, Tag, User, Hash, ChevronDown, ChevronUp, Compass, ScrollText, CheckCircle2, Gift, Coins, Package, ShoppingBag } from 'lucide-react';
import { TUTORIAL_STEPS, snapshotBaselines, migrateTutorialIndex } from './tutorial';
import { gradeAnswer } from './services/oracleGrader.js';

const TITLES = [
  { min: 1, max: 4, name: 'Apprentice' },
  { min: 5, max: 9, name: 'Squire' },
  { min: 10, max: 14, name: 'Adventurer' },
  { min: 15, max: 19, name: 'Scholar of the Arcane' },
  { min: 20, max: 24, name: 'Loremaster' },
  { min: 25, max: 29, name: 'Battle Mage' },
  { min: 30, max: 39, name: 'Knight of the Codex' },
  { min: 40, max: 49, name: 'Arcane Sage' },
  { min: 50, max: 59, name: 'High Wizard' },
  { min: 60, max: 74, name: 'Grand Magister' },
  { min: 75, max: 89, name: 'Archmage' },
  { min: 90, max: 99, name: 'Lord of the Tomes' },
  { min: 100, max: 9999, name: 'Mythic Demigod' },
];

// === Daily Quest System ===
// Each quest template specifies a target count and a counter source. The counter
// source is a function (state) -> number that returns a monotonically increasing
// value. A quest is complete when (currentCount - baselineCount) >= target.

const DAILY_QUEST_POOL = [
  {
    id: 'study_scrolls',
    title: 'Study the Sacred Scrolls',
    description: 'Review {target} scrolls of knowledge',
    icon: '📜',
    target: 10,
    xp: 75,
    counter: 'cardsReviewed',
  },
  {
    id: 'solve_riddles',
    title: 'Solve the Sphinx\'s Riddles',
    description: 'Answer {target} quiz riddles',
    icon: '🔮',
    target: 10,
    xp: 75,
    counter: 'quizAnswered',
  },
  {
    id: 'correct_streak',
    title: 'A Mind Unbroken',
    description: 'Get {target} correct answers',
    icon: '✨',
    target: 15,
    xp: 100,
    counter: 'totalCorrect',
  },
  {
    id: 'complete_run',
    title: 'Brave the Dungeon',
    description: 'Complete {target} dungeon delve(s)',
    icon: '⚔️',
    target: 1,
    xp: 100,
    counter: 'runsCompleted',
  },
  {
    id: 'defeat_boss',
    title: 'Slay a Dungeon Lord',
    description: 'Defeat {target} dungeon lord(s)',
    icon: '🐉',
    target: 1,
    xp: 150,
    counter: 'bossesDefeated',
  },
  {
    id: 'complete_lab',
    title: 'Endure the Trials',
    description: 'Complete {target} trial of skill',
    icon: '⚗️',
    target: 1,
    xp: 75,
    counter: 'labsCompleted',
  },
  {
    id: 'banish_foes',
    title: 'Banish the Forsaken',
    description: 'Remove {target} foes from thy Tome of Failures',
    icon: '🗡️',
    target: 3,
    xp: 60,
    counter: 'vaultBanished',
  },
  {
    id: 'consult_oracle',
    title: 'Seek the Oracle\'s Wisdom',
    description: 'Send {target} messages to the Oracle or Tome Search',
    icon: '🪄',
    target: 3,
    xp: 50,
    counter: 'oracleMessages',
  },
  {
    id: 'flawless_streak',
    title: 'Path of the Pure',
    description: 'Build a {target}-answer correct streak',
    icon: '🔥',
    target: 5,
    xp: 80,
    counter: 'currentStreak',
  },
  {
    id: 'big_correct',
    title: 'Trial by Hundreds',
    description: 'Get {target} correct answers',
    icon: '💯',
    target: 30,
    xp: 200,
    counter: 'totalCorrect',
  },
  {
    id: 'mode_master',
    title: 'The Versatile Path',
    description: 'Use {target} different study modes',
    icon: '🎭',
    target: 3,
    xp: 75,
    counter: 'modesUsedToday',
  },
  {
    id: 'card_marathon',
    title: 'Scholar\'s Marathon',
    description: 'Review {target} scrolls',
    icon: '📚',
    target: 25,
    xp: 150,
    counter: 'cardsReviewed',
  },
];

// Get the counter value from current player state for a given counter id.
const getCounterValue = (state, counterId) => {
  switch (counterId) {
    case 'cardsReviewed':
      return (state.library || []).reduce((s, t) => s + (t.progress?.cardsReviewed || 0), 0);
    case 'quizAnswered':
      return (state.library || []).reduce((s, t) => s + (t.progress?.quizAnswered || 0), 0);
    case 'labsCompleted':
      return (state.library || []).reduce((s, t) => s + (t.progress?.labsCompleted || 0), 0);
    case 'runsCompleted':
      return (state.library || []).reduce((s, t) => s + (t.progress?.runsCompleted || 0), 0);
    case 'bossesDefeated':
      return (state.library || []).reduce((s, t) => s + (t.progress?.bossesDefeated || 0), 0);
    case 'oracleMessages':
      return (state.library || []).reduce((s, t) => s + ((t.progress?.chatHistory || []).filter(m => m.role === 'user').length), 0);
    case 'totalCorrect':
      return state.totalCorrect || 0;
    case 'vaultBanished':
      return state.vaultBanished || 0;
    case 'currentStreak':
      // We don't persist a global current-streak; use longestStreak as the proxy.
      // Quests targeting streaks fire when longestStreak grows from the baseline.
      return state.longestStreak || 0;
    case 'modesUsedToday':
      return (state.modesUsedToday || []).length;
    default:
      return 0;
  }
};

// Pick N unique quests from the pool using a date-based deterministic shuffle.
const pickDailyQuests = (dateStr, n = 3) => {
  // Simple seeded shuffle so a given date always returns the same set.
  const seed = dateStr.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const arr = [...DAILY_QUEST_POOL];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.abs(Math.sin(seed + i)) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, n);
};

const todayDateStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// === Weekly Quest Pool ===
const WEEKLY_QUEST_POOL = [
  {
    id: 'weekly_dungeons',
    title: 'Conqueror of the Depths',
    description: 'Complete {target} dungeon delves',
    icon: '🏰',
    target: 5,
    xp: 500,
    counter: 'runsCompleted',
  },
  {
    id: 'weekly_correct',
    title: 'A Week of Wisdom',
    description: 'Get {target} correct answers',
    icon: '📖',
    target: 100,
    xp: 600,
    counter: 'totalCorrect',
  },
  {
    id: 'weekly_bosses',
    title: 'Vanquisher of Lords',
    description: 'Defeat {target} dungeon lords',
    icon: '👑',
    target: 3,
    xp: 700,
    counter: 'bossesDefeated',
  },
  {
    id: 'weekly_labs',
    title: 'Master of the Trials',
    description: 'Complete {target} trials of skill',
    icon: '⚗️',
    target: 5,
    xp: 500,
    counter: 'labsCompleted',
  },
  {
    id: 'weekly_cards',
    title: 'The Devoted Reader',
    description: 'Study {target} sacred scrolls',
    icon: '📜',
    target: 75,
    xp: 500,
    counter: 'cardsReviewed',
  },
  {
    id: 'weekly_streak',
    title: 'Path of the Unbroken',
    description: 'Build a {target}-answer streak',
    icon: '⭐',
    target: 20,
    xp: 600,
    counter: 'currentStreak',
  },
];

// Pick weekly quests deterministically from week-start date.
const pickWeeklyQuests = (weekStartStr, n = 3) => {
  const seed = weekStartStr.split('').reduce((acc, c) => acc + c.charCodeAt(0), 7);
  const arr = [...WEEKLY_QUEST_POOL];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.abs(Math.sin(seed + i)) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, n);
};

// Get the start of the current week (Monday) as a date string.
const currentWeekStartStr = () => {
  const d = new Date();
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, ...
  const diff = day === 0 ? -6 : 1 - day; // Monday-based
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// === Story Quest Chains ===
// Each chain is a sequence of steps. Steps unlock in order. Each step has
// a counter requirement (cumulative since chain started) or a special trigger.
const STORY_CHAINS = [
  {
    id: 'apprentice_path',
    title: "The Apprentice's Path",
    description: 'A long journey from humble apprentice to seasoned scholar.',
    icon: '🌟',
    rewardTitleId: 'pathwalker',
    rewardXp: 1000,
    rewardGold: 250,
    steps: [
      {
        id: 'ap_step1',
        title: 'The First Page',
        narrative: '"Every great scholar begins with a single page turned. Read your first scroll, and the journey shall begin."',
        target: 1,
        counter: 'cardsReviewed',
        xp: 50,
      },
      {
        id: 'ap_step2',
        title: 'A Riddle Tested',
        narrative: '"The Sphinx watches all who would learn. Prove thy mind by answering five riddles correctly."',
        target: 5,
        counter: 'totalCorrect',
        xp: 75,
      },
      {
        id: 'ap_step3',
        title: 'The Trial Begun',
        narrative: '"Knowledge alone is not enough. Endure the trials and learn what hands-on mastery feels like — complete a single trial."',
        target: 1,
        counter: 'labsCompleted',
        xp: 100,
      },
      {
        id: 'ap_step4',
        title: 'Into the Dungeon',
        narrative: '"Now thou must prove thy courage. Brave the dungeon and emerge victorious — survive a single delve."',
        target: 1,
        counter: 'runsCompleted',
        xp: 150,
      },
      {
        id: 'ap_step5',
        title: 'The Dragon\'s Fall',
        narrative: '"The dungeon lords are the true test. Defeat one and earn thy first laurels of glory."',
        target: 1,
        counter: 'bossesDefeated',
        xp: 200,
      },
      {
        id: 'ap_step6',
        title: 'Wisdom Through Repetition',
        narrative: '"True mastery comes from devotion. Study fifty scrolls, and the bond between thee and thy tome shall deepen."',
        target: 50,
        counter: 'cardsReviewed',
        xp: 200,
      },
      {
        id: 'ap_step7',
        title: 'The Sphinx\'s Champion',
        narrative: '"Answer fifty riddles correctly, and the Sphinx herself shall name thee a worthy adversary."',
        target: 50,
        counter: 'totalCorrect',
        xp: 250,
      },
      {
        id: 'ap_step8',
        title: 'The Walker of the Path',
        narrative: '"Five dungeons cleared. Three trials endured. Thy apprenticeship draws to a close — and a greater journey awaits beyond."',
        target: 5,
        counter: 'runsCompleted',
        xp: 300,
        finalStep: true,
      },
    ],
  },
];

const SPECIAL_TITLES = {
  flawless: { name: 'The Flawless', desc: 'Conquer a dungeon without a single mistake' },
  speedrunner: { name: 'The Swift', desc: 'Average under 5 seconds per riddle in a run' },
  vaultkeeper: { name: 'The Redeemed', desc: 'Banish all foes from your Tome of Failures' },
  bossslayer: { name: 'Dragonslayer', desc: 'Defeat a dungeon lord without losing a life' },
  centurion: { name: 'The Centurion', desc: 'Answer 100 riddles correctly' },
  streaker: { name: 'The Devoted', desc: 'Maintain a 7-day study streak' },
  initiated: { name: 'The Initiated', desc: 'Complete the Scholar\'s Awakening tutorial' },
  pathwalker: { name: 'Pathwalker', desc: 'Complete The Apprentice\'s Path story chain' },
  adeptVeteran: { name: 'Adept Veteran', desc: 'Complete a dungeon delve on Adept difficulty' },
  masterSlayer: { name: 'Master Slayer', desc: 'Complete a dungeon delve on Master difficulty' },
  mythicSage: { name: 'Mythic Sage', desc: 'Complete a dungeon delve on Mythic difficulty' },
};

// === Items & Inventory ===
// Five shop categories matching Phase 7's tabs. Each item belongs to one.
//   apothecary — consumable potions/buffs (per-run effects)
//   wardrobe   — titles, borders, profile flourishes
//   stable     — pet familiars (full mechanics arrive in Phase 18)
//   armory     — cosmetic weapon skins
//   sanctum    — permanent passive upgrades (one-time purchase, capped where noted)
const ITEM_CATEGORIES = {
  apothecary: { label: 'Apothecary', icon: '⚗️', color: 'rose',    blurb: 'Potions and brews to aid thy delve.' },
  wardrobe:   { label: 'Wardrobe',   icon: '👑', color: 'purple',  blurb: 'Titles, borders, and flourishes for thy profile.' },
  stable:     { label: 'Stable',     icon: '🐾', color: 'emerald', blurb: 'Familiars to walk the dungeon at thy side. (Awaiting Phase 18.)' },
  armory:     { label: 'Armory',     icon: '⚔️', color: 'sapphire', blurb: 'Cosmetic blades and shields for the discerning scholar.' },
  sanctum:    { label: 'Sanctum',    icon: '🏛️', color: 'amber',   blurb: 'Permanent boons — purchased once, carried forever.' },
  ingredient: { label: 'Ingredients', icon: '🌿', color: 'emerald', blurb: 'Reagents harvested from the dungeon — bring them to the bench to brew.' },
};

const ITEMS = [
  // === Apothecary (consumables) ===
  { id: 'minor_heal_tonic',  name: 'Minor Healing Tonic',     description: 'Restore one life when sipped within the dungeon.',                     icon: '🧪', category: 'apothecary', effect: 'heal_1',         price: 30 },
  { id: 'greater_heal_tonic',name: 'Greater Healing Draught', description: 'Restore two lives in a single delve.',                                 icon: '⚗️', category: 'apothecary', effect: 'heal_2',         price: 75 },
  { id: 'foresight_scroll',  name: 'Scroll of Foresight',     description: 'Reveal the category of the next riddle before it is posed.',           icon: '📜', category: 'apothecary', effect: 'preview_next',   price: 40 },
  { id: 'scholars_brew',     name: "Scholar's Brew",          description: 'A bracing tea — gain +25% XP for the next three riddles of a delve.',  icon: '☕', category: 'apothecary', effect: 'xp_buff_3',      price: 50 },
  { id: 'shield_draught',    name: 'Shield Draught',          description: 'Replenish a single dungeon shield (used in Phase 14 combat).',         icon: '🛡️', category: 'apothecary', effect: 'refill_shield',  price: 60 },
  { id: 'tinkers_oil',       name: "Tinker's Oil",            description: 'Restore a spent power-up (50/50 or Hint) within a delve.',             icon: '🪔', category: 'apothecary', effect: 'refill_powerup', price: 45 },
  { id: 'phoenix_ember',     name: 'Phoenix Ember',           description: 'Revive once after defeat — consumed on use.',                          icon: '🔥', category: 'apothecary', effect: 'revive_once',    price: 200 },

  // === Wardrobe (cosmetics + equippable head/cloak items) ===
  { id: 'iron_circlet',      name: 'Iron Circlet',            description: 'A modest crown of forged iron. Equip for +1 max HP in the dungeon.',    icon: '👑', category: 'wardrobe',   effect: 'border_iron',    price: 150, oneTime: true, slot: 'head'  },
  { id: 'silver_circlet',    name: 'Silver Circlet',          description: 'A keen-eyed silver crown. Equip for +1 max HP and +1 shield.',          icon: '🪙', category: 'wardrobe',   effect: 'border_silver',  price: 400, oneTime: true, slot: 'head'  },
  { id: 'gilded_quill',      name: 'Gilded Quill',            description: 'A quill of beaten gold — adorns thy profile with a flourish.',         icon: '🪶', category: 'wardrobe',   effect: 'avatar_quill',   price: 200, oneTime: true },
  { id: 'starbound_cloak',   name: 'Cloak of the Starbound',  description: 'A velvet cloak studded with constellations. Equip to ignore thy first wrong answer each delve.', icon: '🌌', category: 'wardrobe',   effect: 'bg_starbound',   price: 350, oneTime: true, slot: 'cloak' },
  { id: 'tome_emblem',       name: 'Tome Emblem',             description: 'A small heraldic crest of an open tome, displayed beside thy title.',   icon: '📔', category: 'wardrobe',   effect: 'emblem_tome',    price: 120, oneTime: true },

  // === Stable (pets — placeholder until Phase 18 wires the mechanics) ===
  { id: 'wise_owl_egg',      name: 'Wise Owl Egg',            description: 'Awaits hatching when the Stable opens (Phase 18).',                    icon: '🥚', category: 'stable',     effect: 'pet_owl',        price: 300, oneTime: true, locked: true },
  { id: 'dragon_hatchling',  name: 'Dragon Hatchling',        description: 'A tiny ember of a beast — slumbering until the Stable awakens.',       icon: '🐉', category: 'stable',     effect: 'pet_dragon',     price: 600, oneTime: true, locked: true },
  { id: 'mimic_pup',         name: 'Mimic Pup',               description: 'A mischievous treasure-hunter, awaiting its master in the Stable.',    icon: '🪙', category: 'stable',     effect: 'pet_mimic',      price: 400, oneTime: true, locked: true },

  // === Armory (equippable weapons) ===
  { id: 'oaken_blade',       name: 'Oaken Practice Blade',    description: 'A simple training blade. Equip for +1 score per foe felled.',           icon: '🗡️', category: 'armory',     effect: 'weapon_oaken',   price: 100, oneTime: true, slot: 'weapon' },
  { id: 'gilded_sabre',      name: 'Gilded Sabre',            description: 'A flourished sabre of beaten gold. Equip for +50% gold from foes.',     icon: '⚔️', category: 'armory',     effect: 'weapon_sabre',   price: 350, oneTime: true, slot: 'weapon' },
  { id: 'arcane_grimoire',   name: 'Arcane Grimoire',         description: 'A floating tome that hovers beside thee. Equip for +25% XP from foes.',  icon: '📖', category: 'armory',     effect: 'weapon_grim',    price: 500, oneTime: true, slot: 'weapon' },

  // === Sanctum (permanent passive upgrades) ===
  // permUpgrades counters live in playerState.permUpgrades; capped per item.
  { id: 'reinforced_tome',   name: 'Reinforced Tome',         description: '+1 maximum life in every dungeon delve. Stacks up to 3 times.',         icon: '📔', category: 'sanctum',    effect: 'perm_max_hp',     price: 500, permKey: 'maxHp',           cap: 3 },
  { id: 'lucky_coin',        name: 'Lucky Coin',              description: '+5% gold drop from all sources. Stacks up to 4 times (max +20%).',      icon: '🪙', category: 'sanctum',    effect: 'perm_gold_pct',   price: 600, permKey: 'goldDropPct',    cap: 4, step: 5 },
  { id: 'apprentice_pouch',  name: "Apprentice's Pouch",      description: '+1 starting potion in every delve. Stacks up to 3 times.',              icon: '🎒', category: 'sanctum',    effect: 'perm_start_pot',  price: 450, permKey: 'startingPotions',cap: 3 },
  { id: 'sage_focus',        name: 'Sage Focus',              description: '+5% XP from runs. Stacks up to 4 times (max +20%).',                    icon: '✨', category: 'sanctum',    effect: 'perm_xp_pct',     price: 700, permKey: 'xpBonusPct',     cap: 4, step: 5 },
  { id: 'fortune_charm',     name: 'Fortune Charm',           description: '+1% rare drop chance from chests. Stacks up to 5 times.',               icon: '🔮', category: 'sanctum',    effect: 'perm_rare_pct',   price: 800, permKey: 'rareDropPct',    cap: 5, step: 1 },

  // === Ingredients (Phase 16 — gathered from dungeon plants and chests) ===
  { id: 'ember_ash',     name: 'Ember Ash',     description: 'Soot scraped from a still-warm forge. Used in fire-touched brews.',      icon: '🔥', category: 'ingredient', price: 0 },
  { id: 'glow_root',     name: 'Glow Root',     description: 'A bioluminescent tuber that pulses faintly in the dark.',                 icon: '🌱', category: 'ingredient', price: 0 },
  { id: 'sigil_dust',    name: 'Sigil Dust',    description: 'Powdered runes left behind by faded inscriptions.',                       icon: '✨', category: 'ingredient', price: 0 },
  { id: 'iron_filings',  name: 'Iron Filings',  description: 'Curls of dark metal — the bones of shielding draughts.',                  icon: '⚙️', category: 'ingredient', price: 0 },
  { id: 'crystal_shard', name: 'Crystal Shard', description: 'A sliver of focused arcane glass.',                                       icon: '💎', category: 'ingredient', price: 0 },
  { id: 'moonleaf',      name: 'Moonleaf',      description: 'A pale leaf that holds the dew of a forgotten night.',                    icon: '🍃', category: 'ingredient', price: 0 },
  { id: 'cactus_pulp',   name: 'Cactus Pulp',   description: 'Wet fibre wrenched from a sun-bleached cactus.',                          icon: '🌵', category: 'ingredient', price: 0 },
];

// === Bestiary (Phase 17) ================================================
// Lore + drop hints for every dungeon dweller. Boss entries carry tiered
// lore: base on first defeat, expanded after 5, and a secret line after
// 10. All entries are unlocked on first kill and counted in
// playerState.bestiary[kind] = { defeats: N, firstDefeatedAt: iso }.
const BESTIARY_ENTRIES = {
  // === Crypt mobs ===
  wraith: {
    name: 'Wraith', icon: '👻', biome: 'crypt', tier: 'basic',
    lore: 'A spectral cryptanalyst who never finished her thesis on RC4. She drifts the catacombs murmuring the keystream that broke her.',
    drops: 'Glow Root · faint glimmers of gold',
  },
  skeleton: {
    name: 'Skeleton', icon: '💀', biome: 'crypt', tier: 'basic',
    lore: 'A sentry who fell guarding a server rack centuries past. Its bones still rattle the heartbeat of an obsolete IDS signature.',
    drops: 'Ember Ash · gold',
  },
  shade: {
    name: 'Shade', icon: '🟣', biome: 'crypt', tier: 'elite',
    lore: "A lich's apprentice — half-bound to the algorithms his master cracked. To fight him is to argue with a fragment of broken proof.",
    drops: 'Sigil Dust · Scholar\'s Brew (rare)',
  },
  // === Sewers mobs ===
  slime: {
    name: 'Slime', icon: '🟢', biome: 'sewers', tier: 'basic',
    lore: 'Born from the slow drip of an unsanitized parameter, it wears every payload it has ever swallowed.',
    drops: 'Glow Root · gold',
  },
  rat: {
    name: 'Sewer Rat', icon: '🐀', biome: 'sewers', tier: 'basic',
    lore: 'It has chewed through a hundred TLS handshakes to nest in this sewer. It knows where every stale session token sleeps.',
    drops: 'Moonleaf · gold',
  },
  ooze: {
    name: 'Ooze', icon: '🦠', biome: 'sewers', tier: 'elite',
    lore: 'A weaponised SQL injection given form. Three eyes, three statements, three ways to ruin thy day.',
    drops: 'Iron Filings · Shield Draught (rare)',
  },
  // === Tower mobs ===
  sentry: {
    name: 'Sentry', icon: '🛡️', biome: 'tower', tier: 'basic',
    lore: 'A defunct intrusion detector still running on stubborn firmware. It cannot be reasoned with, only outwitted.',
    drops: 'Iron Filings · gold',
  },
  drone: {
    name: 'Drone', icon: '🛸', biome: 'tower', tier: 'basic',
    lore: 'A reconnaissance scout from a long-decommissioned monitoring system. Its rotors hum with ancient packet captures.',
    drops: 'Crystal Shard · gold',
  },
  firewall: {
    name: 'Firewall', icon: '🔥', biome: 'tower', tier: 'elite',
    lore: 'A misconfigured perimeter given will. It blocks even truth, if the truth lacks the right ACL.',
    drops: 'Crystal Shard · Tinker\'s Oil (rare)',
  },
  // === Halls mobs ===
  spark: {
    name: 'Spark', icon: '⚡', biome: 'halls', tier: 'basic',
    lore: 'A wisp of static charge from a broken capacitor — drawn to anyone bearing fresh memory.',
    drops: 'Ember Ash · gold',
  },
  imp: {
    name: 'Imp', icon: '😈', biome: 'halls', tier: 'basic',
    lore: 'Mischievous BIOS-level malware fashioned into a winged shape.',
    drops: 'Cactus Pulp · Foresight Scroll (rare)',
  },
  sentinel: {
    name: 'Sentinel', icon: '🤖', biome: 'halls', tier: 'elite',
    lore: 'A hardened security appliance, animated by years of accumulated audit logs.',
    drops: 'Iron Filings · Phoenix Ember (very rare)',
  },
  // === Wastes mobs ===
  scorpion: {
    name: 'Scorpion', icon: '🦂', biome: 'wastes', tier: 'basic',
    lore: 'It dwells beneath the antennae, stinging signals with electromagnetic venom.',
    drops: 'Cactus Pulp · gold',
  },
  spider: {
    name: 'Spider', icon: '🕷️', biome: 'wastes', tier: 'basic',
    lore: 'It spins webs of social-engineered links between unwary travelers.',
    drops: 'Sigil Dust · gold',
  },
  elemental: {
    name: 'Sand Elemental', icon: '🌪️', biome: 'wastes', tier: 'elite',
    lore: 'A dust devil shaped by the broadcast prayers of forgotten radios.',
    drops: 'Crystal Shard · Phoenix Ember (rare)',
  },
  // === Bosses (tiered lore) ===
  lich: {
    name: 'The Lich', icon: '💀', biome: 'crypt', tier: 'boss',
    lore: {
      base: 'A skeletal sorcerer wreathed in violet flame, tethered to centuries of forbidden lore.',
      expanded: 'Once a brilliant cryptographer, he memorised every private key the world has ever forged. Each correct answer chips at the seal that binds him here.',
      secret: 'His true name is bound in his last unpublished paper, lost in the catacombs. Find that scroll and his binding breaks before the gauntlet ends.',
    },
    drops: 'Massive XP + gold on victory · titles · rare gear from boss-room Gold chests',
  },
  hydra: {
    name: 'The Hydra', icon: '🐉', biome: 'sewers', tier: 'boss',
    lore: {
      base: 'Three serpentine heads writhe in unison, fangs bared, breathing ruin.',
      expanded: 'It was born from a fork bomb that escaped a CTF lab. Each head is one of the spawned children, refusing to die.',
      secret: 'Cut off the parent process and the heads collapse — but no one alive remembers the PID.',
    },
    drops: 'Massive XP + gold on victory · Adept-tier titles · Silver/Gold chest pools',
  },
  sphinx: {
    name: 'The Sphinx', icon: '🦁', biome: 'tower', tier: 'boss',
    lore: {
      base: 'A regal beast whose patience is measured in falling sand.',
      expanded: 'It guards the route to a cache that holds the last legitimate session of every fallen scholar.',
      secret: 'Its riddle is itself — answer it not, and it answers thee. Speak the question aloud to undo the binding.',
    },
    drops: 'Massive XP + gold · Master-tier titles · Gold-chest gear seeds',
  },
  behemoth: {
    name: 'The Behemoth', icon: '🪨', biome: 'halls', tier: 'boss',
    lore: {
      base: 'A mountain of muscle and bone, scarred by ages of battle.',
      expanded: 'Bare-metal made flesh — the union of every server that refused to upgrade. It hits twice as hard but the punches are deterministic.',
      secret: 'Patch its kernel and it falls. The patch lives in a forgotten changelog, hidden behind seven Adept clears.',
    },
    drops: 'Massive XP + gold · Master-tier titles · Mythic seed chests',
  },
  riddler: {
    name: 'The Riddler', icon: '🃏', biome: 'wastes', tier: 'boss',
    lore: {
      base: 'A masked trickster who wagers the path on words alone.',
      expanded: 'He was a senior tester who solved every CTF before grading. None of his colleagues could prove a winner; none could prove a loser either.',
      secret: 'His mask is the flag — read it backwards. The reversal is engraved on the inside of the mask he never removes.',
    },
    drops: 'Massive XP + gold · Mythic-tier titles · Gold chest exclusives',
  },
};

// === Recipes (Phase 16) =================================================
// Crafting at The Bench: spend ingredients, gain a potion. Run-specific
// effects already live on the apothecary items themselves.
const RECIPES = [
  { id: 'craft_minor_heal',   name: 'Minor Healing Tonic',   icon: '🧪', resultId: 'minor_heal_tonic',   ingredients: { glow_root: 1, ember_ash: 1 } },
  { id: 'craft_greater_heal', name: 'Greater Healing Draught', icon: '⚗️', resultId: 'greater_heal_tonic', ingredients: { glow_root: 2, moonleaf: 1, ember_ash: 1 } },
  { id: 'craft_shield',       name: 'Shield Draught',        icon: '🛡️', resultId: 'shield_draught',     ingredients: { iron_filings: 1, crystal_shard: 1, sigil_dust: 1 } },
  { id: 'craft_brew',         name: "Scholar's Brew",        icon: '☕', resultId: 'scholars_brew',      ingredients: { moonleaf: 1, glow_root: 1, cactus_pulp: 1 } },
  { id: 'craft_phoenix',      name: 'Phoenix Ember',         icon: '🔥', resultId: 'phoenix_ember',      ingredients: { ember_ash: 3, sigil_dust: 1, crystal_shard: 1 } },
  { id: 'craft_foresight',    name: 'Foresight Scroll',      icon: '📜', resultId: 'foresight_scroll',   ingredients: { sigil_dust: 1, moonleaf: 1 } },
  { id: 'craft_tinkers',      name: "Tinker's Oil",          icon: '🪔', resultId: 'tinkers_oil',        ingredients: { iron_filings: 2, cactus_pulp: 1 } },
];

const findItem = (id) => ITEMS.find(it => it.id === id);

// === Difficulty Tiers (Phase 8) ===
// Each tier scales waves, lives, available power-ups, and XP/gold multipliers.
// Apprentice is always unlocked; higher tiers gate on level/runs/achievements
// per the unlock predicate. Tier-specific rewards (achievement + special title)
// fire on first completion at that tier.
const DIFFICULTIES = {
  apprentice: {
    label: 'Apprentice',
    icon: '🛡️',
    color: 'sapphire',
    lives: 3,
    waves: 5,
    powerups: { fiftyfifty: 2, hint: 2, freeze: 1 },
    xpMultiplier: 1,
    goldMultiplier: 1,
    description: 'The path of the novice. Three lives, five chambers, all aids permitted.',
    unlockText: null,
    completeAchievement: null,
    rewardTitleId: null,
  },
  adept: {
    label: 'Adept',
    icon: '⚔️',
    color: 'purple',
    lives: 3,
    waves: 7,
    powerups: { fiftyfifty: 1, hint: 1, freeze: 0 },
    xpMultiplier: 1.5,
    goldMultiplier: 1.25,
    description: "A seasoned reader's gauntlet. Seven chambers, fewer aids, sharper teeth.",
    unlockText: 'Reach level 10 — or complete 5 dungeon delves.',
    completeAchievement: 'adept_complete',
    rewardTitleId: 'adeptVeteran',
  },
  master: {
    label: 'Master',
    icon: '👑',
    color: 'amber',
    lives: 2,
    waves: 10,
    powerups: { fiftyfifty: 1, hint: 0, freeze: 0 },
    xpMultiplier: 2,
    goldMultiplier: 1.5,
    description: "A master's trial. Two lives, ten chambers, but a single aid in thy hand.",
    unlockText: 'Reach level 25 — or earn both Dragonslayer and Flawless Victory.',
    completeAchievement: 'master_complete',
    rewardTitleId: 'masterSlayer',
  },
  mythic: {
    label: 'Mythic',
    icon: '🌟',
    color: 'rose',
    lives: 1,
    waves: 12,
    powerups: { fiftyfifty: 0, hint: 0, freeze: 0 },
    xpMultiplier: 3,
    goldMultiplier: 2,
    description: 'A trial of legend. One life, twelve chambers, no quarter — only glory or oblivion.',
    unlockText: 'Reach level 50 — or complete a Master delve.',
    completeAchievement: 'mythic_complete',
    rewardTitleId: 'mythicSage',
  },
};

const DIFFICULTY_ORDER = ['apprentice', 'adept', 'master', 'mythic'];

// === Boss Variety (Phase 9) ===
// One archetype is rolled at the start of each dungeon delve. Each carries its
// own mechanic, narrative, and a first-defeat achievement. The BossEncounter
// component renders the appropriate sub-flow on the final wave.
const BOSS_TYPES = {
  lich: {
    id: 'lich',
    name: 'The Lich',
    icon: '💀',
    color: 'purple',
    flavor: 'A skeletal sorcerer wreathed in violet flame, tethered to centuries of forbidden lore.',
    mechanic: 'Chain five correct answers in a row. Any wrong answer breaks the chain to zero — but thy lives endure.',
    victoryText: 'The Lich crumbles to dust as thy knowledge unmakes its bindings.',
    defeatText: 'Thy lives ran dry before the chain could close. The Lich cackles in the dark.',
    achievement: 'first_lich',
    chainTarget: 5,
  },
  hydra: {
    id: 'hydra',
    name: 'The Hydra',
    icon: '🐉',
    color: 'emerald',
    flavor: 'Three serpentine heads writhe in unison, fangs bared, breathing ruin.',
    mechanic: 'Three riddles posed at once. Answer all three correctly — any miss costs a life and reshapes the heads.',
    victoryText: 'All three heads fall as one. The Hydra collapses with a final shriek.',
    defeatText: 'Thy lives ran dry under the Hydra\'s unceasing gaze.',
    achievement: 'first_hydra',
    headCount: 3,
  },
  riddler: {
    id: 'riddler',
    name: 'The Riddler',
    icon: '🃏',
    color: 'amber',
    flavor: 'A masked trickster who wagers the path on words alone.',
    mechanic: 'Three fill-in-the-blank riddles. No aids of magic or sage permitted.',
    victoryText: 'The Riddler bows to thy unaided wit and dissolves into mist.',
    defeatText: 'The Riddler twirls his cane. "Better luck in the next life, scholar."',
    achievement: 'first_riddler',
    riddleCount: 3,
  },
  sphinx: {
    id: 'sphinx',
    name: 'The Sphinx',
    icon: '🦁',
    color: 'sapphire',
    flavor: 'A regal beast whose patience is measured in falling sand.',
    mechanic: 'Three riddles, fifteen heartbeats each. Hesitation is its own answer — and the wrong one.',
    victoryText: 'The Sphinx rises and steps aside. The path is thine.',
    defeatText: 'The hourglass emptied before thy answer formed. The Sphinx remains.',
    achievement: 'first_sphinx',
    riddleCount: 3,
    secondsPerRiddle: 15,
  },
  behemoth: {
    id: 'behemoth',
    name: 'The Behemoth',
    icon: '🪨',
    color: 'rose',
    flavor: 'A mountain of muscle and bone, scarred by ages of battle.',
    mechanic: 'Seven blows to fell — but each missed strike costs TWO lives.',
    victoryText: 'The Behemoth topples like a felled oak. The earth shakes with its passing.',
    defeatText: 'The Behemoth\'s roar shakes the chamber. Thy strength is spent.',
    achievement: 'first_behemoth',
    hitsToFell: 7,
    lifeCost: 2,
  },
};

const BOSS_ORDER = ['lich', 'hydra', 'riddler', 'sphinx', 'behemoth'];

const rollBoss = () => BOSS_ORDER[Math.floor(Math.random() * BOSS_ORDER.length)];

// Returns true if the player meets the unlock requirement for a difficulty.
// Apprentice is always unlocked. Higher tiers gate on level / runs / specific
// achievements per the spec.
const isDifficultyUnlocked = (state, diffId) => {
  if (diffId === 'apprentice') return true;
  const totalRuns = (state.library || []).reduce((s, t) => s + (t.progress?.runsCompleted || 0), 0);
  const ach = state.achievements || [];
  if (diffId === 'adept') {
    return (state.level || 1) >= 10 || totalRuns >= 5;
  }
  if (diffId === 'master') {
    return (state.level || 1) >= 25 || (ach.includes('flawless') && ach.includes('first_boss'));
  }
  if (diffId === 'mythic') {
    return (state.level || 1) >= 50 || ach.includes('master_complete');
  }
  return false;
};


// Permanent-upgrade items are purchased N times, capped per item. This computes
// the player's current count, what the next purchase would cost, and whether
// they can buy more.
const sanctumCount = (state, item) => {
  if (item.category !== 'sanctum' || !item.permKey) return 0;
  const counts = state.permUpgrades || {};
  const step = item.step || 1;
  const raw = counts[item.permKey] || 0;
  return Math.floor(raw / step);
};

const sanctumAtCap = (state, item) => sanctumCount(state, item) >= (item.cap || 1);

// Deterministic daily shop stock — pick N items from a category's pool keyed
// on the date so every player sees the same rotation that day. Locked items
// (e.g. Stable pets pre-Phase 18) are still picked but rendered as "Sealed".
const pickShopStock = (dateStr, category, n = 4) => {
  const pool = ITEMS.filter((it) => it.category === category);
  if (pool.length === 0) return [];
  const seed = dateStr.split('').reduce((acc, c, i) => acc + c.charCodeAt(0) * (category.charCodeAt(i % category.length) + 1), 0);
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.abs(Math.sin(seed + i)) * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(n, shuffled.length));
};



const ACHIEVEMENTS = [
  { id: 'first_run', name: 'First Quest', desc: 'Complete your first dungeon delve', icon: '⚔️', category: 'milestone' },
  { id: 'first_boss', name: 'Dragonslayer', desc: 'Defeat your first dungeon lord', icon: '🐉', category: 'milestone' },
  { id: 'first_lab', name: 'Apprentice Alchemist', desc: 'Complete your first trial of skill', icon: '🧪', category: 'milestone' },
  { id: 'first_card', name: 'Open the Tome', desc: 'Study your first scroll', icon: '📖', category: 'milestone' },
  { id: 'first_quiz', name: 'Riddle Solver', desc: 'Answer your first riddle correctly', icon: '🎯', category: 'milestone' },
  { id: 'first_oracle', name: 'Seeker of Wisdom', desc: 'Consult the Oracle for the first time', icon: '🔮', category: 'milestone' },
  { id: 'first_tome', name: 'Library Founded', desc: 'Inscribe your first tome', icon: '📔', category: 'milestone' },
  { id: 'tome_collector', name: 'Tome Collector', desc: 'Maintain 3 tomes in your library', icon: '📚', category: 'milestone' },
  { id: 'tome_archivist', name: 'Grand Archivist', desc: 'Maintain 10 tomes in your library', icon: '🏛️', category: 'milestone' },

  { id: 'flawless', name: 'Flawless Victory', desc: 'Complete a quest with no mistakes', icon: '💎', category: 'dungeon' },
  { id: 'comeback', name: 'Against All Odds', desc: 'Win a quest with 1 life remaining', icon: '🔥', category: 'dungeon' },
  { id: 'cursed_run', name: 'Embrace the Curse', desc: 'Win a run with at least one curse active', icon: '☠️', category: 'dungeon' },
  { id: 'double_curse', name: 'Twice Cursed', desc: 'Win a run with 2 curses active', icon: '👹', category: 'dungeon' },
  { id: 'no_powerups_win', name: 'Steel and Wits', desc: 'Win a run without using any power-ups', icon: '⚔️', category: 'dungeon' },
  { id: 'speed_demon', name: 'The Swift Blade', desc: 'Average under 5 seconds per challenge in a run', icon: '⚡', category: 'dungeon' },
  { id: 'five_runs', name: 'Seasoned Adventurer', desc: 'Complete 5 dungeon delves', icon: '🛡️', category: 'dungeon' },
  { id: 'ten_runs', name: 'Veteran of the Crypts', desc: 'Complete 10 dungeon delves', icon: '🏰', category: 'dungeon' },
  { id: 'twenty_runs', name: 'Legendary Hero', desc: 'Complete 20 dungeon delves', icon: '👑', category: 'dungeon' },
  { id: 'five_bosses', name: 'Bane of Dragons', desc: 'Defeat 5 dungeon lords', icon: '🐲', category: 'dungeon' },

  { id: 'streak_10', name: 'Inferno', desc: 'Get 10 answers right in a row', icon: '🔥', category: 'streak' },
  { id: 'perfectionist', name: 'Chosen One', desc: 'Get 25 answers right in a row', icon: '✨', category: 'streak' },
  { id: 'streak_50', name: 'Touched by the Gods', desc: 'Get 50 answers right in a row', icon: '⭐', category: 'streak' },
  { id: 'streak_100', name: 'Mythic Streak', desc: 'Get 100 answers right in a row', icon: '🌟', category: 'streak' },

  { id: 'fifty_correct', name: 'Half-Century', desc: 'Answer 50 questions correctly', icon: '📊', category: 'volume' },
  { id: 'centurion', name: 'Hundred Trials', desc: 'Answer 100 questions correctly', icon: '🏆', category: 'volume' },
  { id: 'five_hundred', name: 'Master Scholar', desc: 'Answer 500 questions correctly', icon: '🎓', category: 'volume' },
  { id: 'thousand', name: 'Living Legend', desc: 'Answer 1,000 questions correctly', icon: '🏛️', category: 'volume' },

  { id: 'lab_master', name: 'Master Alchemist', desc: 'Complete 10 trials of skill', icon: '⚗️', category: 'labs' },
  { id: 'lab_grandmaster', name: 'Grand Alchemist', desc: 'Complete 25 trials of skill', icon: '🧙', category: 'labs' },
  { id: 'card_shark', name: 'Tome Reader', desc: 'Study 50 scrolls', icon: '📜', category: 'cards' },
  { id: 'card_master', name: 'Keeper of Lore', desc: 'Study 200 scrolls', icon: '📚', category: 'cards' },
  { id: 'quiz_warrior', name: 'Riddle Warrior', desc: 'Answer 100 quiz questions', icon: '⚔️', category: 'quiz' },
  { id: 'oracle_friend', name: 'Friend of the Oracle', desc: 'Send 25 messages to the Oracle', icon: '🪄', category: 'oracle' },

  { id: 'level_5', name: 'Rising Star', desc: 'Reach level 5', icon: '⬆️', category: 'level' },
  { id: 'level_10', name: 'True Adventurer', desc: 'Reach level 10', icon: '🎖️', category: 'level' },
  { id: 'level_25', name: 'Battle-Tested', desc: 'Reach level 25', icon: '🏅', category: 'level' },
  { id: 'level_50', name: 'High Wizard', desc: 'Reach level 50', icon: '🧙‍♂️', category: 'level' },
  { id: 'level_100', name: 'Mythic Demigod', desc: 'Reach level 100', icon: '⚡', category: 'level' },

  { id: 'sage', name: 'Path of Wisdom', desc: 'Maintain 80% accuracy over 100 questions', icon: '🦉', category: 'mastery' },
  { id: 'oracle_blessed', name: 'Oracle-Blessed', desc: 'Maintain 90% accuracy over 100 questions', icon: '👁️', category: 'mastery' },
  { id: 'enlightened', name: 'Enlightened', desc: 'Maintain 95% accuracy over 200 questions', icon: '🌅', category: 'mastery' },

  { id: 'streaker', name: 'Daily Devotion', desc: 'Study 7 days in a row', icon: '🕯️', category: 'devotion' },
  { id: 'devout', name: 'Faithful Servant', desc: 'Study 30 days in a row', icon: '⛪', category: 'devotion' },
  { id: 'eternal', name: 'Eternal Pilgrim', desc: 'Study 100 days in a row', icon: '♾️', category: 'devotion' },

  { id: 'vault_clear', name: 'Redemption', desc: 'Empty your tome of failures', icon: '🪄', category: 'vault' },
  { id: 'vault_warrior', name: 'Vanquisher', desc: 'Banish 25 foes from the vault', icon: '🗡️', category: 'vault' },

  { id: 'xp_1k', name: 'First Treasure', desc: 'Earn 1,000 total XP', icon: '💰', category: 'xp' },
  { id: 'xp_10k', name: 'Hoard of Gold', desc: 'Earn 10,000 total XP', icon: '💎', category: 'xp' },
  { id: 'xp_50k', name: 'Dragon\'s Vault', desc: 'Earn 50,000 total XP', icon: '👑', category: 'xp' },

  { id: 'all_modes', name: 'Versatile Scholar', desc: 'Use all 5 study modes at least once', icon: '🎭', category: 'special' },
  { id: 'tome_master', name: 'Tome Master', desc: 'Import a tome and complete every mode', icon: '📔', category: 'special' },

  { id: 'adept_complete', name: 'Adept Confirmed', desc: 'Complete a dungeon delve on Adept difficulty', icon: '⚔️', category: 'difficulty' },
  { id: 'master_complete', name: 'Master of the Path', desc: 'Complete a dungeon delve on Master difficulty', icon: '👑', category: 'difficulty' },
  { id: 'mythic_complete', name: 'Mythic Conqueror', desc: 'Complete a dungeon delve on Mythic difficulty', icon: '🌟', category: 'difficulty' },

  { id: 'first_lich',     name: 'Bane of the Lich',     desc: 'Defeat The Lich for the first time',     icon: '💀', category: 'boss' },
  { id: 'first_hydra',    name: 'Hydra Slayer',         desc: 'Defeat The Hydra for the first time',    icon: '🐉', category: 'boss' },
  { id: 'first_riddler',  name: 'Wits Unaided',         desc: 'Defeat The Riddler for the first time',  icon: '🃏', category: 'boss' },
  { id: 'first_sphinx',   name: 'Swift of Mind',        desc: 'Defeat The Sphinx for the first time',   icon: '🦁', category: 'boss' },
  { id: 'first_behemoth', name: 'Felled the Mountain',  desc: 'Defeat The Behemoth for the first time', icon: '🪨', category: 'boss' },
];

const xpForLevel = (lvl) => Math.floor(100 * Math.pow(lvl, 1.5));

const getTitle = (level, selectedSpecial, unlockedSpecials) => {
  if (selectedSpecial && unlockedSpecials.includes(selectedSpecial)) {
    return SPECIAL_TITLES[selectedSpecial].name;
  }
  const t = TITLES.find(t => level >= t.min && level <= t.max);
  return t ? t.name : 'Apprentice';
};

const generateTomeId = () => `tome_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Compress/decompress utilities for tome share codes.
// We use a simple base64+JSON approach (no external libs available in artifacts).
// The result is a reasonably long but copy-pasteable code.
const encodeTomeShareCode = (data) => {
  try {
    const json = JSON.stringify(data);
    // Convert to base64 (handles unicode via encodeURIComponent trick)
    const b64 = btoa(unescape(encodeURIComponent(json)));
    // Wrap in a recognizable header for validation
    return `TOME-V1:${b64}`;
  } catch (e) {
    return null;
  }
};
const decodeTomeShareCode = (code) => {
  try {
    let cleaned = code.trim();
    // Tolerate users wrapping the code in quotes or whitespace
    cleaned = cleaned.replace(/^["'`]+|["'`]+$/g, '');
    if (!cleaned.startsWith('TOME-V1:')) return null;
    const b64 = cleaned.slice('TOME-V1:'.length);
    const json = decodeURIComponent(escape(atob(b64)));
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
};

// Maps a story-step counter id to a player-facing action description, used by
// StoryStepCard to tell the user what to actually DO for the current step.
const COUNTER_ACTIONS = {
  cardsReviewed:  { icon: '📜', verb: 'Study',    noun: 'sacred scroll' },
  totalCorrect:   { icon: '✨', verb: 'Get',      noun: 'correct answer' },
  quizAnswered:   { icon: '🔮', verb: 'Answer',   noun: 'riddle' },
  labsCompleted:  { icon: '⚗️', verb: 'Complete', noun: 'trial of skill' },
  runsCompleted:  { icon: '⚔️', verb: 'Complete', noun: 'dungeon delve' },
  bossesDefeated: { icon: '🐉', verb: 'Defeat',   noun: 'dungeon lord' },
  oracleMessages: { icon: '🪄', verb: 'Consult',  noun: 'Oracle whisper' },
  vaultBanished:  { icon: '🗡️', verb: 'Banish',   noun: 'vault foe' },
  currentStreak:  { icon: '⭐', verb: 'Build',    noun: 'answer streak' },
};

const formatStoryAction = (counter, target) => {
  const a = COUNTER_ACTIONS[counter];
  if (!a) return `Reach ${target} progress`;
  const noun = target === 1 ? a.noun : `${a.noun}s`;
  return `${a.icon} ${a.verb} ${target} ${noun}`;
};

// Fisher-Yates shuffle. Returns a new array; doesn't mutate input.
const shuffleArray = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Some AI-generated tomes use `stages` instead of `steps` for lab steps. Normalize
// at import time so the rest of the app can rely on the canonical `steps` field.
// Idempotent — won't touch labs that already have `steps`.
const normalizeTomeData = (data) => {
  if (!data || !Array.isArray(data.labs)) return data;
  const labs = data.labs.map(lab => {
    if (!lab || lab.steps || !Array.isArray(lab.stages)) return lab;
    return { ...lab, steps: lab.stages };
  });
  return { ...data, labs };
};

const blankTomeProgress = () => ({
  cardsReviewed: 0,
  quizAnswered: 0,
  labsCompleted: 0,
  labsAttempted: 0,
  oracleMessages: 0,
  runsCompleted: 0,
  bossesDefeated: 0,
  cardProgress: {},
  questionStats: {},
  labProgress: {},
  mistakeVault: [],
  chatHistory: [],
  runHistory: [],            // Phase 10: per-tome list of completed/failed dungeon runs
});

// === Run History (Phase 10) ===
// Aggregates statistics across a tome's runHistory for the personal-records
// header. All runs included whether won or lost; "fastest win" filters to wins.
const summarizeRunHistory = (history) => {
  const runs = Array.isArray(history) ? history : [];
  const wins = runs.filter(r => r.won);
  const fastestWin = wins.reduce((best, r) => (best == null || r.durationSec < best.durationSec) ? r : best, null);
  const highestScore = runs.reduce((best, r) => (best == null || (r.score || 0) > (best.score || 0)) ? r : best, null);
  const longestStreak = runs.reduce((best, r) => (best == null || (r.maxStreak || 0) > (best.maxStreak || 0)) ? r : best, null);
  const totalWins = wins.length;
  const totalRuns = runs.length;
  const winRate = totalRuns > 0 ? (totalWins / totalRuns) : 0;
  return { runs, wins, fastestWin, highestScore, longestStreak, totalWins, totalRuns, winRate };
};

const formatDuration = (sec) => {
  if (!sec || !isFinite(sec)) return '—';
  const total = Math.round(sec);
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
};

const DEFAULT_STATE = {
  level: 1,
  xp: 0,
  totalXp: 0,
  totalCorrect: 0,
  totalAnswered: 0,
  longestStreak: 0,
  oracleMessages: 0,
  vaultBanished: 0,
  modesUsed: [],
  achievements: [],
  unlockedTitles: [],
  selectedTitle: null,
  lastStudyDate: null,
  studyStreak: 0,
  dailyChallengeDate: null,
  dailyChallengeCompleted: false,
  // Library system
  library: [],
  activeTomeId: null,
  // Tutorial
  tutorialStepIndex: 0,
  tutorialCompleted: false,
  tutorialStarted: false,
  tutorialPanelCollapsed: false,
  tutorialBaselines: null,
  // Dungeon attempt counter (any started run, including defeats)
  dungeonAttempts: 0,
  // Daily Quests
  dailyQuests: null,           // { date, quests: [{ id, baseline, claimed }] }
  modesUsedToday: [],          // tracked separately so it can reset daily
  // Weekly Quests
  weeklyQuests: null,          // { weekStart, quests: [{ id, baseline, claimed }] }
  // Story Quest Chains — keyed by chain id
  storyProgress: {},           // { [chainId]: { stepIndex, baseline, completed, claimedSteps: [] } }
  // Phase 17: Bestiary defeat tracker. { [kind]: { defeats, firstDefeatedAt } }
  bestiary: {},
  // Currency & Inventory
  gold: 0,
  inventory: {},               // { [itemId]: count } — consumables and cosmetics
  // Currently-equipped item ids per slot. Equipment grants in-dungeon
  // bonuses (HP, shields, XP/gold mults) and renders on the player sprite.
  // potions is a 3-element array — quick-use slots usable from hotkeys 1/2/3
  // inside the dungeon.
  equipped: {
    weapon: null,
    head: null,
    cloak: null,
    pet: null,
    potions: [null, null, null],
  },
  permUpgrades: {              // Sanctum stacks; raw counts (multiply by step for actual percent)
    maxHp: 0,
    goldDropPct: 0,
    startingPotions: 0,
    xpBonusPct: 0,
    rareDropPct: 0,
  },
};


export default function DungeonScholarApp() {
  const [screen, setScreen] = useState('home');
  const { user } = useAuth();
  const [playerState, setPlayerState, sync] = usePlayerState(DEFAULT_STATE, user);
  const [notification, setNotification] = useState(null);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [showTitles, setShowTitles] = useState(false);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [shareTomeId, setShareTomeId] = useState(null);
  const [editMetadataTomeId, setEditMetadataTomeId] = useState(null);
  const [showImportCodeModal, setShowImportCodeModal] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showAccountPanel, setShowAccountPanel] = useState(false);
  const fileInputRef = useRef(null);

  // Consume OAuth ?code=... on mount (returns false if no callback in URL).
  useEffect(() => {
    consumeOAuthCallback().catch((err) => {
      console.error('OAuth callback exchange failed:', err);
    });
  }, []);

  // Show welcome modal on first launch (when tutorial hasn't been started yet)
  useEffect(() => {
    if (!playerState.tutorialStarted && !playerState.tutorialCompleted) {
      setShowWelcomeModal(true);
    }
  }, []);

  // Tutorial step advancement helpers
  const advanceTutorial = (currentId) => {
    setPlayerState(prev => {
      if (prev.tutorialCompleted) return prev;
      const currentIdx = prev.tutorialStepIndex;
      const currentStep = TUTORIAL_STEPS[currentIdx];
      // Only advance if the requested step matches current
      if (!currentStep || currentStep.id !== currentId) return prev;
      const xp = currentStep.xp || 0;
      const nextIdx = currentIdx + 1;
      const isComplete = nextIdx >= TUTORIAL_STEPS.length;
      const next = {
        ...prev,
        xp: prev.xp + xp,
        totalXp: prev.totalXp + xp,
        tutorialStepIndex: isComplete ? currentIdx : nextIdx,
        tutorialCompleted: isComplete,
        // Snapshot baselines for the next step's auto-condition.
        tutorialBaselines: snapshotBaselines(prev),
      };
      if (isComplete) {
        if (!next.unlockedTitles.includes('initiated')) {
          next.unlockedTitles = [...next.unlockedTitles, 'initiated'];
          setTimeout(() => showNotif('Title Unlocked: The Initiated', 'achievement'), 200);
        }
        setTimeout(() => showNotif('Tutorial Complete! Welcome, brave scholar.', 'levelup'), 400);
      } else {
        setTimeout(() => showNotif(`+${xp} XP — ${currentStep.title}`, 'xp'), 100);
      }
      return next;
    });
  };

  const skipTutorial = () => {
    setPlayerState(prev => ({ ...prev, tutorialCompleted: true, tutorialStarted: true }));
    setShowWelcomeModal(false);
    showNotif('Tutorial skipped — thy path is thine own', 'info');
  };

  const startTutorial = () => {
    setPlayerState(prev => ({
      ...prev,
      tutorialStarted: true,
      tutorialBaselines: snapshotBaselines(prev),
    }));
    setShowWelcomeModal(false);
  };

  const toggleTutorialPanel = () => {
    setPlayerState(prev => ({ ...prev, tutorialPanelCollapsed: !prev.tutorialPanelCollapsed }));
  };

  // Auto-completion checks: any time relevant state changes, check if current
  // tutorial step's auto-condition is met *relative to the baseline captured
  // when this step began*, and advance.
  const totalCardsAcrossLib = useMemo(() => playerState.library.reduce((s, t) => s + (t.progress?.cardsReviewed || 0), 0), [playerState.library]);
  const totalLabsAttemptedAcrossLib = useMemo(
    () => playerState.library.reduce((s, t) => s + (t.progress?.labsAttempted || 0), 0),
    [playerState.library]
  );
  const totalOracleAcrossLib = useMemo(() => playerState.library.reduce((s, t) => s + ((t.progress?.chatHistory || []).filter(m => m.role === 'user').length), 0), [playerState.library]);
  const totalRunsAcrossLib = useMemo(() => playerState.library.reduce((s, t) => s + (t.progress?.runsCompleted || 0), 0), [playerState.library]);
  const totalQuizAnsweredAcrossLib = useMemo(() => playerState.library.reduce((s, t) => s + (t.progress?.quizAnswered || 0), 0), [playerState.library]);
  const totalDungeonRunsAttempted = useMemo(() => totalRunsAcrossLib, [totalRunsAcrossLib]);

  useEffect(() => {
    if (playerState.tutorialCompleted || !playerState.tutorialStarted) return;
    const step = TUTORIAL_STEPS[playerState.tutorialStepIndex];
    if (!step || !step.autoComplete) return;

    // Absolute checks: a returning user who already has a tome / studied card /
    // beaten the dungeon should not have to redo it. The previous "delta from
    // baseline" approach broke when users took an action that didn't change
    // the net count (e.g., delete-then-re-add a tome to satisfy step 3).
    let met = false;
    switch (step.autoCondition) {
      case 'has_tome':
        met = playerState.library.length > 0;
        break;
      case 'studied_card':
        met = totalCardsAcrossLib > 0;
        break;
      case 'solved_quiz':
        met = totalQuizAnsweredAcrossLib > 0;
        break;
      case 'lab_step':
        met = totalLabsAttemptedAcrossLib > 0;
        break;
      case 'oracle_used':
        met = totalOracleAcrossLib > 0;
        break;
      case 'dungeon_completed':
        met = (playerState.dungeonAttempts || 0) > 0;
        break;
    }
    if (met) advanceTutorial(step.id);
  }, [
    playerState.tutorialStarted,
    playerState.tutorialCompleted,
    playerState.tutorialStepIndex,
    playerState.library.length,
    playerState.dungeonAttempts,
    totalCardsAcrossLib,
    totalQuizAnsweredAcrossLib,
    totalLabsAttemptedAcrossLib,
    totalOracleAcrossLib,
    totalRunsAcrossLib,
  ]);

  // Active tome convenience accessor
  const activeTome = useMemo(() => {
    if (!playerState.activeTomeId) return null;
    const entry = playerState.library.find(t => t.id === playerState.activeTomeId);
    return entry || null;
  }, [playerState.activeTomeId, playerState.library]);

  const courseSet = activeTome?.data || null;
  const tomeProgress = activeTome?.progress || blankTomeProgress();

  // Pre-shuffled activity decks. Reshuffled ONLY when the active tome changes
  // (or on hard refresh). Keeps card/quiz order stable across navigation and
  // across cloud-sync echoes that re-create the courseSet reference.
  const [shuffledActivities, setShuffledActivities] = useState({ flashcards: [], quiz: [] });
  useEffect(() => {
    if (!courseSet) {
      setShuffledActivities({ flashcards: [], quiz: [] });
      return;
    }
    setShuffledActivities({
      flashcards: shuffleArray(courseSet.flashcards || []),
      quiz: shuffleArray(courseSet.quiz || []),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerState.activeTomeId]);

  const showNotif = (msg, type = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const updateProgress = (updates) => {
    setPlayerState(prev => {
      const next = { ...prev, ...updates };
      let leveledUp = false;
      while (next.xp >= xpForLevel(next.level)) {
        next.xp -= xpForLevel(next.level);
        next.level += 1;
        leveledUp = true;
      }
      if (leveledUp) {
        const newTitle = TITLES.find(t => next.level >= t.min && next.level <= t.max);
        if (newTitle && !next.unlockedTitles.includes(newTitle.name)) {
          next.unlockedTitles = [...next.unlockedTitles, newTitle.name];
        }
        const levelMilestones = [
          { lvl: 5, id: 'level_5' },
          { lvl: 10, id: 'level_10' },
          { lvl: 25, id: 'level_25' },
          { lvl: 50, id: 'level_50' },
          { lvl: 100, id: 'level_100' },
        ];
        levelMilestones.forEach(m => {
          if (next.level >= m.lvl && !next.achievements.includes(m.id)) {
            next.achievements = [...next.achievements, m.id];
            const ach = ACHIEVEMENTS.find(a => a.id === m.id);
            if (ach) setTimeout(() => showNotif(`Achievement Unlocked: ${ach.name}`, 'achievement'), 200);
          }
        });
        const xpMilestones = [
          { amt: 1000, id: 'xp_1k' },
          { amt: 10000, id: 'xp_10k' },
          { amt: 50000, id: 'xp_50k' },
        ];
        xpMilestones.forEach(m => {
          if (next.totalXp >= m.amt && !next.achievements.includes(m.id)) {
            next.achievements = [...next.achievements, m.id];
            const ach = ACHIEVEMENTS.find(a => a.id === m.id);
            if (ach) setTimeout(() => showNotif(`Achievement Unlocked: ${ach.name}`, 'achievement'), 300);
          }
        });
        setTimeout(() => showNotif(`Level Up! You are now Level ${next.level}`, 'levelup'), 100);
      }
      return next;
    });
  };

  // Update active tome's per-tome progress
  const updateTomeProgress = (updates) => {
    setPlayerState(prev => {
      if (!prev.activeTomeId) return prev;
      return {
        ...prev,
        library: prev.library.map(t =>
          t.id === prev.activeTomeId
            ? { ...t, progress: { ...t.progress, ...updates } }
            : t
        ),
      };
    });
  };

  const awardXP = (amount, reason) => {
    updateProgress({
      xp: playerState.xp + amount,
      totalXp: playerState.totalXp + amount,
    });
    if (reason) showNotif(`+${amount} XP — ${reason}`, 'xp');
  };

  const awardGold = (amount, reason) => {
    if (!amount || amount <= 0) return;
    setPlayerState(prev => ({ ...prev, gold: (prev.gold || 0) + amount }));
    if (reason) showNotif(`+${amount} gold — ${reason}`, 'xp');
  };

  // Returns { ok, reason } so the caller can render an error inline.
  const purchaseItem = (itemId) => {
    const item = findItem(itemId);
    if (!item) return { ok: false, reason: 'Unknown ware.' };
    if (item.locked) return { ok: false, reason: 'This ware is sealed until a future age.' };

    const owned = (playerState.inventory || {})[itemId] || 0;
    if (item.oneTime && owned > 0) return { ok: false, reason: 'Thou already ownest this.' };
    if (item.category === 'sanctum' && sanctumAtCap(playerState, item)) {
      return { ok: false, reason: 'Thou hast reached the cap of this boon.' };
    }
    if ((playerState.gold || 0) < item.price) {
      return { ok: false, reason: 'Insufficient gold to claim this ware.' };
    }

    setPlayerState(prev => {
      const next = {
        ...prev,
        gold: (prev.gold || 0) - item.price,
        inventory: {
          ...(prev.inventory || {}),
          [item.id]: ((prev.inventory || {})[item.id] || 0) + 1,
        },
      };
      if (item.category === 'sanctum' && item.permKey) {
        const step = item.step || 1;
        next.permUpgrades = {
          ...(prev.permUpgrades || {}),
          [item.permKey]: ((prev.permUpgrades || {})[item.permKey] || 0) + step,
        };
      }
      return next;
    });
    setTimeout(() => showNotif(`Acquired: ${item.name} (-${item.price} gold)`, 'success'), 50);
    return { ok: true };
  };

  // Equip an inventory item. Items with no `slot` are not equippable.
  const equipItem = (itemId) => {
    const item = findItem(itemId);
    if (!item || !item.slot) return { ok: false, reason: 'This ware cannot be equipped.' };
    if (item.locked) return { ok: false, reason: 'This ware is sealed until a future age.' };
    if (!((playerState.inventory || {})[itemId] || 0)) return { ok: false, reason: 'Thou dost not own this.' };
    setPlayerState(prev => ({
      ...prev,
      equipped: { ...(prev.equipped || {}), [item.slot]: itemId },
    }));
    setTimeout(() => showNotif(`Equipped: ${item.name}`, 'success'), 50);
    return { ok: true };
  };

  const unequipSlot = (slot) => {
    setPlayerState(prev => ({
      ...prev,
      equipped: { ...(prev.equipped || {}), [slot]: null },
    }));
  };

  // Equip an apothecary item into a specific potion slot (0/1/2). If
  // slotIdx is omitted, fills the first empty slot.
  const equipPotion = (itemId, slotIdx) => {
    const item = findItem(itemId);
    if (!item || item.category !== 'apothecary') {
      return { ok: false, reason: 'Only potions and elixirs can be quick-slotted.' };
    }
    if (!((playerState.inventory || {})[itemId] || 0)) {
      return { ok: false, reason: 'Thou dost not own this.' };
    }
    let placed = false;
    setPlayerState(prev => {
      const potions = [...(prev.equipped?.potions || [null, null, null])];
      if (typeof slotIdx === 'number') {
        potions[slotIdx] = itemId;
        placed = true;
      } else {
        const empty = potions.findIndex(p => !p);
        if (empty < 0) return prev;
        potions[empty] = itemId;
        placed = true;
      }
      return { ...prev, equipped: { ...(prev.equipped || {}), potions } };
    });
    if (placed) setTimeout(() => showNotif(`Quick-slotted: ${item.name}`, 'success'), 50);
    return placed ? { ok: true } : { ok: false, reason: 'No empty quick-slot.' };
  };

  const unequipPotion = (slotIdx) => {
    setPlayerState(prev => {
      const potions = [...(prev.equipped?.potions || [null, null, null])];
      potions[slotIdx] = null;
      return { ...prev, equipped: { ...(prev.equipped || {}), potions } };
    });
  };

  // Phase 17: increment a Bestiary entry on first/each defeat. Records
  // the first-defeated date so future analytics can show progression.
  const recordBestiary = (kind) => {
    if (!kind) return;
    setPlayerState(prev => {
      const b = { ...(prev.bestiary || {}) };
      const cur = b[kind] || { defeats: 0, firstDefeatedAt: null };
      b[kind] = {
        defeats: (cur.defeats || 0) + 1,
        firstDefeatedAt: cur.firstDefeatedAt || new Date().toISOString(),
      };
      return { ...prev, bestiary: b };
    });
  };

  // Phase 16: spend ingredients to brew a potion. Returns { ok, reason }.
  const craftRecipe = (recipeId) => {
    const recipe = RECIPES.find(r => r.id === recipeId);
    if (!recipe) return { ok: false, reason: 'Unknown recipe.' };
    const inv = playerState.inventory || {};
    const missing = Object.entries(recipe.ingredients).filter(([id, n]) => (inv[id] || 0) < n);
    if (missing.length > 0) {
      const first = findItem(missing[0][0]);
      return { ok: false, reason: `Need more ${first?.name || missing[0][0]}.` };
    }
    setPlayerState(prev => {
      const next = { ...prev, inventory: { ...(prev.inventory || {}) } };
      Object.entries(recipe.ingredients).forEach(([id, n]) => {
        const cur = next.inventory[id] || 0;
        const after = cur - n;
        if (after <= 0) delete next.inventory[id];
        else next.inventory[id] = after;
      });
      next.inventory[recipe.resultId] = (next.inventory[recipe.resultId] || 0) + 1;
      return next;
    });
    const result = findItem(recipe.resultId);
    setTimeout(() => showNotif(`Brewed: ${result?.name || recipe.name}`, 'success'), 50);
    return { ok: true };
  };

  // Phase 15: add an item to inventory (chest/plant drops, future loot).
  // Posts a notif so the player has a record outside the in-canvas float.
  const giveItem = (itemId, count = 1) => {
    const item = findItem(itemId);
    if (!item) return;
    setPlayerState(prev => {
      const inv = { ...(prev.inventory || {}) };
      inv[itemId] = (inv[itemId] || 0) + count;
      return { ...prev, inventory: inv };
    });
    setTimeout(() => showNotif(`Acquired: ${item.name}${count > 1 ? ` ×${count}` : ''}`, 'success'), 50);
  };

  // Consume one of an inventory item. Used by potion use in the dungeon
  // and by future apothecary effects. Auto-unequips potion slots that
  // referenced the now-zero item.
  const consumeItem = (itemId) => {
    setPlayerState(prev => {
      const inv = { ...(prev.inventory || {}) };
      const cur = inv[itemId] || 0;
      if (cur <= 0) return prev;
      const next = { ...prev };
      if (cur <= 1) {
        delete inv[itemId];
        const potions = (prev.equipped?.potions || [null, null, null]).map(p => p === itemId ? null : p);
        next.equipped = { ...(prev.equipped || {}), potions };
      } else {
        inv[itemId] = cur - 1;
      }
      next.inventory = inv;
      return next;
    });
  };

  const ACHIEVEMENT_GOLD = 50;
  const checkAchievement = (id) => {
    setPlayerState(prev => {
      if (prev.achievements.includes(id)) return prev;
      const ach = ACHIEVEMENTS.find(a => a.id === id);
      if (ach) {
        setTimeout(() => showNotif(`Achievement Unlocked: ${ach.name} (+${ACHIEVEMENT_GOLD} gold)`, 'achievement'), 50);
      }
      return {
        ...prev,
        achievements: [...prev.achievements, id],
        gold: (prev.gold || 0) + ACHIEVEMENT_GOLD,
      };
    });
  };

  const unlockSpecialTitle = (id) => {
    setPlayerState(prev => {
      if (prev.unlockedTitles.includes(id)) return prev;
      setTimeout(() => showNotif(`Title Unlocked: ${SPECIAL_TITLES[id].name}`, 'achievement'), 50);
      return { ...prev, unlockedTitles: [...prev.unlockedTitles, id] };
    });
  };

  const recordAnswer = (correct, item) => {
    setPlayerState(prev => {
      const newAnswered = prev.totalAnswered + 1;
      const newCorrect = prev.totalCorrect + (correct ? 1 : 0);
      // +1 gold per correct answer (Phase 6). Silent — no per-answer notif.
      const newGold = (prev.gold || 0) + (correct ? 1 : 0);
      let next = { ...prev, totalAnswered: newAnswered, totalCorrect: newCorrect, gold: newGold };

      // Bump labsAttempted on every lab answer (success or failure) for tutorial detection.
      if (item && item._type === 'lab' && prev.activeTomeId) {
        next = {
          ...next,
          library: next.library.map(t =>
            t.id === prev.activeTomeId
              ? {
                  ...t,
                  progress: {
                    ...t.progress,
                    labsAttempted: (t.progress?.labsAttempted || 0) + 1,
                  },
                }
              : t
          ),
        };
      }

      // Add to active tome's mistake vault if wrong
      if (!correct && item && prev.activeTomeId) {
        next = {
          ...next,
          library: next.library.map(t => {
            if (t.id !== prev.activeTomeId) return t;
            const existing = (t.progress?.mistakeVault || []).find(m => m.id === item.id);
            if (existing) return t;
            return {
              ...t,
              progress: {
                ...t.progress,
                mistakeVault: [...(t.progress?.mistakeVault || []), { ...item, addedAt: Date.now() }],
              },
            };
          }),
        };
      }

      // Volume / accuracy achievement checks
      const volumeMilestones = [
        { amt: 50, id: 'fifty_correct' },
        { amt: 100, id: 'centurion' },
        { amt: 500, id: 'five_hundred' },
        { amt: 1000, id: 'thousand' },
      ];
      volumeMilestones.forEach(m => {
        if (newCorrect >= m.amt && !next.achievements.includes(m.id)) {
          next.achievements = [...next.achievements, m.id];
          const ach = ACHIEVEMENTS.find(a => a.id === m.id);
          if (ach) setTimeout(() => showNotif(`Achievement Unlocked: ${ach.name}`, 'achievement'), 100);
        }
      });
      const accuracy = newCorrect / newAnswered;
      const accChecks = [
        { count: 100, acc: 0.8, id: 'sage' },
        { count: 100, acc: 0.9, id: 'oracle_blessed' },
        { count: 200, acc: 0.95, id: 'enlightened' },
      ];
      accChecks.forEach(c => {
        if (newAnswered >= c.count && accuracy >= c.acc && !next.achievements.includes(c.id)) {
          next.achievements = [...next.achievements, c.id];
          const ach = ACHIEVEMENTS.find(a => a.id === c.id);
          if (ach) setTimeout(() => showNotif(`Achievement Unlocked: ${ach.name}`, 'achievement'), 150);
        }
      });
      return next;
    });
  };

  const removeFromVault = (id) => {
    setPlayerState(prev => {
      if (!prev.activeTomeId) return prev;
      const newBanished = (prev.vaultBanished || 0) + 1;
      const next = {
        ...prev,
        vaultBanished: newBanished,
        library: prev.library.map(t =>
          t.id === prev.activeTomeId
            ? { ...t, progress: { ...t.progress, mistakeVault: (t.progress?.mistakeVault || []).filter(m => m.id !== id) } }
            : t
        ),
      };
      if (newBanished >= 25 && !next.achievements.includes('vault_warrior')) {
        next.achievements = [...next.achievements, 'vault_warrior'];
        const ach = ACHIEVEMENTS.find(a => a.id === 'vault_warrior');
        if (ach) setTimeout(() => showNotif(`Achievement Unlocked: ${ach.name}`, 'achievement'), 100);
      }
      return next;
    });
  };

  const trackDungeonAttempt = () => {
    setPlayerState(prev => ({ ...prev, dungeonAttempts: (prev.dungeonAttempts || 0) + 1 }));
  };

  // === Daily Quest System ===
  // Refresh quests whenever the date changes (or on first load).
  useEffect(() => {
    const today = todayDateStr();
    if (!playerState.dailyQuests || playerState.dailyQuests.date !== today) {
      setPlayerState(prev => {
        const picked = pickDailyQuests(today, 3);
        return {
          ...prev,
          dailyQuests: {
            date: today,
            quests: picked.map(q => ({
              id: q.id,
              baseline: getCounterValue(prev, q.counter),
              claimed: false,
            })),
          },
          modesUsedToday: [],
        };
      });
    }
  }, [playerState.dailyQuests?.date]);

  // Track modes used today (resets with daily quest refresh).
  const trackModeUseDaily = (mode) => {
    setPlayerState(prev => {
      if (prev.modesUsedToday?.includes(mode)) return prev;
      return { ...prev, modesUsedToday: [...(prev.modesUsedToday || []), mode] };
    });
  };

  // Compute current quest progress.
  const dailyQuestStatus = useMemo(() => {
    if (!playerState.dailyQuests) return [];
    return playerState.dailyQuests.quests.map(q => {
      const template = DAILY_QUEST_POOL.find(t => t.id === q.id);
      if (!template) return null;
      const current = getCounterValue(playerState, template.counter);
      const progress = Math.max(0, current - q.baseline);
      const complete = progress >= template.target;
      return {
        ...template,
        baseline: q.baseline,
        progress: Math.min(progress, template.target),
        target: template.target,
        complete,
        claimed: q.claimed,
        claimable: complete && !q.claimed,
      };
    }).filter(Boolean);
  }, [playerState.dailyQuests, playerState.library, playerState.totalCorrect, playerState.longestStreak, playerState.vaultBanished, playerState.modesUsedToday]);

  const claimQuest = (questId) => {
    setPlayerState(prev => {
      if (!prev.dailyQuests) return prev;
      const quest = prev.dailyQuests.quests.find(q => q.id === questId);
      if (!quest || quest.claimed) return prev;
      const template = DAILY_QUEST_POOL.find(t => t.id === questId);
      if (!template) return prev;
      const current = getCounterValue(prev, template.counter);
      const progress = current - quest.baseline;
      if (progress < template.target) return prev;
      const xp = template.xp;
      const gold = Math.max(1, Math.floor(xp * 0.1));
      setTimeout(() => showNotif(`+${xp} XP, +${gold} gold — ${template.title}`, 'xp'), 50);
      return {
        ...prev,
        xp: prev.xp + xp,
        totalXp: prev.totalXp + xp,
        gold: (prev.gold || 0) + gold,
        dailyQuests: {
          ...prev.dailyQuests,
          quests: prev.dailyQuests.quests.map(q => q.id === questId ? { ...q, claimed: true } : q),
        },
      };
    });
    // Re-trigger level-up check after XP grant.
    setTimeout(() => updateProgress({}), 100);
  };

  const claimAllQuests = () => {
    dailyQuestStatus.filter(q => q.claimable).forEach(q => claimQuest(q.id));
  };

  // === Weekly Quest System ===
  // Refresh weekly quests whenever the week changes (Monday-based).
  useEffect(() => {
    const weekStart = currentWeekStartStr();
    if (!playerState.weeklyQuests || playerState.weeklyQuests.weekStart !== weekStart) {
      setPlayerState(prev => {
        const picked = pickWeeklyQuests(weekStart, 3);
        return {
          ...prev,
          weeklyQuests: {
            weekStart,
            quests: picked.map(q => ({
              id: q.id,
              baseline: getCounterValue(prev, q.counter),
              claimed: false,
            })),
          },
        };
      });
    }
  }, [playerState.weeklyQuests?.weekStart]);

  const weeklyQuestStatus = useMemo(() => {
    if (!playerState.weeklyQuests) return [];
    return playerState.weeklyQuests.quests.map(q => {
      const template = WEEKLY_QUEST_POOL.find(t => t.id === q.id);
      if (!template) return null;
      const current = getCounterValue(playerState, template.counter);
      const progress = Math.max(0, current - q.baseline);
      const complete = progress >= template.target;
      return {
        ...template,
        baseline: q.baseline,
        progress: Math.min(progress, template.target),
        target: template.target,
        complete,
        claimed: q.claimed,
        claimable: complete && !q.claimed,
      };
    }).filter(Boolean);
  }, [playerState.weeklyQuests, playerState.library, playerState.totalCorrect, playerState.longestStreak, playerState.vaultBanished]);

  const claimWeeklyQuest = (questId) => {
    setPlayerState(prev => {
      if (!prev.weeklyQuests) return prev;
      const quest = prev.weeklyQuests.quests.find(q => q.id === questId);
      if (!quest || quest.claimed) return prev;
      const template = WEEKLY_QUEST_POOL.find(t => t.id === questId);
      if (!template) return prev;
      const current = getCounterValue(prev, template.counter);
      if (current - quest.baseline < template.target) return prev;
      const xp = template.xp;
      const gold = Math.max(1, Math.floor(xp * 0.1));
      setTimeout(() => showNotif(`+${xp} XP, +${gold} gold — ${template.title}`, 'xp'), 50);
      return {
        ...prev,
        xp: prev.xp + xp,
        totalXp: prev.totalXp + xp,
        gold: (prev.gold || 0) + gold,
        weeklyQuests: {
          ...prev.weeklyQuests,
          quests: prev.weeklyQuests.quests.map(q => q.id === questId ? { ...q, claimed: true } : q),
        },
      };
    });
    setTimeout(() => updateProgress({}), 100);
  };

  const claimAllWeeklyQuests = () => {
    weeklyQuestStatus.filter(q => q.claimable).forEach(q => claimWeeklyQuest(q.id));
  };

  // === Story Quest Chain System ===
  // Initialize storyProgress for any chain not yet seen, snapshotting current
  // counter values as the baseline so progress measures NEW activity.
  // Mount-only: depending on playerState.storyProgress causes a feedback loop
  // when cloud sync replaces state with a version that lacks the field.
  // The defensive sp-init in claimStoryStep handles the missing-entry case.
  useEffect(() => {
    setPlayerState(prev => {
      let changed = false;
      const next = { ...(prev.storyProgress || {}) };
      STORY_CHAINS.forEach(chain => {
        if (!next[chain.id]) {
          const firstStep = chain.steps[0];
          next[chain.id] = {
            stepIndex: 0,
            baseline: getCounterValue(prev, firstStep.counter),
            completed: false,
            claimedSteps: [],
          };
          changed = true;
        }
      });
      return changed ? { ...prev, storyProgress: next } : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const storyChainStatus = useMemo(() => {
    return STORY_CHAINS.map(chain => {
      const sp = playerState.storyProgress?.[chain.id] || {
        stepIndex: 0, baseline: 0, completed: false, claimedSteps: [],
      };
      const currentStep = sp.stepIndex < chain.steps.length ? chain.steps[sp.stepIndex] : null;
      let progress = 0;
      let claimable = false;
      if (!sp.completed && currentStep) {
        const current = getCounterValue(playerState, currentStep.counter);
        progress = Math.max(0, current - sp.baseline);
        claimable = progress >= currentStep.target;
      }
      return {
        chain,
        stepIndex: sp.stepIndex,
        currentStep,
        progress: currentStep ? Math.min(progress, currentStep.target) : 0,
        target: currentStep?.target || 0,
        claimable,
        completed: sp.completed,
        claimedSteps: sp.claimedSteps || [],
      };
    });
  }, [playerState.storyProgress, playerState.library, playerState.totalCorrect, playerState.longestStreak, playerState.vaultBanished]);

  const claimableStoryStepCount = useMemo(
    () => storyChainStatus.filter(s => s.claimable).length,
    [storyChainStatus]
  );

  const claimStoryStep = (chainId) => {
    setPlayerState(prev => {
      const chain = STORY_CHAINS.find(c => c.id === chainId);
      if (!chain) return prev;
      // Defensive init: if storyProgress is missing (cloud-sync race), treat
      // the chain as freshly started with baseline 0 so existing progress
      // counts. Mirrors the storyChainStatus memo's fallback default.
      let sp = prev.storyProgress?.[chainId];
      if (!sp) {
        sp = { stepIndex: 0, baseline: 0, completed: false, claimedSteps: [] };
      }
      if (sp.completed) return prev;
      const step = chain.steps[sp.stepIndex];
      if (!step) return prev;
      const current = getCounterValue(prev, step.counter);
      if (current - sp.baseline < step.target) return prev;
      const isFinal = sp.stepIndex === chain.steps.length - 1;
      const stepXp = step.xp;
      const bonusXp = isFinal ? (chain.rewardXp || 0) : 0;
      const totalXp = stepXp + bonusXp;
      // Per-step gold tracks XP at 10%. Chain completion grants an explicit
      // chain.rewardGold on top (defaults to 10% of rewardXp if unset).
      const stepGold = Math.max(1, Math.floor(stepXp * 0.1));
      const chainGold = isFinal
        ? (chain.rewardGold ?? Math.floor((chain.rewardXp || 0) * 0.1))
        : 0;
      const totalGold = stepGold + chainGold;
      setTimeout(() => showNotif(`+${stepXp} XP, +${stepGold} gold — ${step.title}`, 'xp'), 50);
      if (isFinal && bonusXp > 0) {
        setTimeout(() => showNotif(`+${bonusXp} XP, +${chainGold} gold — Chain Complete: ${chain.title}`, 'xp'), 200);
      }

      const nextStepIndex = sp.stepIndex + 1;
      const nextStep = chain.steps[nextStepIndex];
      const nextBaseline = nextStep ? getCounterValue(prev, nextStep.counter) : sp.baseline;

      const next = {
        ...prev,
        xp: prev.xp + totalXp,
        totalXp: prev.totalXp + totalXp,
        gold: (prev.gold || 0) + totalGold,
        storyProgress: {
          ...prev.storyProgress,
          [chainId]: {
            stepIndex: nextStepIndex,
            baseline: nextBaseline,
            completed: isFinal,
            claimedSteps: [...(sp.claimedSteps || []), step.id],
          },
        },
      };

      if (isFinal && chain.rewardTitleId && !prev.unlockedTitles.includes(chain.rewardTitleId)) {
        next.unlockedTitles = [...prev.unlockedTitles, chain.rewardTitleId];
        const titleName = SPECIAL_TITLES[chain.rewardTitleId]?.name || chain.rewardTitleId;
        setTimeout(() => showNotif(`Title Unlocked: ${titleName}`, 'achievement'), 350);
      }

      return next;
    });
    setTimeout(() => updateProgress({}), 100);
  };

  // Sum of claimable items across daily, weekly, and story-chain systems.
  const claimableQuestCount = useMemo(
    () =>
      dailyQuestStatus.filter(q => q.claimable).length +
      weeklyQuestStatus.filter(q => q.claimable).length +
      claimableStoryStepCount,
    [dailyQuestStatus, weeklyQuestStatus, claimableStoryStepCount]
  );

  const trackModeUse = (mode) => {
    trackModeUseDaily(mode);
    setPlayerState(prev => {
      if (prev.modesUsed.includes(mode)) return prev;
      const newModes = [...prev.modesUsed, mode];
      const next = { ...prev, modesUsed: newModes };
      if (newModes.length >= 5 && !next.achievements.includes('all_modes')) {
        next.achievements = [...next.achievements, 'all_modes'];
        setTimeout(() => showNotif(`Achievement Unlocked: Versatile Scholar`, 'achievement'), 100);
      }
      if (mode === 'flashcards' && !next.achievements.includes('first_card')) {
        next.achievements = [...next.achievements, 'first_card'];
        setTimeout(() => showNotif(`Achievement Unlocked: Open the Tome`, 'achievement'), 200);
      }
      if (mode === 'chat' && !next.achievements.includes('first_oracle')) {
        next.achievements = [...next.achievements, 'first_oracle'];
        setTimeout(() => showNotif(`Achievement Unlocked: Seeker of Wisdom`, 'achievement'), 200);
      }
      return next;
    });
  };

  // ===== Library Operations =====
  const addTomeToLibrary = (data) => {
    setPlayerState(prev => {
      const newEntry = {
        id: generateTomeId(),
        data: normalizeTomeData(data),
        addedAt: Date.now(),
        lastOpened: Date.now(),
        progress: blankTomeProgress(),
      };
      const next = {
        ...prev,
        library: [...prev.library, newEntry],
        activeTomeId: newEntry.id,
      };
      if (!next.achievements.includes('first_tome')) {
        next.achievements = [...next.achievements, 'first_tome'];
        setTimeout(() => showNotif(`Achievement Unlocked: Library Founded`, 'achievement'), 100);
      }
      if (next.library.length >= 3 && !next.achievements.includes('tome_collector')) {
        next.achievements = [...next.achievements, 'tome_collector'];
        setTimeout(() => showNotif(`Achievement Unlocked: Tome Collector`, 'achievement'), 200);
      }
      if (next.library.length >= 10 && !next.achievements.includes('tome_archivist')) {
        next.achievements = [...next.achievements, 'tome_archivist'];
        setTimeout(() => showNotif(`Achievement Unlocked: Grand Archivist`, 'achievement'), 300);
      }
      return next;
    });
  };

  const switchActiveTome = (tomeId) => {
    setPlayerState(prev => ({
      ...prev,
      activeTomeId: tomeId,
      library: prev.library.map(t =>
        t.id === tomeId ? { ...t, lastOpened: Date.now() } : t
      ),
    }));
    setScreen('home');
  };

  const deleteTome = (tomeId) => {
    setPlayerState(prev => {
      const newLib = prev.library.filter(t => t.id !== tomeId);
      let newActive = prev.activeTomeId;
      if (prev.activeTomeId === tomeId) {
        newActive = newLib.length > 0 ? newLib[0].id : null;
      }
      return { ...prev, library: newLib, activeTomeId: newActive };
    });
  };

  const renameTome = (tomeId, newTitle) => {
    setPlayerState(prev => ({
      ...prev,
      library: prev.library.map(t =>
        t.id === tomeId
          ? { ...t, data: { ...t.data, metadata: { ...t.data.metadata, title: newTitle } } }
          : t
      ),
    }));
  };

  const duplicateTome = (tomeId) => {
    setPlayerState(prev => {
      const source = prev.library.find(t => t.id === tomeId);
      if (!source) return prev;
      const newEntry = {
        id: generateTomeId(),
        data: {
          ...source.data,
          metadata: {
            ...source.data.metadata,
            title: `${source.data.metadata.title} (Copy)`,
          },
        },
        addedAt: Date.now(),
        lastOpened: Date.now(),
        progress: blankTomeProgress(),
      };
      return { ...prev, library: [...prev.library, newEntry] };
    });
    showNotif('Tome duplicated — fresh progress awaits', 'success');
  };

  const updateTomeMetadata = (tomeId, metadataUpdates) => {
    setPlayerState(prev => ({
      ...prev,
      library: prev.library.map(t =>
        t.id === tomeId
          ? { ...t, data: { ...t.data, metadata: { ...t.data.metadata, ...metadataUpdates } } }
          : t
      ),
    }));
  };

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.metadata || !data.flashcards) {
          showNotif('Invalid tome format', 'error');
          return;
        }
        addTomeToLibrary(data);
        showNotif(`Tome inscribed: ${data.metadata.title}`, 'success');
      } catch (err) {
        showNotif('Failed to decipher the tome', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handlePasteImport = (text) => {
    try {
      // Strip common markdown code fences if present
      let cleaned = text.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
      }
      const data = JSON.parse(cleaned);
      if (!data.metadata || !data.flashcards) {
        showNotif('Invalid tome format — needs metadata and flashcards', 'error');
        return false;
      }
      addTomeToLibrary(data);
      showNotif(`Tome inscribed: ${data.metadata.title}`, 'success');
      return true;
    } catch (err) {
      showNotif('Could not parse the pasted text as JSON', 'error');
      return false;
    }
  };

  const handleShareCodeImport = (code) => {
    const data = decodeTomeShareCode(code);
    if (!data) {
      showNotif('Invalid share code — must start with TOME-V1:', 'error');
      return false;
    }
    if (!data.metadata || !data.flashcards) {
      showNotif('Share code decoded but tome is malformed', 'error');
      return false;
    }
    addTomeToLibrary(data);
    showNotif(`Tome received: ${data.metadata.title}`, 'success');
    return true;
  };

  const resetProgress = () => {
    setShowResetConfirm(true);
  };

  const confirmReset = () => {
    setPlayerState(DEFAULT_STATE);
    setShowResetConfirm(false);
    showNotif('Saga reset — thy journey begins anew', 'info');
  };

  const currentTitle = getTitle(playerState.level, playerState.selectedTitle, playerState.unlockedTitles);
  const xpNeeded = xpForLevel(playerState.level);
  const xpPercent = (playerState.xp / xpNeeded) * 100;

  return (
    <div className="min-h-screen text-amber-50 relative overflow-hidden" style={{
      fontFamily: "'Cinzel', 'Trajan Pro', Georgia, serif",
      background: 'radial-gradient(ellipse at top, #1a0e08 0%, #0a0604 50%, #000000 100%)',
    }}>
      <div className="fixed inset-0 opacity-[0.04] pointer-events-none" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
      }} />
      <div className="fixed inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.7) 100%)',
      }} />
      <div className="fixed inset-0 pointer-events-none" style={{
        background: 'radial-gradient(circle at 20% 80%, rgba(255,140,0,0.08), transparent 40%), radial-gradient(circle at 80% 20%, rgba(220,38,38,0.06), transparent 40%)',
      }} />

      {sync.mergeRequired && (
        <MergeChooser
          localState={sync.localPreview}
          cloudState={sync.cloudPreview}
          onResolve={async (choice) => {
            if (choice === 'cancel') {
              await signOut();
            }
            sync.resolveMerge(choice);
          }}
        />
      )}

      {showAccountPanel && (
        <AccountPanel
          user={user}
          syncStatus={sync.status}
          lastSyncedAt={null}
          onClose={() => setShowAccountPanel(false)}
        />
      )}

      {notification && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded border-2 backdrop-blur-md ${
          notification.type === 'levelup' ? 'bg-amber-900/80 border-amber-400 text-amber-100' :
          notification.type === 'achievement' ? 'bg-purple-900/80 border-purple-400 text-purple-100' :
          notification.type === 'xp' ? 'bg-emerald-900/80 border-emerald-500 text-emerald-100' :
          notification.type === 'success' ? 'bg-emerald-900/80 border-emerald-500 text-emerald-100' :
          notification.type === 'error' ? 'bg-red-900/80 border-red-500 text-red-100' :
          'bg-stone-900/80 border-stone-600 text-amber-50'
        }`} style={{ boxShadow: '0 0 20px rgba(245, 158, 11, 0.3)' }}>
          {notification.msg}
        </div>
      )}

      <div className="relative max-w-6xl mx-auto p-6">
        <header className="flex items-center justify-between mb-8 pb-4 border-b-2 border-amber-700/40">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Castle className="w-10 h-10 text-amber-400" style={{ filter: 'drop-shadow(0 0 8px rgba(245, 158, 11, 0.5))' }} />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-wider" style={{
                background: 'linear-gradient(to bottom, #fbbf24 0%, #d97706 50%, #92400e 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                textShadow: '0 0 20px rgba(245, 158, 11, 0.3)',
                fontFamily: "'Cinzel', serif",
              }}>
                DUNGEON SCHOLAR
              </h1>
              <p className="text-xs text-amber-700 tracking-[0.3em] italic">⚜ A SCHOLAR'S QUEST ⚜</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {/* Gold pill */}
            <div
              className="px-3 py-2 rounded border-2 border-amber-700/60 flex items-center gap-2"
              style={{
                background: 'linear-gradient(to bottom, rgba(120, 53, 15, 0.5), rgba(41, 24, 12, 0.85))',
                boxShadow: '0 0 10px rgba(245, 158, 11, 0.15), inset 0 0 10px rgba(0,0,0,0.4)',
              }}
              title="Gold"
            >
              <Coins className="w-4 h-4 text-amber-300" style={{ filter: 'drop-shadow(0 0 4px rgba(245, 158, 11, 0.6))' }} />
              <span className="text-amber-200 font-bold italic tabular-nums">{playerState.gold || 0}</span>
            </div>
            <button
              onClick={() => setScreen('quests')}
              className="p-2 hover:bg-purple-900/30 rounded transition border-2 border-purple-700/50 hover:border-purple-500 relative"
              title="Quest Board"
            >
              <ScrollText className="w-5 h-5 text-purple-300" />
              {claimableQuestCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-purple-500 text-amber-50 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center border border-purple-300 animate-pulse">
                  {claimableQuestCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setScreen('library')}
              className="p-2 hover:bg-amber-900/30 rounded transition border-2 border-amber-700/50 hover:border-amber-500 relative"
              title="Library"
            >
              <Library className="w-5 h-5 text-amber-400" />
              {playerState.library.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-amber-500 text-amber-950 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center border border-amber-300">
                  {playerState.library.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setScreen('inventory')}
              className="p-2 hover:bg-emerald-900/30 rounded transition border-2 border-emerald-700/50 hover:border-emerald-500 relative"
              title="Inventory"
            >
              <Package className="w-5 h-5 text-emerald-300" />
              {(() => {
                const total = Object.values(playerState.inventory || {}).reduce((s, n) => s + (n || 0), 0);
                return total > 0 ? (
                  <span className="absolute -top-1 -right-1 bg-emerald-500 text-amber-950 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center border border-emerald-300">
                    {total}
                  </span>
                ) : null;
              })()}
            </button>
            <button
              onClick={() => setScreen('shop')}
              className="p-2 hover:bg-amber-900/30 rounded transition border-2 border-amber-700/50 hover:border-amber-500"
              title="Marketplace"
            >
              <ShoppingBag className="w-5 h-5 text-amber-300" />
            </button>
            <button
              onClick={() => setShowAchievements(true)}
              className="p-2 hover:bg-amber-900/30 rounded transition border-2 border-amber-700/50 hover:border-amber-500"
              title="Hall of Glory"
            >
              <Trophy className="w-5 h-5 text-amber-400" />
            </button>
            {screen !== 'home' && (
              <button
                onClick={() => setScreen('home')}
                className="px-3 py-2 hover:bg-amber-900/30 rounded transition border-2 border-amber-700/50 hover:border-amber-500 flex items-center gap-2 text-amber-200"
              >
                <Home className="w-4 h-4" /> Hearth
              </button>
            )}
          </div>
        </header>

        <div className="mb-6 p-4 rounded relative" style={{
          background: 'linear-gradient(135deg, rgba(41, 24, 12, 0.9) 0%, rgba(20, 12, 6, 0.9) 100%)',
          border: '2px solid rgba(180, 83, 9, 0.5)',
          boxShadow: '0 0 30px rgba(180, 83, 9, 0.15), inset 0 0 20px rgba(0,0,0,0.5)',
        }}>
          <div className="absolute top-1 left-1 text-amber-700 text-xs">⚜</div>
          <div className="absolute top-1 right-1 text-amber-700 text-xs">⚜</div>
          <div className="absolute bottom-1 left-1 text-amber-700 text-xs">⚜</div>
          <div className="absolute bottom-1 right-1 text-amber-700 text-xs">⚜</div>

          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-16 h-16 flex items-center justify-center text-3xl font-bold border-2 border-amber-500 text-amber-200" style={{
                  background: 'radial-gradient(circle, rgba(120, 53, 15, 0.8) 0%, rgba(41, 24, 12, 0.9) 100%)',
                  clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
                  boxShadow: '0 0 15px rgba(245, 158, 11, 0.4)',
                  textShadow: '0 0 10px rgba(245, 158, 11, 0.8)',
                }}>
                  {playerState.level}
                </div>
              </div>
              <div>
                <button
                  onClick={() => setShowTitles(true)}
                  className="text-xl font-bold text-amber-300 hover:text-amber-200 transition flex items-center gap-1 italic"
                  style={{ textShadow: '0 0 10px rgba(245, 158, 11, 0.4)' }}
                >
                  {currentTitle} <ChevronRight className="w-4 h-4" />
                </button>
                <div className="text-xs text-amber-700 tracking-wider">⚔ Level {playerState.level} • {playerState.totalXp.toLocaleString()} Total XP ⚔</div>
              </div>
            </div>
            <div className="flex-1 min-w-[200px] max-w-md">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-amber-700 tracking-widest">EXPERIENCE</span>
                <span className="text-amber-400">{playerState.xp} / {xpNeeded}</span>
              </div>
              <div className="h-4 rounded-full overflow-hidden border-2 border-amber-800" style={{
                background: 'linear-gradient(to bottom, #1c1917 0%, #0c0a09 100%)',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.6)',
              }}>
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${xpPercent}%`,
                    background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 50%, #b45309 100%)',
                    boxShadow: '0 0 10px rgba(245, 158, 11, 0.6)',
                  }}
                />
              </div>
            </div>
            <div className="flex gap-4 text-sm">
              <div className="text-center">
                <div className="text-emerald-400 font-bold text-lg" style={{ textShadow: '0 0 8px rgba(16, 185, 129, 0.5)' }}>{playerState.totalCorrect}</div>
                <div className="text-xs text-amber-700 tracking-wider">VICTORIES</div>
              </div>
              <div className="text-center">
                <div className="text-purple-400 font-bold text-lg" style={{ textShadow: '0 0 8px rgba(168, 85, 247, 0.5)' }}>
                  {playerState.library.reduce((sum, t) => sum + (t.progress?.runsCompleted || 0), 0)}
                </div>
                <div className="text-xs text-amber-700 tracking-wider">QUESTS</div>
              </div>
              <div className="text-center">
                <div className="text-red-400 font-bold text-lg" style={{ textShadow: '0 0 8px rgba(239, 68, 68, 0.5)' }}>
                  {playerState.library.reduce((sum, t) => sum + (t.progress?.bossesDefeated || 0), 0)}
                </div>
                <div className="text-xs text-amber-700 tracking-wider">DRAGONS</div>
              </div>
            </div>
            {user && (
              <ProfileChip
                user={user}
                syncStatus={sync.status}
                onOpen={() => setShowAccountPanel(true)}
              />
            )}
          </div>
        </div>

        {screen === 'home' && (
          <HomeScreen
            courseSet={courseSet}
            tomeProgress={tomeProgress}
            setScreen={setScreen}
            trackModeUse={trackModeUse}
            onImport={() => fileInputRef.current?.click()}
            onPaste={() => setShowPasteModal(true)}
            onImportCode={() => setShowImportCodeModal(true)}
            onShowPrompt={() => setShowPromptModal(true)}
            playerState={playerState}
            signedIn={!!user}
            onResetProgress={resetProgress}
            onOpenLibrary={() => setScreen('library')}
            onRestartTutorial={() => {
              setPlayerState(prev => ({
                ...prev,
                tutorialStepIndex: 0,
                tutorialCompleted: false,
                tutorialStarted: true,
                tutorialPanelCollapsed: false,
                tutorialBaselines: snapshotBaselines(prev),
              }));
              showNotif('Tutorial restarted', 'info');
            }}
          />
        )}
        {screen === 'library' && (
          <LibraryScreen
            playerState={playerState}
            onSwitch={switchActiveTome}
            onDelete={deleteTome}
            onRename={renameTome}
            onDuplicate={duplicateTome}
            onShare={(id) => setShareTomeId(id)}
            onEditMetadata={(id) => setEditMetadataTomeId(id)}
            onImport={() => fileInputRef.current?.click()}
            onPaste={() => setShowPasteModal(true)}
            onImportCode={() => setShowImportCodeModal(true)}
            onShowPrompt={() => setShowPromptModal(true)}
            setScreen={setScreen}
            claimableQuestCount={claimableQuestCount}
          />
        )}
        {screen === 'quests' && (
          <QuestBoard
            dailyQuests={dailyQuestStatus}
            dailyDate={playerState.dailyQuests?.date}
            onClaimDaily={claimQuest}
            onClaimAllDaily={claimAllQuests}
            weeklyQuests={weeklyQuestStatus}
            weekStart={playerState.weeklyQuests?.weekStart}
            onClaimWeekly={claimWeeklyQuest}
            onClaimAllWeekly={claimAllWeeklyQuests}
            storyChains={storyChainStatus}
            onClaimStoryStep={claimStoryStep}
          />
        )}
        {screen === 'inventory' && (
          <InventoryScreen
            playerState={playerState}
            setScreen={setScreen}
            onEquip={equipItem}
            onUnequip={unequipSlot}
            onEquipPotion={equipPotion}
            onUnequipPotion={unequipPotion}
          />
        )}
        {screen === 'shop' && (
          <ShopScreen playerState={playerState} setScreen={setScreen} onPurchase={purchaseItem} />
        )}
        {screen === 'crafting' && (
          <CraftingScreen playerState={playerState} setScreen={setScreen} onCraft={craftRecipe} />
        )}
        {screen === 'bestiary' && (
          <BestiaryScreen playerState={playerState} setScreen={setScreen} />
        )}
        {screen === 'history' && (
          <RunHistoryScreen playerState={playerState} setScreen={setScreen} />
        )}
        {screen === 'dungeon' && courseSet && (
          <DungeonExplore
            onExit={() => setScreen('home')}
            playerState={playerState}
            subject={courseSet?.metadata?.subject}
            courseSet={courseSet}
            tomeProgress={tomeProgress}
            awardXP={awardXP}
            awardGold={awardGold}
            recordAnswer={recordAnswer}
            checkAchievement={checkAchievement}
            unlockSpecialTitle={unlockSpecialTitle}
            updateProgress={updateProgress}
            updateTomeProgress={updateTomeProgress}
            trackDungeonAttempt={trackDungeonAttempt}
            onViewHistory={() => setScreen('history')}
            consumeItem={consumeItem}
            giveItem={giveItem}
            recordBestiary={recordBestiary}
          />
        )}
        {screen === 'flashcards' && courseSet && (
          <FlashcardsMode
            courseSet={courseSet}
            cards={shuffledActivities.flashcards}
            tomeProgress={tomeProgress}
            playerState={playerState}
            awardXP={awardXP}
            updateTomeProgress={updateTomeProgress}
            checkAchievement={checkAchievement}
          />
        )}
        {screen === 'quiz' && courseSet && (
          <QuizMode
            courseSet={courseSet}
            questions={shuffledActivities.quiz}
            tomeProgress={tomeProgress}
            playerState={playerState}
            awardXP={awardXP}
            recordAnswer={recordAnswer}
            checkAchievement={checkAchievement}
            updateTomeProgress={updateTomeProgress}
          />
        )}
        {screen === 'lab' && courseSet && (
          <LabMode
            courseSet={courseSet}
            tomeProgress={tomeProgress}
            playerState={playerState}
            awardXP={awardXP}
            recordAnswer={recordAnswer}
            updateTomeProgress={updateTomeProgress}
            checkAchievement={checkAchievement}
          />
        )}
        {screen === 'chat' && courseSet && (
          <ChatMode
            courseSet={courseSet}
            tomeProgress={tomeProgress}
            updateTomeProgress={updateTomeProgress}
            checkAchievement={checkAchievement}
          />
        )}
        {screen === 'vault' && (
          <MistakeVault
            courseSet={courseSet}
            tomeProgress={tomeProgress}
            playerState={playerState}
            onRemove={removeFromVault}
            checkAchievement={checkAchievement}
            unlockSpecialTitle={unlockSpecialTitle}
            awardXP={awardXP}
          />
        )}

        <input type="file" ref={fileInputRef} accept=".json" onChange={handleImportFile} className="hidden" />

        {showPromptModal && <PromptModal onClose={() => setShowPromptModal(false)} />}
        {showPasteModal && <PasteTomeModal onClose={() => setShowPasteModal(false)} onSubmit={handlePasteImport} />}
        {showImportCodeModal && <ImportCodeModal onClose={() => setShowImportCodeModal(false)} onSubmit={handleShareCodeImport} />}
        {shareTomeId && <ShareTomeModal tome={playerState.library.find(t => t.id === shareTomeId)} onClose={() => setShareTomeId(null)} />}
        {editMetadataTomeId && <MetadataEditModal tome={playerState.library.find(t => t.id === editMetadataTomeId)} onSave={(updates) => { updateTomeMetadata(editMetadataTomeId, updates); setEditMetadataTomeId(null); showNotif('Tome metadata updated', 'success'); }} onClose={() => setEditMetadataTomeId(null)} />}
        {showResetConfirm && <ResetConfirmModal onConfirm={confirmReset} onCancel={() => setShowResetConfirm(false)} />}
        {showAchievements && <AchievementsModal playerState={playerState} onClose={() => setShowAchievements(false)} />}
        {showWelcomeModal && <WelcomeModal onStart={startTutorial} onSkip={skipTutorial} />}

        {/* Tutorial side panel */}
        {playerState.tutorialStarted && !playerState.tutorialCompleted && (
          <TutorialPanel
            stepIndex={playerState.tutorialStepIndex}
            collapsed={playerState.tutorialPanelCollapsed}
            onToggle={toggleTutorialPanel}
            onAdvance={advanceTutorial}
            onSkip={skipTutorial}
            onAction={(stepId) => {
              if (stepId === 'forge_tome') setShowPromptModal(true);
              else if (stepId === 'library_tour') setScreen('library');
              else if (stepId === 'study_scroll') { trackModeUse('flashcards'); setScreen('flashcards'); }
              else if (stepId === 'solve_riddle') { trackModeUse('quiz'); setScreen('quiz'); }
              else if (stepId === 'face_trial') { trackModeUse('lab'); setScreen('lab'); }
              else if (stepId === 'vault_intro') setScreen('vault');
              else if (stepId === 'consult_oracle') { trackModeUse('chat'); setScreen('chat'); }
              else if (stepId === 'quest_board') setScreen('quests');
              else if (stepId === 'enter_dungeon') { trackModeUse('dungeon'); setScreen('dungeon'); }
              else if (stepId === 'view_achievements') setShowAchievements(true);
              else if (stepId === 'view_titles_levels') setShowTitles(true);
            }}
          /> )}
        {showTitles && (
          <TitlesModal
            playerState={playerState}
            onSelect={(t) => {
              setPlayerState(prev => ({ ...prev, selectedTitle: t }));
              setShowTitles(false);
            }}
            onClose={() => setShowTitles(false)}
          />
        )}
      </div>
    </div>
  );
}

function OrnatePanel({ children, color = 'amber', className = '', glow = true }) {
  const colorMap = {
    amber: { border: 'rgba(180, 83, 9, 0.6)', glow: 'rgba(245, 158, 11, 0.2)', bg: 'rgba(41, 24, 12, 0.85)' },
    red: { border: 'rgba(185, 28, 28, 0.6)', glow: 'rgba(239, 68, 68, 0.2)', bg: 'rgba(41, 12, 12, 0.85)' },
    emerald: { border: 'rgba(5, 150, 105, 0.6)', glow: 'rgba(16, 185, 129, 0.2)', bg: 'rgba(12, 41, 27, 0.85)' },
    purple: { border: 'rgba(126, 34, 206, 0.6)', glow: 'rgba(168, 85, 247, 0.2)', bg: 'rgba(31, 12, 41, 0.85)' },
    sapphire: { border: 'rgba(29, 78, 216, 0.6)', glow: 'rgba(59, 130, 246, 0.2)', bg: 'rgba(12, 24, 41, 0.85)' },
    rose: { border: 'rgba(190, 24, 93, 0.6)', glow: 'rgba(244, 63, 94, 0.2)', bg: 'rgba(41, 12, 27, 0.85)' },
  };
  const c = colorMap[color] || colorMap.amber;
  return (
    <div className={`relative rounded p-5 ${className}`} style={{
      background: `linear-gradient(135deg, ${c.bg} 0%, rgba(10, 6, 4, 0.9) 100%)`,
      border: `2px solid ${c.border}`,
      boxShadow: glow ? `0 0 25px ${c.glow}, inset 0 0 20px rgba(0,0,0,0.5)` : 'inset 0 0 20px rgba(0,0,0,0.5)',
    }}>
      <div className="absolute top-1 left-1 text-amber-700/60 text-xs">⚜</div>
      <div className="absolute top-1 right-1 text-amber-700/60 text-xs">⚜</div>
      <div className="absolute bottom-1 left-1 text-amber-700/60 text-xs">⚜</div>
      <div className="absolute bottom-1 right-1 text-amber-700/60 text-xs">⚜</div>
      {children}
    </div>
  );
}

function LibraryScreen({ playerState, onSwitch, onDelete, onRename, onDuplicate, onShare, onEditMetadata, onImport, onPaste, onImportCode, onShowPrompt, setScreen, claimableQuestCount = 0 }) {
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  const startRename = (tome) => {
    setRenamingId(tome.id);
    setRenameValue(tome.data.metadata.title);
  };

  const submitRename = (id) => {
    if (renameValue.trim()) {
      onRename(id, renameValue.trim());
    }
    setRenamingId(null);
  };

  const sorted = [...playerState.library].sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0));

  return (
    <div className="space-y-6">
      {/* Claimable quests banner — sums daily, weekly, and story-chain rewards */}
      {claimableQuestCount > 0 && (
        <button
          onClick={() => setScreen('quests')}
          className="w-full p-4 rounded relative flex items-center justify-between transition hover:scale-[1.01] text-left"
          style={{
            background: 'linear-gradient(135deg, rgba(120, 53, 15, 0.6) 0%, rgba(41, 24, 12, 0.95) 100%)',
            border: '3px double rgba(245, 158, 11, 0.7)',
            boxShadow: '0 0 30px rgba(245, 158, 11, 0.4), inset 0 0 20px rgba(0,0,0,0.5)',
          }}
        >
          <div className="flex items-center gap-3">
            <Gift className="w-8 h-8 text-amber-300 animate-pulse" style={{ filter: 'drop-shadow(0 0 8px rgba(245, 158, 11, 0.8))' }} />
            <div>
              <div className="font-bold text-amber-200 italic text-lg" style={{ textShadow: '0 0 8px rgba(245, 158, 11, 0.4)' }}>
                ⚜ Quest Rewards Await ⚜
              </div>
              <div className="text-xs text-amber-100/70 italic">
                {claimableQuestCount} reward{claimableQuestCount === 1 ? '' : 's'} ready to claim — visit the Quest Board
              </div>
            </div>
          </div>
          <ChevronRight className="w-6 h-6 text-amber-400" />
        </button>
      )}

      <div className="p-6 rounded relative" style={{
        background: 'linear-gradient(135deg, rgba(120, 53, 15, 0.4) 0%, rgba(41, 24, 12, 0.9) 100%)',
        border: '3px double rgba(245, 158, 11, 0.6)',
        boxShadow: '0 0 30px rgba(245, 158, 11, 0.2), inset 0 0 30px rgba(0,0,0,0.5)',
      }}>
        <div className="absolute top-2 left-2 text-amber-500 text-sm">⚜</div>
        <div className="absolute top-2 right-2 text-amber-500 text-sm">⚜</div>
        <div className="absolute bottom-2 left-2 text-amber-500 text-sm">⚜</div>
        <div className="absolute bottom-2 right-2 text-amber-500 text-sm">⚜</div>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Library className="w-10 h-10 text-amber-400" style={{ filter: 'drop-shadow(0 0 10px rgba(245, 158, 11, 0.6))' }} />
            <div>
              <h2 className="text-2xl font-bold text-amber-200 italic" style={{ textShadow: '0 0 12px rgba(245, 158, 11, 0.4)' }}>
                The Grand Library
              </h2>
              <div className="text-xs text-amber-700 tracking-[0.2em] italic">
                ⚜ {playerState.library.length} tome{playerState.library.length === 1 ? '' : 's'} in your collection ⚜
              </div>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={onShowPrompt}
              className="px-4 py-2 rounded text-sm border-2 border-amber-700 text-amber-200 flex items-center gap-2 hover:bg-amber-900/30 italic"
              style={{ background: 'rgba(41, 24, 12, 0.7)' }}
            >
              <Wand2 className="w-4 h-4" /> Forge with Magic
            </button>
            <button
              onClick={onPaste}
              className="px-4 py-2 rounded text-sm border-2 border-amber-700 text-amber-200 flex items-center gap-2 hover:bg-amber-900/30 italic"
              style={{ background: 'rgba(41, 24, 12, 0.7)' }}
            >
              <Copy className="w-4 h-4" /> Paste Tome Text
            </button>
            <button
              onClick={onImportCode}
              className="px-4 py-2 rounded text-sm border-2 border-purple-700 text-purple-200 flex items-center gap-2 hover:bg-purple-900/30 italic"
              style={{ background: 'rgba(31, 12, 41, 0.7)' }}
            >
              <Hash className="w-4 h-4" /> Import Share Code
            </button>
            <button
              onClick={onImport}
              className="px-4 py-2 rounded text-sm font-bold text-amber-950 border-2 border-amber-300 flex items-center gap-2 italic"
              style={{
                background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
                boxShadow: '0 0 15px rgba(245, 158, 11, 0.4)',
              }}
            >
              <Upload className="w-4 h-4" /> Inscribe a Tome
            </button>
          </div>
        </div>
      </div>

      {playerState.library.length === 0 && (
        <div className="text-center py-12 px-6 rounded relative" style={{
          background: 'linear-gradient(135deg, rgba(41, 24, 12, 0.7) 0%, rgba(10, 6, 4, 0.9) 100%)',
          border: '3px double rgba(180, 83, 9, 0.5)',
          boxShadow: '0 0 40px rgba(180, 83, 9, 0.2), inset 0 0 30px rgba(0,0,0,0.6)',
        }}>
          <Scroll className="w-20 h-20 mx-auto text-amber-500 mb-4" style={{ filter: 'drop-shadow(0 0 12px rgba(245, 158, 11, 0.6))' }} />
          <h3 className="text-2xl font-bold text-amber-300 italic mb-3" style={{ textShadow: '0 0 12px rgba(245, 158, 11, 0.4)' }}>
            ~ The Shelves Stand Empty ~
          </h3>
          <p className="text-amber-100/80 italic max-w-md mx-auto">
            "No tomes grace these ancient halls, brave scholar. Inscribe your first sacred text to begin your saga..."
          </p>
        </div>
      )}

      {sorted.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          {sorted.map(tome => {
            const isActive = tome.id === playerState.activeTomeId;
            const meta = tome.data.metadata || {};
            const cardCount = tome.data.flashcards?.length || 0;
            const quizCount = tome.data.quiz?.length || 0;
            const labCount = tome.data.labs?.length || 0;
            const progress = tome.progress || blankTomeProgress();
            const totalItems = cardCount + quizCount + labCount;
            const studied = (progress.cardsReviewed || 0) + (progress.quizAnswered || 0) + (progress.labsCompleted || 0);
            const tags = meta.tags || [];
            const subject = meta.subject;
            const author = meta.author;
            const difficulty = meta.difficulty; // 1-5

            return (
              <div
                key={tome.id}
                className="rounded p-5 relative transition"
                style={{
                  background: isActive
                    ? 'linear-gradient(135deg, rgba(120, 53, 15, 0.6) 0%, rgba(41, 24, 12, 0.95) 100%)'
                    : 'linear-gradient(135deg, rgba(41, 24, 12, 0.85) 0%, rgba(10, 6, 4, 0.95) 100%)',
                  border: isActive ? '3px double rgba(245, 158, 11, 0.9)' : '2px solid rgba(180, 83, 9, 0.5)',
                  boxShadow: isActive
                    ? '0 0 30px rgba(245, 158, 11, 0.4), inset 0 0 20px rgba(0,0,0,0.5)'
                    : '0 0 15px rgba(180, 83, 9, 0.15), inset 0 0 20px rgba(0,0,0,0.5)',
                }}
              >
                <div className="absolute top-1 left-1 text-amber-700/60 text-xs">⚜</div>
                <div className="absolute top-1 right-1 text-amber-700/60 text-xs">⚜</div>
                <div className="absolute bottom-1 left-1 text-amber-700/60 text-xs">⚜</div>
                <div className="absolute bottom-1 right-1 text-amber-700/60 text-xs">⚜</div>

                {isActive && (
                  <div className="absolute top-3 right-3 text-xs px-3 py-1 rounded text-amber-950 font-bold tracking-wider" style={{
                    background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
                    boxShadow: '0 0 10px rgba(245, 158, 11, 0.5)',
                    border: '1px solid #92400e',
                  }}>
                    ★ ACTIVE
                  </div>
                )}

                <div className="flex items-start gap-3 mb-3">
                  <BookMarked className="w-8 h-8 text-amber-400 flex-shrink-0 mt-1" style={{ filter: 'drop-shadow(0 0 6px rgba(245, 158, 11, 0.5))' }} />
                  <div className="flex-1 min-w-0">
                    {renamingId === tome.id ? (
                      <div className="flex gap-1">
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') submitRename(tome.id);
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          className="flex-1 p-1 rounded border-2 text-sm italic text-amber-50"
                          style={{ background: 'rgba(20, 12, 6, 0.7)', borderColor: 'rgba(245, 158, 11, 0.6)' }}
                          autoFocus
                        />
                        <button onClick={() => submitRename(tome.id)} className="px-2 text-emerald-400">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={() => setRenamingId(null)} className="px-2 text-red-400">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <h3 className="text-lg font-bold text-amber-200 italic truncate" style={{ textShadow: '0 0 8px rgba(245, 158, 11, 0.3)' }}>
                        {meta.title || 'Untitled Tome'}
                      </h3>
                    )}
                    {meta.description && (
                      <p className="text-xs text-amber-100/60 italic mt-1 line-clamp-2">{meta.description}</p>
                    )}
                  </div>
                </div>

                {/* Metadata row */}
                {(subject || author || difficulty) && (
                  <div className="flex flex-wrap gap-2 mb-3 text-xs">
                    {subject && (
                      <span className="px-2 py-0.5 rounded italic" style={{
                        background: 'rgba(31, 12, 41, 0.7)', border: '1px solid rgba(126, 34, 206, 0.5)', color: '#d8b4fe',
                      }}>📚 {subject}</span>
                    )}
                    {author && (
                      <span className="px-2 py-0.5 rounded italic" style={{
                        background: 'rgba(12, 24, 41, 0.7)', border: '1px solid rgba(29, 78, 216, 0.5)', color: '#93c5fd',
                      }}>✒️ {author}</span>
                    )}
                    {difficulty && (
                      <span className="px-2 py-0.5 rounded italic" style={{
                        background: 'rgba(41, 12, 12, 0.7)', border: '1px solid rgba(185, 28, 28, 0.5)', color: '#fca5a5',
                      }}>{'★'.repeat(difficulty)}{'☆'.repeat(5 - difficulty)}</span>
                    )}
                  </div>
                )}
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {tags.map((tag, ti) => (
                      <span key={ti} className="px-2 py-0.5 rounded text-[10px] italic" style={{
                        background: 'rgba(120, 53, 15, 0.4)', border: '1px solid rgba(245, 158, 11, 0.4)', color: '#fcd34d',
                      }}>#{tag}</span>
                    ))}
                  </div>
                )}

                <div className="flex gap-3 text-xs text-amber-300/80 mb-3 italic">
                  <span>📜 {cardCount}</span>
                  <span>🎯 {quizCount}</span>
                  <span>⚗️ {labCount}</span>
                  {progress.runsCompleted > 0 && <span>⚔️ {progress.runsCompleted} runs</span>}
                </div>

                {totalItems > 0 && (
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-amber-700 mb-1">
                      <span className="italic">Progress</span>
                      <span>{studied} interactions</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden border border-amber-800" style={{ background: 'rgba(10, 6, 4, 0.7)' }}>
                      <div className="h-full transition-all" style={{
                        width: `${Math.min(100, (studied / Math.max(totalItems, 1)) * 100)}%`,
                        background: 'linear-gradient(to right, #f59e0b, #fde047)',
                      }} />
                    </div>
                  </div>
                )}

                {confirmDelete === tome.id ? (
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => { onDelete(tome.id); setConfirmDelete(null); }}
                      className="flex-1 py-2 rounded text-sm font-bold border-2 border-red-400 text-red-100 italic"
                      style={{ background: 'linear-gradient(to bottom, #dc2626 0%, #991b1b 100%)' }}
                    >
                      Confirm Banishment
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="px-4 py-2 rounded text-sm border-2 border-amber-700 text-amber-200 italic"
                      style={{ background: 'rgba(41, 24, 12, 0.7)' }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {!isActive && (
                      <button
                        onClick={() => onSwitch(tome.id)}
                        className="flex-1 min-w-[120px] py-2 rounded text-sm font-bold text-amber-950 border-2 border-amber-300 italic"
                        style={{
                          background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
                          boxShadow: '0 0 12px rgba(245, 158, 11, 0.4)',
                        }}
                      >
                        ⚔ Open Tome
                      </button>
                    )}
                    {isActive && (
                      <button
                        onClick={() => setScreen('home')}
                        className="flex-1 min-w-[120px] py-2 rounded text-sm font-bold text-amber-950 border-2 border-amber-300 italic"
                        style={{
                          background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
                          boxShadow: '0 0 12px rgba(245, 158, 11, 0.4)',
                        }}
                      >
                        ⚔ Continue Studying
                      </button>
                    )}
                    <button
                      onClick={() => onShare(tome.id)}
                      className="px-3 py-2 rounded text-sm border-2 border-purple-700 text-purple-300 hover:bg-purple-900/30"
                      style={{ background: 'rgba(31, 12, 41, 0.7)' }}
                      title="Share this tome"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onEditMetadata(tome.id)}
                      className="px-3 py-2 rounded text-sm border-2 border-amber-700 text-amber-300 hover:bg-amber-900/30"
                      style={{ background: 'rgba(41, 24, 12, 0.7)' }}
                      title="Edit metadata"
                    >
                      <Tag className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => startRename(tome)}
                      className="px-3 py-2 rounded text-sm border-2 border-amber-700 text-amber-300 hover:bg-amber-900/30"
                      style={{ background: 'rgba(41, 24, 12, 0.7)' }}
                      title="Rename"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDuplicate(tome.id)}
                      className="px-3 py-2 rounded text-sm border-2 border-emerald-700 text-emerald-300 hover:bg-emerald-900/30"
                      style={{ background: 'rgba(12, 41, 27, 0.7)' }}
                      title="Duplicate (fresh progress)"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(tome.id)}
                      className="px-3 py-2 rounded text-sm border-2 border-red-800 text-red-300 hover:bg-red-900/30"
                      style={{ background: 'rgba(41, 12, 12, 0.6)' }}
                      title="Banish tome"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HomeScreen({ courseSet, tomeProgress, setScreen, trackModeUse, onImport, onPaste, onImportCode, onShowPrompt, playerState, signedIn, onResetProgress, onOpenLibrary, onRestartTutorial }) {
  if (!courseSet) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12 px-6 rounded relative" style={{
          background: 'linear-gradient(135deg, rgba(41, 24, 12, 0.7) 0%, rgba(10, 6, 4, 0.9) 100%)',
          border: '3px double rgba(180, 83, 9, 0.5)',
          boxShadow: '0 0 40px rgba(180, 83, 9, 0.2), inset 0 0 30px rgba(0,0,0,0.6)',
        }}>
          <div className="absolute top-2 left-2 text-amber-700 text-lg">⚜</div>
          <div className="absolute top-2 right-2 text-amber-700 text-lg">⚜</div>
          <div className="absolute bottom-2 left-2 text-amber-700 text-lg">⚜</div>
          <div className="absolute bottom-2 right-2 text-amber-700 text-lg">⚜</div>

          <Scroll className="w-20 h-20 mx-auto text-amber-500 mb-4" style={{ filter: 'drop-shadow(0 0 12px rgba(245, 158, 11, 0.6))' }} />
          <h2 className="text-3xl font-bold mb-3 text-amber-300 italic" style={{ textShadow: '0 0 15px rgba(245, 158, 11, 0.4)' }}>
            ~ The Library Awaits ~
          </h2>
          <p className="text-amber-100/80 mb-6 max-w-md mx-auto italic leading-relaxed">
            {playerState.library.length === 0
              ? '"Brave scholar, no tome graces your shelves. Bring forth a sacred text and your quest shall begin..."'
              : `"You have tomes in your collection but none is open. Visit the library to choose a path..."`}
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            {playerState.library.length > 0 && (
              <button
                onClick={onOpenLibrary}
                className="px-6 py-3 font-bold rounded flex items-center gap-2 transition text-amber-950 border-2 border-amber-300 italic"
                style={{
                  background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 50%, #b45309 100%)',
                  boxShadow: '0 0 20px rgba(245, 158, 11, 0.5)',
                }}
              >
                <Library className="w-5 h-5" /> Open Library
              </button>
            )}
            <button
              onClick={onImport}
              className="px-6 py-3 font-bold rounded flex items-center gap-2 transition text-amber-200 border-2 border-amber-700 italic"
              style={{
                background: 'linear-gradient(to bottom, rgba(120, 53, 15, 0.6) 0%, rgba(41, 24, 12, 0.9) 100%)',
              }}
            >
              <Scroll className="w-5 h-5" /> Inscribe a Tome
            </button>
            <button
              onClick={onPaste}
              className="px-6 py-3 font-bold rounded flex items-center gap-2 transition text-amber-200 border-2 border-amber-700 italic"
              style={{
                background: 'linear-gradient(to bottom, rgba(120, 53, 15, 0.6) 0%, rgba(41, 24, 12, 0.9) 100%)',
              }}
            >
              <Copy className="w-5 h-5" /> Paste Tome Text
            </button>
            <button
              onClick={onImportCode}
              className="px-6 py-3 font-bold rounded flex items-center gap-2 transition text-purple-200 border-2 border-purple-700 italic"
              style={{
                background: 'linear-gradient(to bottom, rgba(76, 29, 149, 0.6) 0%, rgba(31, 12, 41, 0.9) 100%)',
              }}
            >
              <Hash className="w-5 h-5" /> Import Share Code
            </button>
            <button
              onClick={onShowPrompt}
              className="px-6 py-3 font-bold rounded flex items-center gap-2 transition text-amber-200 border-2 border-amber-700 italic"
              style={{
                background: 'linear-gradient(to bottom, rgba(120, 53, 15, 0.6) 0%, rgba(41, 24, 12, 0.9) 100%)',
              }}
            >
              <Wand2 className="w-5 h-5" /> Forge Tome with Magic
            </button>
          </div>
        </div>

        <OrnatePanel color="purple">
          <h3 className="text-lg font-bold mb-4 text-purple-300 flex items-center gap-2 italic" style={{ textShadow: '0 0 10px rgba(168, 85, 247, 0.4)' }}>
            <BookOpen className="w-5 h-5" /> ✦ What Lies Within a Sacred Tome ✦
          </h3>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="flex gap-3">
              <Brain className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-cyan-300 italic">Scrolls of Knowledge</div>
                <div className="text-amber-100/70 text-xs">Term and definition pairs for memorization</div>
              </div>
            </div>
            <div className="flex gap-3">
              <Target className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-purple-300 italic">Riddles of Wisdom</div>
                <div className="text-amber-100/70 text-xs">Multiple choice, true/false, and arcane riddles</div>
              </div>
            </div>
            <div className="flex gap-3">
              <FlaskConical className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-rose-300 italic">Trials of Skill</div>
                <div className="text-amber-100/70 text-xs">Hands-on quests with steps and validation</div>
              </div>
            </div>
            <div className="flex gap-3">
              <MessageSquare className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-amber-300 italic">The Oracle's Wisdom</div>
                <div className="text-amber-100/70 text-xs">Reference text the AI sage draws upon</div>
              </div>
            </div>
          </div>
        </OrnatePanel>

        <OrnatePanel color="amber">
          <h3 className="text-lg font-bold mb-3 text-amber-300 flex items-center gap-2 italic">
            <Settings className="w-5 h-5" /> ⚔ Manage Your Saga ⚔
          </h3>
          <div className="flex flex-wrap gap-3">
            {!playerState.tutorialCompleted && !playerState.tutorialStarted && (
              <button onClick={onRestartTutorial} className="px-4 py-2 rounded flex items-center gap-2 text-sm border-2 border-purple-700 text-purple-200 hover:bg-purple-900/30 italic"
                style={{ background: 'rgba(31, 12, 41, 0.7)' }}>
                <Compass className="w-4 h-4" /> Begin Tutorial
              </button>
            )}
            {(playerState.tutorialCompleted || playerState.tutorialStartedAndSkipped) && (
              <button onClick={onRestartTutorial} className="px-4 py-2 rounded flex items-center gap-2 text-sm border-2 border-purple-700 text-purple-200 hover:bg-purple-900/30 italic"
                style={{ background: 'rgba(31, 12, 41, 0.7)' }}>
                <Compass className="w-4 h-4" /> Replay Tutorial
              </button>
            )}
            {!signedIn && <SignInButton />}
            <button onClick={onResetProgress} className="px-4 py-2 rounded flex items-center gap-2 text-sm border-2 border-red-800 text-red-300 hover:bg-red-900/30 italic"
              style={{ background: 'rgba(41, 12, 12, 0.7)' }}>
              <RotateCcw className="w-4 h-4" /> Begin Anew
            </button>
          </div>
        </OrnatePanel>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="p-6 rounded relative" style={{
        background: 'linear-gradient(135deg, rgba(120, 53, 15, 0.4) 0%, rgba(41, 24, 12, 0.9) 100%)',
        border: '3px double rgba(245, 158, 11, 0.5)',
        boxShadow: '0 0 30px rgba(245, 158, 11, 0.2), inset 0 0 30px rgba(0,0,0,0.5)',
      }}>
        <div className="absolute top-2 left-2 text-amber-500 text-sm">⚜</div>
        <div className="absolute top-2 right-2 text-amber-500 text-sm">⚜</div>
        <div className="absolute bottom-2 left-2 text-amber-500 text-sm">⚜</div>
        <div className="absolute bottom-2 right-2 text-amber-500 text-sm">⚜</div>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex-1 min-w-[250px]">
            <div className="text-xs text-amber-600 tracking-[0.3em] mb-1">⚔ ACTIVE TOME ⚔</div>
            <h2 className="text-2xl font-bold text-amber-200 italic" style={{ textShadow: '0 0 12px rgba(245, 158, 11, 0.4)' }}>
              {courseSet.metadata.title}
            </h2>
            {courseSet.metadata.description && (
              <p className="text-amber-100/70 text-sm mt-1 italic">{courseSet.metadata.description}</p>
            )}
            {(courseSet.metadata.subject || courseSet.metadata.author || courseSet.metadata.difficulty) && (
              <div className="flex flex-wrap gap-2 mt-2 text-xs">
                {courseSet.metadata.subject && (
                  <span className="px-2 py-0.5 rounded italic" style={{
                    background: 'rgba(31, 12, 41, 0.7)', border: '1px solid rgba(126, 34, 206, 0.5)', color: '#d8b4fe',
                  }}>📚 {courseSet.metadata.subject}</span>
                )}
                {courseSet.metadata.author && (
                  <span className="px-2 py-0.5 rounded italic" style={{
                    background: 'rgba(12, 24, 41, 0.7)', border: '1px solid rgba(29, 78, 216, 0.5)', color: '#93c5fd',
                  }}>✒️ {courseSet.metadata.author}</span>
                )}
                {courseSet.metadata.difficulty && (
                  <span className="px-2 py-0.5 rounded italic" style={{
                    background: 'rgba(41, 12, 12, 0.7)', border: '1px solid rgba(185, 28, 28, 0.5)', color: '#fca5a5',
                  }}>{'★'.repeat(courseSet.metadata.difficulty)}{'☆'.repeat(5 - courseSet.metadata.difficulty)}</span>
                )}
              </div>
            )}
            {courseSet.metadata.tags && courseSet.metadata.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {courseSet.metadata.tags.map((tag, ti) => (
                  <span key={ti} className="px-2 py-0.5 rounded text-[10px] italic" style={{
                    background: 'rgba(120, 53, 15, 0.4)', border: '1px solid rgba(245, 158, 11, 0.4)', color: '#fcd34d',
                  }}>#{tag}</span>
                ))}
              </div>
            )}
            <div className="flex gap-4 mt-3 text-xs text-amber-300/80">
              <span>📜 {courseSet.flashcards?.length || 0} scrolls</span>
              <span>🎯 {courseSet.quiz?.length || 0} riddles</span>
              <span>⚗️ {courseSet.labs?.length || 0} trials</span>
              {(tomeProgress?.runsCompleted || 0) > 0 && (
                <span>⚔️ {tomeProgress.runsCompleted} runs completed</span>
              )}
            </div>
          </div>
          <button
            onClick={onOpenLibrary}
            className="px-4 py-2 rounded text-sm border-2 border-amber-700 text-amber-200 flex items-center gap-2 hover:bg-amber-900/30 italic"
            style={{ background: 'rgba(41, 24, 12, 0.7)' }}
          >
            <Library className="w-4 h-4" /> Library ({playerState.library.length})
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <ModeCard
          title="Dungeon Delve"
          desc="Walk a top-down realm of themed biomes (Crypt, Sewers, Tower, Halls, Wastes). Bump into foes to face their riddles, and reach the dungeon lord at the end to claim victory."
          icon={<Swords className="w-8 h-8" />}
          color="red"
          featured
          onClick={() => { trackModeUse('dungeon'); setScreen('dungeon'); }}
        />
        <ModeCard
          title="Scrolls of Knowledge"
          desc="Study sacred scrolls at your own pace. Rate your mastery to focus on what eludes you."
          icon={<Scroll className="w-8 h-8" />}
          color="sapphire"
          onClick={() => { trackModeUse('flashcards'); setScreen('flashcards'); }}
        />
        <ModeCard
          title="Riddles of the Sphinx"
          desc="Test your wisdom against ancient riddles. Multiple paths, true judgment, and arcane fill-ins."
          icon={<Target className="w-8 h-8" />}
          color="purple"
          onClick={() => { trackModeUse('quiz'); setScreen('quiz'); }}
        />
        <ModeCard
          title="Trials of Skill"
          desc="Face hands-on trials at your own pace. Step-by-step quests with validation by the ancients."
          icon={<FlaskConical className="w-8 h-8" />}
          color="rose"
          onClick={() => { trackModeUse('lab'); setScreen('lab'); }}
        />
        <ModeCard
          title="The Oracle"
          desc="Commune with the AI Oracle. Seek explanations, request riddles, and uncover deeper mysteries of this tome."
          icon={<Wand2 className="w-8 h-8" />}
          color="amber"
          onClick={() => { trackModeUse('chat'); setScreen('chat'); }}
        />
        <ModeCard
          title="Tome of Failures"
          desc={`Confront the questions that have bested you. ${(tomeProgress?.mistakeVault || []).length} foe${(tomeProgress?.mistakeVault || []).length === 1 ? '' : 's'} await redemption.`}
          icon={<Skull className="w-8 h-8" />}
          color="emerald"
          onClick={() => setScreen('vault')}
        />
        <ModeCard
          title="Quest Board"
          desc="Daily quests await thy completion. New challenges arise each dawn — claim experience as thy reward."
          icon={<ScrollText className="w-8 h-8" />}
          color="purple"
          onClick={() => setScreen('quests')}
        />
        <ModeCard
          title="The Marketplace"
          desc="Spend thy hard-won gold on potions, cosmetics, and permanent boons. Wares rotate at each dawn."
          icon={<ShoppingBag className="w-8 h-8" />}
          color="amber"
          onClick={() => setScreen('shop')}
        />
        <ModeCard
          title="Chronicle of Delves"
          desc={`Review past dungeon runs, personal records, and per-question reviews. ${(tomeProgress?.runHistory || []).length} delve${(tomeProgress?.runHistory || []).length === 1 ? '' : 's'} chronicled.`}
          icon={<Scroll className="w-8 h-8" />}
          color="purple"
          onClick={() => setScreen('history')}
        />
        <ModeCard
          title="Bestiary"
          desc={`Lore on every foe felled in the dungeon. ${Object.keys(playerState?.bestiary || {}).length}/${20} entries unlocked.`}
          icon={<Skull className="w-8 h-8" />}
          color="purple"
          onClick={() => setScreen('bestiary')}
        />
      </div>

      <OrnatePanel color="amber">
        <h3 className="text-lg font-bold mb-3 text-amber-300 flex items-center gap-2 italic">
          <Settings className="w-5 h-5" /> ⚔ Manage Your Saga ⚔
        </h3>
        <div className="flex flex-wrap gap-3">
          {!playerState.tutorialCompleted && !playerState.tutorialStarted && (
            <button onClick={onRestartTutorial} className="px-4 py-2 rounded flex items-center gap-2 text-sm border-2 border-purple-700 text-purple-200 hover:bg-purple-900/30 italic"
              style={{ background: 'rgba(31, 12, 41, 0.7)' }}>
              <Compass className="w-4 h-4" /> Begin Tutorial
            </button>
          )}
          {(playerState.tutorialCompleted || playerState.tutorialStartedAndSkipped) && (
            <button onClick={onRestartTutorial} className="px-4 py-2 rounded flex items-center gap-2 text-sm border-2 border-purple-700 text-purple-200 hover:bg-purple-900/30 italic"
              style={{ background: 'rgba(31, 12, 41, 0.7)' }}>
              <Compass className="w-4 h-4" /> Replay Tutorial
            </button>
          )}
          {!signedIn && <SignInButton />}
          <button onClick={onResetProgress} className="px-4 py-2 rounded flex items-center gap-2 text-sm border-2 border-red-800 text-red-300 hover:bg-red-900/30 italic"
            style={{ background: 'rgba(41, 12, 12, 0.7)' }}>
            <RotateCcw className="w-4 h-4" /> Begin Anew
          </button>
        </div>
      </OrnatePanel>
    </div>
  );
}

function ModeCard({ title, desc, icon, color, onClick, featured }) {
  const colorMap = {
    amber: { grad: 'from-amber-500 to-yellow-700', border: 'rgba(180, 83, 9, 0.6)', glow: 'rgba(245, 158, 11, 0.3)', text: 'text-amber-200' },
    red: { grad: 'from-red-500 to-red-800', border: 'rgba(185, 28, 28, 0.6)', glow: 'rgba(239, 68, 68, 0.3)', text: 'text-red-200' },
    emerald: { grad: 'from-emerald-500 to-emerald-800', border: 'rgba(5, 150, 105, 0.6)', glow: 'rgba(16, 185, 129, 0.3)', text: 'text-emerald-200' },
    purple: { grad: 'from-purple-500 to-purple-800', border: 'rgba(126, 34, 206, 0.6)', glow: 'rgba(168, 85, 247, 0.3)', text: 'text-purple-200' },
    sapphire: { grad: 'from-sky-500 to-blue-800', border: 'rgba(29, 78, 216, 0.6)', glow: 'rgba(59, 130, 246, 0.3)', text: 'text-sky-200' },
    rose: { grad: 'from-rose-500 to-rose-800', border: 'rgba(190, 24, 93, 0.6)', glow: 'rgba(244, 63, 94, 0.3)', text: 'text-rose-200' },
  };
  const c = colorMap[color];
  return (
    <button
      onClick={onClick}
      className={`text-left rounded p-5 hover:scale-[1.02] transition-all group relative overflow-hidden ${featured ? 'md:col-span-2' : ''}`}
      style={{
        background: `linear-gradient(135deg, rgba(41, 24, 12, 0.85) 0%, rgba(10, 6, 4, 0.95) 100%)`,
        border: `2px solid ${c.border}`,
        boxShadow: `0 0 20px ${c.glow}, inset 0 0 20px rgba(0,0,0,0.5)`,
      }}
    >
      <div className="absolute top-1 left-1 text-amber-700/60 text-xs">⚜</div>
      <div className="absolute top-1 right-1 text-amber-700/60 text-xs">⚜</div>
      <div className="absolute bottom-1 left-1 text-amber-700/60 text-xs">⚜</div>
      <div className="absolute bottom-1 right-1 text-amber-700/60 text-xs">⚜</div>

      {featured && (
        <div className="absolute top-3 right-3 text-xs px-3 py-1 rounded text-amber-950 font-bold tracking-wider" style={{
          background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
          boxShadow: '0 0 10px rgba(245, 158, 11, 0.5)',
          border: '1px solid #92400e',
        }}>
          ★ LEGENDARY ★
        </div>
      )}
      <div className={`w-14 h-14 rounded bg-gradient-to-br ${c.grad} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform border-2 border-amber-600/50`} style={{
        boxShadow: `0 0 15px ${c.glow}`,
      }}>
        {icon}
      </div>
      <h3 className={`text-xl font-bold mb-1 italic ${c.text}`} style={{ textShadow: `0 0 8px ${c.glow}` }}>{title}</h3>
      <p className="text-sm text-amber-100/70 italic leading-relaxed">{desc}</p>
    </button>
  );
}

function DungeonRun({ courseSet, tomeProgress, awardXP, awardGold, recordAnswer, checkAchievement, unlockSpecialTitle, updateProgress, updateTomeProgress, trackDungeonAttempt, playerState, onExit, onViewHistory }) {
  const [phase, setPhase] = useState('setup');
  const [modifiers, setModifiers] = useState([]);
  const [difficulty, setDifficulty] = useState('apprentice');
  // Boss is rolled when the player lands on the setup screen and re-rolled on
  // each new run, so the setup screen can display "You face: The X" before
  // the player commits.
  const [bossId, setBossId] = useState(() => rollBoss());
  const [lives, setLives] = useState(3);
  const [maxLives, setMaxLives] = useState(3);
  const [wave, setWave] = useState(1);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [currentChallenge, setCurrentChallenge] = useState(null);
  const [powerups, setPowerups] = useState({ fiftyfifty: 2, hint: 2, freeze: 1 });
  const [usedFiftyFifty, setUsedFiftyFifty] = useState(false);
  const [usedHint, setUsedHint] = useState(false);
  const [mistakesThisRun, setMistakesThisRun] = useState(0);
  const [livesLostInBoss, setLivesLostInBoss] = useState(0);
  const [questionTimes, setQuestionTimes] = useState([]);
  const [questionStartTime, setQuestionStartTime] = useState(null);
  const [showFeedback, setShowFeedback] = useState(null);
  // Items already drawn this run — avoids back-to-back repeats. Resets per startRun.
  const usedItemIdsRef = useRef(new Set());
  // Phase 10: per-question log accumulated through the run, persisted into
  // tomeProgress.runHistory at end-of-run. Reset per startRun.
  const runQuestionLogRef = useRef([]);
  const runStartTimeRef = useRef(null);

  const logRunQuestion = (item, correct, timeSec) => {
    runQuestionLogRef.current.push({
      id: item?.id || `q_${runQuestionLogRef.current.length}`,
      prompt: item?.question || item?.front || item?.term || item?.prompt || '(question unavailable)',
      correct: !!correct,
      timeSec: typeof timeSec === 'number' ? Math.round(timeSec * 10) / 10 : 0,
      type: item?._type || item?.type,
      bossKind: item?._bossKind,
    });
  };

  const diffConfig = DIFFICULTIES[difficulty] || DIFFICULTIES.apprentice;
  const TOTAL_WAVES = diffConfig.waves;
  const isBossWave = wave === TOTAL_WAVES;
  const permUp = playerState.permUpgrades || {};
  // Sanctum percentages on top of the difficulty base multipliers.
  const xpMultiplier = diffConfig.xpMultiplier * (1 + (permUp.xpBonusPct || 0) / 100);
  const goldMultiplier = diffConfig.goldMultiplier * (1 + (permUp.goldDropPct || 0) / 100);

  const startRun = () => {
    // Re-roll the boss for each new run so retries face fresh archetypes.
    setBossId(rollBoss());
    // Base lives from difficulty + Sanctum maxHp stacks. Hardcore forces 1.
    // Cleric blessing adds +1 (was previously a flat "begin with 4").
    let startLives = diffConfig.lives + (permUp.maxHp || 0);
    if (modifiers.includes('extra_life')) startLives += 1;
    if (modifiers.includes('hardcore')) startLives = 1;
    setLives(startLives);
    setMaxLives(startLives);
    setWave(1);
    setScore(0);
    setStreak(0);
    setMaxStreak(0);
    setMistakesThisRun(0);
    setLivesLostInBoss(0);
    setQuestionTimes([]);
    setPowerups({
      fiftyfifty: modifiers.includes('no_powerups') ? 0 : diffConfig.powerups.fiftyfifty,
      hint: modifiers.includes('no_powerups') ? 0 : diffConfig.powerups.hint,
      freeze: modifiers.includes('no_powerups') ? 0 : diffConfig.powerups.freeze,
    });
    usedItemIdsRef.current = new Set();
    runQuestionLogRef.current = [];
    runStartTimeRef.current = Date.now();
    setPhase('playing');
    if (trackDungeonAttempt) trackDungeonAttempt();
    drawChallenge(1);
  };

  const drawChallenge = (currentWave) => {
    const flashcards = courseSet.flashcards || [];
    const quiz = courseSet.quiz || [];
    const labs = courseSet.labs || [];
    let pool = [];
    if (currentWave === TOTAL_WAVES) {
      pool = quiz.length > 0 ? quiz : (flashcards.length > 0 ? flashcards : labs);
    } else if (currentWave <= 2) {
      pool = [...flashcards, ...flashcards, ...quiz];
    } else {
      pool = [...quiz, ...quiz, ...flashcards, ...labs];
    }
    if (pool.length === 0) pool = [...flashcards, ...quiz, ...labs];
    // Filter out items already drawn this run. If that exhausts the pool, the
    // run is small enough that some repeats are unavoidable — clear the used
    // set so we can keep going.
    const used = usedItemIdsRef.current;
    let candidates = pool.filter(p => p?.id && !used.has(p.id));
    if (candidates.length === 0) {
      used.clear();
      candidates = pool;
    }
    const item = candidates[Math.floor(Math.random() * candidates.length)];
    if (!item) {
      setPhase('victory');
      return;
    }
    if (item.id) used.add(item.id);
    let type = 'flashcard';
    if (quiz.includes(item)) type = 'quiz';
    else if (labs.includes(item)) type = 'lab';
    setCurrentChallenge({ ...item, _type: type });
    setUsedFiftyFifty(false);
    setUsedHint(false);
    setQuestionStartTime(Date.now());
  };

  // Apply the consequences of a verdict (XP / streak / lives / mistakes) and
  // schedule the wave-advance. Split out so Oracle-graded answers can defer
  // these effects until the player Continues (giving the override a chance
  // to flip the verdict before lives are taken).
  const applyAnswerEffects = (correct, item) => {
    const timeTaken = (Date.now() - questionStartTime) / 1000;
    setQuestionTimes(prev => [...prev, timeTaken]);
    recordAnswer(correct, { ...item, _type: currentChallenge._type });
    logRunQuestion({ ...item, _type: currentChallenge._type }, correct, timeTaken);

    if (correct) {
      const baseXP = isBossWave ? 50 : (15 + wave * 5);
      const streakBonus = Math.floor(streak / 5) * 10;
      const xp = Math.floor((baseXP + streakBonus) * xpMultiplier);
      awardXP(xp);
      setScore(s => s + (100 + streak * 10));
      setStreak(s => {
        const newStreak = s + 1;
        setMaxStreak(m => Math.max(m, newStreak));
        if (newStreak >= 10) checkAchievement('streak_10');
        if (newStreak >= 25) checkAchievement('perfectionist');
        if (newStreak >= 50) checkAchievement('streak_50');
        if (newStreak >= 100) checkAchievement('streak_100');
        return newStreak;
      });
    } else {
      setStreak(0);
      setLives(l => l - 1);
      setMistakesThisRun(m => m + 1);
      if (isBossWave) setLivesLostInBoss(l => l + 1);
    }
  };

  const advanceAfterFeedback = (correct) => {
    setShowFeedback(null);
    const newLives = correct ? lives : lives - 1;
    if (newLives <= 0) {
      setPhase('defeat');
      return;
    }
    if (isBossWave) {
      setPhase('victory');
      return;
    }
    const nextWave = wave + 1;
    setWave(nextWave);
    drawChallenge(nextWave);
  };

  const handleAnswer = (correct, item, extra = {}) => {
    const oracleGraded = extra.source === 'oracle' || extra.source === 'fallback';
    setShowFeedback({
      correct,
      explanation: item.explanation,
      skipped: item._skipped,
      item,
      ...extra,
      awaitContinue: oracleGraded,
    });

    if (oracleGraded) {
      // Defer effects until Continue so the player can override before the
      // run takes its toll. applyAnswerEffects fires from continueDungeon.
      return;
    }

    applyAnswerEffects(correct, item);
    setTimeout(() => advanceAfterFeedback(correct), 2000);
  };

  // After Oracle grading, the user reads feedback (and may override) then
  // clicks Continue — at which point we apply effects and advance.
  const continueDungeon = () => {
    if (!showFeedback) return;
    const { correct, item } = showFeedback;
    applyAnswerEffects(correct, item);
    advanceAfterFeedback(correct);
  };

  // Override the Oracle's verdict. Effects are still deferred to Continue.
  const overrideDungeonVerdict = (newCorrect) => {
    setShowFeedback(prev => prev && prev.correct !== newCorrect
      ? { ...prev, correct: newCorrect, overridden: true }
      : prev);
  };

  const handleSkip = () => {
    // Skip in Dungeon costs a life (will route through shields once Phase 14 lands).
    handleAnswer(false, { ...currentChallenge, _skipped: true });
  };

  // Phase 10: persist a run-history entry on either outcome.
  const saveRunToHistory = (won) => {
    const durationSec = runStartTimeRef.current
      ? (Date.now() - runStartTimeRef.current) / 1000
      : 0;
    const entry = {
      runId: `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      date: new Date().toISOString(),
      difficulty,
      bossId,
      won: !!won,
      score,
      livesRemaining: lives,
      maxLives,
      mistakes: mistakesThisRun,
      maxStreak,
      durationSec,
      modifiers: [...modifiers],
      totalQuestions: runQuestionLogRef.current.length,
      questionLog: [...runQuestionLogRef.current],
    };
    const existing = tomeProgress?.runHistory || [];
    // Cap at 100 entries per tome — anything older is dropped on push.
    const trimmed = [...existing, entry].slice(-100);
    updateTomeProgress({ runHistory: trimmed });
  };

  useEffect(() => {
    if (phase === 'victory') {
      saveRunToHistory(true);
      checkAchievement('first_run');
      if (isBossWave || wave >= TOTAL_WAVES) {
        checkAchievement('first_boss');
        // Phase 9: first-defeat achievement specific to the rolled boss type.
        const bossDef = BOSS_TYPES[bossId];
        if (bossDef?.achievement) checkAchievement(bossDef.achievement);
        const newRunCount = (tomeProgress?.runsCompleted || 0) + 1;
        const newBossCount = (tomeProgress?.bossesDefeated || 0) + 1;
        updateTomeProgress({ runsCompleted: newRunCount, bossesDefeated: newBossCount });
        updateProgress({ longestStreak: Math.max(playerState.longestStreak, maxStreak) });
        const totalRuns = playerState.library.reduce((s, t) => s + (t.progress?.runsCompleted || 0), 0) + 1;
        const totalBosses = playerState.library.reduce((s, t) => s + (t.progress?.bossesDefeated || 0), 0) + 1;
        if (totalRuns >= 5) checkAchievement('five_runs');
        if (totalRuns >= 10) checkAchievement('ten_runs');
        if (totalRuns >= 20) checkAchievement('twenty_runs');
        if (totalBosses >= 5) checkAchievement('five_bosses');
        if (mistakesThisRun === 0) {
          checkAchievement('flawless');
          unlockSpecialTitle('flawless');
        }
        if (livesLostInBoss === 0) unlockSpecialTitle('bossslayer');
        if (lives === 1) checkAchievement('comeback');
        if (modifiers.length >= 1) checkAchievement('cursed_run');
        if (modifiers.length >= 2) checkAchievement('double_curse');
        const initialPowerups = modifiers.includes('no_powerups')
          ? 0
          : (diffConfig.powerups.fiftyfifty + diffConfig.powerups.hint + diffConfig.powerups.freeze);
        const usedPowerups = initialPowerups - (powerups.fiftyfifty + powerups.hint + powerups.freeze);
        if (usedPowerups === 0) checkAchievement('no_powerups_win');
        const avgTime = questionTimes.reduce((a, b) => a + b, 0) / questionTimes.length;
        if (avgTime < 5 && questionTimes.length >= 3) {
          checkAchievement('speed_demon');
          unlockSpecialTitle('speedrunner');
        }
        const completionXP = Math.floor((100 + (modifiers.length * 50)) * xpMultiplier);
        awardXP(completionXP, `${diffConfig.label} Quest Complete`);
        // Phase 8: gold scales by difficulty (Apprentice 100 → Mythic 200) plus
        // any Sanctum goldDropPct stacks.
        if (awardGold) {
          const baseGold = 100;
          awardGold(Math.floor(baseGold * goldMultiplier), `${diffConfig.label} Dungeon Cleared`);
        }
        // Phase 8: difficulty-specific achievement + special title on first
        // completion at this tier.
        if (diffConfig.completeAchievement) {
          checkAchievement(diffConfig.completeAchievement);
        }
        if (diffConfig.rewardTitleId) {
          unlockSpecialTitle(diffConfig.rewardTitleId);
        }
      }
    }
    if (phase === 'defeat') {
      saveRunToHistory(false);
    }
  }, [phase]);

  if (phase === 'setup') {
    return (
      <div className="space-y-6">
        <button onClick={onExit} className="flex items-center gap-2 text-amber-600 hover:text-amber-400 italic">
          <ArrowLeft className="w-4 h-4" /> Return to Hearth
        </button>
        <div className="p-6 rounded relative" style={{
          background: 'linear-gradient(135deg, rgba(80, 20, 20, 0.7) 0%, rgba(20, 6, 6, 0.95) 100%)',
          border: '3px double rgba(220, 38, 38, 0.5)',
          boxShadow: '0 0 40px rgba(220, 38, 38, 0.3), inset 0 0 30px rgba(0,0,0,0.6)',
        }}>
          <div className="absolute top-2 left-2 text-red-500 text-lg">⚔</div>
          <div className="absolute top-2 right-2 text-red-500 text-lg">⚔</div>
          <div className="absolute bottom-2 left-2 text-red-500 text-lg">⚔</div>
          <div className="absolute bottom-2 right-2 text-red-500 text-lg">⚔</div>
          <div className="flex items-center gap-3 mb-2">
            <Swords className="w-10 h-10 text-red-400" style={{ filter: 'drop-shadow(0 0 10px rgba(239, 68, 68, 0.6))' }} />
            <h2 className="text-3xl font-bold text-red-300 italic" style={{ textShadow: '0 0 15px rgba(239, 68, 68, 0.5)' }}>
              The Dungeon Delve
            </h2>
          </div>
          <p className="text-amber-100/80 mb-6 italic leading-relaxed">
            "{diffConfig.waves} chambers stand between you and the dungeon lord. Survive the trials, claim the glory. Fall, and your saga ends in shadow..."
          </p>
          <div className="mb-6">
            <h3 className="font-bold text-amber-300 mb-3 italic tracking-wider">⚜ TIER OF TRIAL ⚜</h3>
            <div className="grid md:grid-cols-2 gap-2">
              {DIFFICULTY_ORDER.map((dId) => {
                const d = DIFFICULTIES[dId];
                const unlocked = isDifficultyUnlocked(playerState, dId);
                const selected = difficulty === dId;
                return (
                  <button
                    key={dId}
                    onClick={() => unlocked && setDifficulty(dId)}
                    disabled={!unlocked}
                    className="p-3 rounded text-left border-2 transition disabled:cursor-not-allowed relative"
                    style={{
                      background: !unlocked
                        ? 'linear-gradient(135deg, rgba(15, 8, 20, 0.7) 0%, rgba(10, 6, 4, 0.95) 100%)'
                        : selected
                          ? 'linear-gradient(135deg, rgba(120, 53, 15, 0.7) 0%, rgba(41, 24, 12, 0.95) 100%)'
                          : 'linear-gradient(135deg, rgba(31, 12, 41, 0.7) 0%, rgba(10, 6, 4, 0.95) 100%)',
                      borderColor: !unlocked
                        ? 'rgba(60, 35, 80, 0.4)'
                        : selected
                          ? 'rgba(245, 158, 11, 0.85)'
                          : 'rgba(126, 34, 206, 0.5)',
                      boxShadow: selected ? '0 0 18px rgba(245, 158, 11, 0.4)' : 'inset 0 0 10px rgba(0,0,0,0.4)',
                      opacity: unlocked ? 1 : 0.6,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">{d.icon}</span>
                      <span className={`font-bold italic text-sm ${unlocked ? 'text-amber-200' : 'text-amber-700/70'}`} style={unlocked ? { textShadow: '0 0 6px rgba(245, 158, 11, 0.3)' } : undefined}>
                        {d.label}
                      </span>
                      {!unlocked && <Lock className="w-3.5 h-3.5 text-amber-700/70 ml-auto" />}
                      {selected && unlocked && <Check className="w-4 h-4 text-amber-300 ml-auto" />}
                    </div>
                    <p className={`text-xs italic ${unlocked ? 'text-amber-100/70' : 'text-amber-700/60'}`}>
                      {d.description}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <span className={unlocked ? 'text-purple-300' : 'text-purple-300/40'}>
                        ❤ {d.lives} {d.lives === 1 ? 'life' : 'lives'}
                      </span>
                      <span className={unlocked ? 'text-purple-300' : 'text-purple-300/40'}>
                        ⚔ {d.waves} chambers
                      </span>
                      <span className={unlocked ? 'text-amber-300' : 'text-amber-300/40'}>
                        ✦ {d.xpMultiplier}× XP
                      </span>
                      <span className={unlocked ? 'text-amber-300' : 'text-amber-300/40'}>
                        🪙 {d.goldMultiplier}× gold
                      </span>
                    </div>
                    {!unlocked && d.unlockText && (
                      <div className="mt-2 text-xs text-amber-700/80 italic flex items-start gap-1">
                        <Lock className="w-3 h-3 flex-shrink-0 mt-0.5" />
                        <span>{d.unlockText}</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          {(() => {
            const boss = BOSS_TYPES[bossId] || BOSS_TYPES.lich;
            return (
              <div className="mb-6 p-4 rounded relative" style={{
                background: 'linear-gradient(135deg, rgba(31, 12, 41, 0.7) 0%, rgba(10, 6, 4, 0.95) 100%)',
                border: '2px solid rgba(126, 34, 206, 0.55)',
                boxShadow: '0 0 18px rgba(168, 85, 247, 0.25), inset 0 0 15px rgba(0,0,0,0.5)',
              }}>
                <div className="absolute top-1 left-1 text-purple-400/60 text-xs">⚜</div>
                <div className="absolute top-1 right-1 text-purple-400/60 text-xs">⚜</div>
                <div className="absolute bottom-1 left-1 text-purple-400/60 text-xs">⚜</div>
                <div className="absolute bottom-1 right-1 text-purple-400/60 text-xs">⚜</div>
                <div className="text-xs text-purple-400 tracking-[0.25em] italic mb-2">⚜ THOU SHALT FACE ⚜</div>
                <div className="flex items-start gap-3">
                  <div className="text-5xl flex-shrink-0">{boss.icon}</div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xl font-bold text-amber-200 italic" style={{ textShadow: '0 0 8px rgba(245, 158, 11, 0.4)' }}>
                      {boss.name}
                    </h4>
                    <p className="text-xs text-amber-100/75 italic mt-1 leading-relaxed">{boss.flavor}</p>
                    <p className="text-xs text-purple-300 italic mt-2"><span className="text-amber-300 font-bold">⚔ Mechanic:</span> {boss.mechanic}</p>
                  </div>
                  <button
                    onClick={() => setBossId(rollBoss())}
                    className="self-start px-2.5 py-1.5 rounded text-xs italic border border-purple-500/60 text-purple-200 hover:bg-purple-900/30 flex items-center gap-1"
                    style={{ background: 'rgba(31, 12, 41, 0.7)' }}
                    title="Re-roll boss"
                  >
                    <RotateCcw className="w-3 h-3" /> Re-roll
                  </button>
                </div>
              </div>
            );
          })()}
          <div className="mb-6">
            <h3 className="font-bold text-amber-300 mb-3 italic tracking-wider">⚜ ANCIENT CURSES ⚜</h3>
            <div className="grid md:grid-cols-2 gap-2">
              <ModifierToggle
                active={modifiers.includes('hardcore')}
                onClick={() => setModifiers(m => m.includes('hardcore') ? m.filter(x => x !== 'hardcore') : [...m, 'hardcore'])}
                title="Curse of the Lone Hero" desc="Begin with but a single life" bonus="+50 XP"
              />
              <ModifierToggle
                active={modifiers.includes('no_powerups')}
                onClick={() => setModifiers(m => m.includes('no_powerups') ? m.filter(x => x !== 'no_powerups') : [...m, 'no_powerups'])}
                title="Vow of Pure Steel" desc="No magical aids permitted" bonus="+50 XP"
              />
              <ModifierToggle
                active={modifiers.includes('extra_life')}
                onClick={() => setModifiers(m => m.includes('extra_life') ? m.filter(x => x !== 'extra_life') : [...m, 'extra_life'])}
                title="Blessing of the Cleric" desc="Begin with 4 lives" bonus="No glory" penalty
              />
            </div>
          </div>
          <button onClick={startRun} className="w-full py-4 font-bold text-lg rounded flex items-center justify-center gap-2 transition text-amber-50 border-2 border-red-400 italic tracking-wider"
            style={{
              background: 'linear-gradient(to bottom, #dc2626 0%, #991b1b 50%, #450a0a 100%)',
              boxShadow: '0 0 30px rgba(220, 38, 38, 0.5), inset 0 1px 0 rgba(255,255,255,0.2)',
              textShadow: '0 0 10px rgba(255, 255, 255, 0.5)',
            }}>
            <Play className="w-6 h-6" /> ⚔ ENTER THE DUNGEON ⚔
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'defeat') {
    return (
      <div className="text-center py-12 space-y-6">
        <Skull className="w-32 h-32 mx-auto text-red-500" style={{ filter: 'drop-shadow(0 0 20px rgba(239, 68, 68, 0.8))' }} />
        <h2 className="text-5xl font-bold text-red-400 italic" style={{ textShadow: '0 0 20px rgba(239, 68, 68, 0.6)' }}>You Have Fallen</h2>
        <p className="text-amber-100/70 italic text-lg">"You perished in chamber {wave} of {TOTAL_WAVES}..."</p>
        <div className="grid grid-cols-3 gap-4 max-w-md mx-auto p-4 rounded" style={{ background: 'rgba(41, 24, 12, 0.7)', border: '2px solid rgba(180, 83, 9, 0.5)' }}>
          <div><div className="text-2xl font-bold text-amber-400">{score}</div><div className="text-xs text-amber-700 tracking-wider">GLORY</div></div>
          <div><div className="text-2xl font-bold text-orange-400">{maxStreak}</div><div className="text-xs text-amber-700 tracking-wider">BEST STREAK</div></div>
          <div><div className="text-2xl font-bold text-cyan-400">{wave - 1}</div><div className="text-xs text-amber-700 tracking-wider">CHAMBERS</div></div>
        </div>
        <RunQuestionReview log={runQuestionLogRef.current} />
        <div className="flex gap-3 justify-center flex-wrap">
          <button onClick={() => setPhase('setup')} className="px-6 py-3 font-bold rounded text-amber-50 border-2 border-red-400 italic"
            style={{ background: 'linear-gradient(to bottom, #dc2626 0%, #991b1b 100%)', boxShadow: '0 0 15px rgba(220, 38, 38, 0.5)' }}>Rise Again</button>
          {onViewHistory && (
            <button onClick={onViewHistory} className="px-6 py-3 rounded border-2 border-purple-500 text-purple-200 italic flex items-center gap-2" style={{ background: 'rgba(31, 12, 41, 0.7)' }}>
              <Scroll className="w-4 h-4" /> View Chronicle
            </button>
          )}
          <button onClick={onExit} className="px-6 py-3 rounded border-2 border-amber-700 text-amber-200 italic" style={{ background: 'rgba(41, 24, 12, 0.8)' }}>Return to Hearth</button>
        </div>
      </div>
    );
  }

  if (phase === 'victory') {
    return (
      <div className="text-center py-12 space-y-6">
        <Crown className="w-32 h-32 mx-auto text-amber-400" style={{ filter: 'drop-shadow(0 0 30px rgba(245, 158, 11, 1))', animation: 'pulse 2s infinite' }} />
        <h2 className="text-6xl font-bold italic" style={{
          background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 50%, #92400e 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          textShadow: '0 0 30px rgba(245, 158, 11, 0.8)',
        }}>⚔ VICTORY ⚔</h2>
        <p className="text-amber-100/80 italic text-lg">"The dungeon lord has fallen. Bards shall sing of your deeds..."</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto p-4 rounded" style={{
          background: 'rgba(41, 24, 12, 0.7)', border: '2px solid rgba(245, 158, 11, 0.5)', boxShadow: '0 0 20px rgba(245, 158, 11, 0.3)',
        }}>
          <div><div className="text-2xl font-bold text-amber-400">{score}</div><div className="text-xs text-amber-700 tracking-wider">GLORY</div></div>
          <div><div className="text-2xl font-bold text-orange-400">{maxStreak}</div><div className="text-xs text-amber-700 tracking-wider">BEST STREAK</div></div>
          <div><div className="text-2xl font-bold text-red-400">{mistakesThisRun}</div><div className="text-xs text-amber-700 tracking-wider">MISTAKES</div></div>
          <div><div className="text-2xl font-bold text-emerald-400">{lives}/{maxLives}</div><div className="text-xs text-amber-700 tracking-wider">LIVES LEFT</div></div>
        </div>
        <RunQuestionReview log={runQuestionLogRef.current} />
        <div className="flex gap-3 justify-center flex-wrap">
          <button onClick={() => setPhase('setup')} className="px-6 py-3 font-bold rounded text-amber-950 border-2 border-amber-300 italic"
            style={{ background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)', boxShadow: '0 0 20px rgba(245, 158, 11, 0.5)' }}>Quest Anew</button>
          {onViewHistory && (
            <button onClick={onViewHistory} className="px-6 py-3 rounded border-2 border-purple-500 text-purple-200 italic flex items-center gap-2" style={{ background: 'rgba(31, 12, 41, 0.7)' }}>
              <Scroll className="w-4 h-4" /> View Chronicle
            </button>
          )}
          <button onClick={onExit} className="px-6 py-3 rounded border-2 border-amber-700 text-amber-200 italic" style={{ background: 'rgba(41, 24, 12, 0.8)' }}>Return to Hearth</button>
        </div>
      </div>
    );
  }

  if (!currentChallenge) return <div className="text-center py-12 text-amber-600 italic">Summoning challenge...</div>;

  return (
    <div className="space-y-4">
      <div className="p-4 rounded relative" style={{
        background: 'linear-gradient(135deg, rgba(41, 24, 12, 0.95) 0%, rgba(10, 6, 4, 0.95) 100%)',
        border: '2px solid rgba(180, 83, 9, 0.6)', boxShadow: '0 0 20px rgba(180, 83, 9, 0.2)',
      }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            {Array.from({ length: maxLives }).map((_, i) => (
              <Heart key={i} className={`w-6 h-6 ${i < lives ? 'text-red-500 fill-red-500' : 'text-stone-700'}`}
                style={i < lives ? { filter: 'drop-shadow(0 0 6px rgba(239, 68, 68, 0.8))' } : {}} />
            ))}
          </div>
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-1"><span className="text-amber-700 italic">Chamber:</span><span className="font-bold text-amber-300">{wave}/{TOTAL_WAVES}</span>{isBossWave && <Crown className="w-4 h-4 text-amber-400" />}</div>
            <div className="flex items-center gap-1"><Flame className="w-4 h-4 text-orange-400" /><span className="font-bold text-orange-300">{streak}</span></div>
            <div className="flex items-center gap-1"><Gem className="w-4 h-4 text-amber-400" /><span className="font-bold text-amber-300">{score}</span></div>
          </div>
        </div>
      </div>

      {showFeedback && (
        <div className="p-4 rounded border-2 space-y-3" style={{
          background: showFeedback.correct ? 'rgba(6, 78, 59, 0.6)' : 'rgba(127, 29, 29, 0.6)',
          borderColor: showFeedback.correct ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)',
        }}>
          <div className="font-bold text-lg flex items-center gap-2 italic flex-wrap">
            {showFeedback.correct ? <Check className="w-5 h-5 text-emerald-400" /> : <X className="w-5 h-5 text-red-400" />}
            <span>{showFeedback.correct ? '⚔ Strike True! ⚔' : (showFeedback.skipped ? '↳ Skipped — A Life is Forfeit' : '✗ The Blow Falters')}</span>
            {showFeedback.overridden && (
              <span className="text-xs px-2 py-0.5 rounded border border-amber-400/60 text-amber-200 italic">overridden</span>
            )}
            {showFeedback.source === 'oracle' && (
              <span className="text-xs px-2 py-0.5 rounded border border-purple-400/60 text-purple-200 italic flex items-center gap-1">
                <Wand2 className="w-3 h-3" /> Graded by the Oracle
              </span>
            )}
            {showFeedback.source === 'fallback' && (
              <span className="text-xs px-2 py-0.5 rounded border border-amber-700/60 text-amber-300 italic" title={showFeedback.fallbackReason || ''}>
                Tome match (Oracle silent)
              </span>
            )}
          </div>
          {showFeedback.oracleFeedback && (
            <p className="text-sm text-amber-100/90 italic leading-relaxed">{showFeedback.oracleFeedback}</p>
          )}
          {showFeedback.explanation && (
            <p className="text-sm text-amber-100/70 italic"><span className="text-purple-300">From the tome:</span> {showFeedback.explanation}</p>
          )}
          {showFeedback.awaitContinue && (
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-amber-900/40 flex-wrap">
              <div className="flex gap-2">
                {!showFeedback.correct && (
                  <button onClick={() => overrideDungeonVerdict(true)} className="px-3 py-1.5 rounded text-xs italic border-2 border-emerald-500 text-emerald-200 flex items-center gap-1" style={{ background: 'rgba(6, 78, 59, 0.4)' }}>
                    <Check className="w-3 h-3" /> Mark as correct
                  </button>
                )}
                {showFeedback.correct && (
                  <button onClick={() => overrideDungeonVerdict(false)} className="px-3 py-1.5 rounded text-xs italic border-2 border-red-500 text-red-200 flex items-center gap-1" style={{ background: 'rgba(127, 29, 29, 0.4)' }}>
                    <X className="w-3 h-3" /> Mark as wrong
                  </button>
                )}
              </div>
              <button onClick={continueDungeon} className="px-4 py-2 rounded text-sm font-bold italic border-2 border-amber-300 text-amber-950 flex items-center gap-2"
                style={{ background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)', boxShadow: '0 0 12px rgba(245, 158, 11, 0.5)' }}>
                Continue <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {!showFeedback && isBossWave && BOSS_TYPES[bossId] && (
        <BossEncounter
          boss={BOSS_TYPES[bossId]}
          courseSet={courseSet}
          initialLives={lives}
          recordAnswer={(correct, item) => {
            recordAnswer(correct, { ...item, _type: 'quiz' });
            logRunQuestion({ ...item, _type: 'quiz' }, correct, 0);
          }}
          onWin={() => {
            // Treat as if the player landed a final correct answer on the boss
            // wave. handleAnswer will fire all the standard victory hooks
            // (achievements, XP, gold, difficulty rewards) and then advance.
            handleAnswer(true, { ...currentChallenge, _bossDefeated: bossId, _bossKind: bossId });
          }}
          onLose={() => {
            // Force defeat phase. No skip-life cost — the boss already drained
            // them. Use applyAnswerEffects with correct=false to record a final
            // wrong, then move to defeat phase directly.
            setShowFeedback({ correct: false, explanation: BOSS_TYPES[bossId].defeatText });
            setTimeout(() => {
              setShowFeedback(null);
              setPhase('defeat');
            }, 2000);
          }}
        />
      )}
      {!showFeedback && !isBossWave && (
        <>
          <ChallengeRenderer
            challenge={currentChallenge} onAnswer={handleAnswer} powerups={powerups} setPowerups={setPowerups}
            usedFiftyFifty={usedFiftyFifty} setUsedFiftyFifty={setUsedFiftyFifty}
            usedHint={usedHint} setUsedHint={setUsedHint} isBoss={isBossWave}
          />
          <div className="flex justify-end">
            <button
              onClick={handleSkip}
              className="px-4 py-2 rounded text-sm border-2 border-red-800 text-red-300 hover:bg-red-900/30 italic flex items-center gap-2"
              style={{ background: 'rgba(41, 12, 12, 0.6)' }}
              title="Costs a life — a coward's escape"
            >
              <ChevronRight className="w-4 h-4" /> Skip Challenge (-1 Life)
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Per-question review block shown on the dungeon victory/defeat screens.
// Collapsible — defaults to closed for fast retries; expand to study the
// individual answers from this run.
function RunQuestionReview({ log }) {
  const [open, setOpen] = useState(false);
  const total = (log || []).length;
  if (total === 0) return null;
  const wrong = log.filter(q => !q.correct).length;
  return (
    <div className="max-w-2xl mx-auto rounded text-left" style={{
      background: 'rgba(31, 12, 41, 0.7)',
      border: '1px solid rgba(126, 34, 206, 0.5)',
      boxShadow: 'inset 0 0 12px rgba(0,0,0,0.5)',
    }}>
      <button onClick={() => setOpen(o => !o)} className="w-full px-4 py-3 flex items-center gap-2 italic">
        <Scroll className="w-4 h-4 text-purple-300" />
        <span className="text-purple-200 font-bold">Question Review</span>
        <span className="text-xs text-amber-100/70">— {total} answered, {wrong} missed</span>
        {open ? <ChevronUp className="w-4 h-4 text-purple-300 ml-auto" /> : <ChevronDown className="w-4 h-4 text-purple-300 ml-auto" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-1 max-h-80 overflow-y-auto">
          {log.map((q, i) => (
            <div key={i} className="flex items-start gap-2 text-xs italic" style={{ background: 'rgba(10, 6, 4, 0.5)', padding: '6px 8px', borderRadius: '4px' }}>
              {q.correct
                ? <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                : <X className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />}
              <div className="flex-1 min-w-0">
                <div className="text-amber-100/80 truncate">{q.prompt}</div>
                <div className="text-amber-700">
                  {q.type ? <span>{q.type}</span> : null}
                  {q.bossKind ? <span> · {BOSS_TYPES[q.bossKind]?.name || q.bossKind}</span> : null}
                  {q.timeSec ? <span> · {q.timeSec}s</span> : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ModifierToggle({ active, onClick, title, desc, bonus, penalty }) {
  return (
    <button onClick={onClick} className="text-left p-3 rounded border-2 transition" style={{
      background: active ? 'rgba(120, 53, 15, 0.5)' : 'rgba(41, 24, 12, 0.6)',
      borderColor: active ? 'rgba(245, 158, 11, 0.8)' : 'rgba(120, 53, 15, 0.5)',
      boxShadow: active ? '0 0 15px rgba(245, 158, 11, 0.3)' : 'none',
    }}>
      <div className="flex justify-between items-start">
        <div>
          <div className="font-bold text-amber-200 italic">{title}</div>
          <div className="text-xs text-amber-100/60 italic">{desc}</div>
        </div>
        <div className={`text-xs font-bold ${penalty ? 'text-stone-500' : 'text-amber-400'}`}>{bonus}</div>
      </div>
    </button>
  );
}

// === BossEncounter (Phase 9) ===
// Replaces ChallengeRenderer on the boss wave. Each boss archetype has its own
// mechanic but they share a common shell: boss-themed header, status line
// (chain/hits/timer/etc.), question/answer area, and per-attempt feedback.
// Lives flow through here too — wrong answers deduct from `lives` per the
// boss's lifeCost. When lives ≤ 0 the encounter calls onLose; when the win
// condition is met, onWin.
function BossEncounter({ boss, courseSet, initialLives, onWin, onLose, recordAnswer }) {
  // Boss-only quiz pool. Flashcards (subjective) are excluded — bosses need
  // objective right/wrong outcomes.
  const allQuiz = useMemo(() => courseSet?.quiz || [], [courseSet]);
  const fillblanks = useMemo(
    () => allQuiz.filter(q => q.type === 'fillblank' || q.type === 'fill_in_blank'),
    [allQuiz]
  );
  const initialQuestions = useMemo(() => {
    if (boss.id === 'riddler') {
      const need = boss.riddleCount;
      // Prefer fillblanks; fall back to other quiz if fewer than needed.
      const pool = fillblanks.length >= need
        ? fillblanks
        : [...fillblanks, ...allQuiz.filter(q => !fillblanks.includes(q))];
      return shuffleArray(pool).slice(0, need);
    }
    if (boss.id === 'hydra') return shuffleArray(allQuiz).slice(0, boss.headCount);
    if (boss.id === 'sphinx') return shuffleArray(allQuiz).slice(0, boss.riddleCount);
    if (boss.id === 'behemoth') return shuffleArray(allQuiz).slice(0, boss.hitsToFell);
    // Lich draws an oversized pool so chain resets can keep pulling fresh Qs.
    return shuffleArray(allQuiz).slice(0, Math.max(15, boss.chainTarget * 3));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boss.id]);

  const [lives, setLives] = useState(initialLives);
  const [questions] = useState(initialQuestions);
  const [qIdx, setQIdx] = useState(0);
  const [textAnswer, setTextAnswer] = useState('');
  const [feedback, setFeedback] = useState(null); // { correct, message }

  // Boss-specific state
  const [chain, setChain] = useState(0); // Lich
  const [hits, setHits] = useState(0); // Behemoth
  const [hydraAnswers, setHydraAnswers] = useState(['', '', '']); // Hydra
  const [hydraResults, setHydraResults] = useState(null); // [{ correct }, ...]
  const [secondsLeft, setSecondsLeft] = useState(boss.secondsPerRiddle || 0); // Sphinx
  const timerRef = useRef(null);

  const currentQ = questions[qIdx];

  // Sphinx countdown — restart on each new question.
  useEffect(() => {
    if (boss.id !== 'sphinx' || feedback || !currentQ) return;
    setSecondsLeft(boss.secondsPerRiddle);
    timerRef.current = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          clearInterval(timerRef.current);
          setTimeout(() => resolveSingleAnswer(false, true), 50); // ran out of time
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qIdx, feedback, boss.id]);

  // Common: end the boss with win or lose, also recording the deciding question.
  const finishWin = () => onWin();
  const finishLose = () => onLose();

  // Apply a life deduction. If lives drop to ≤0 → lose.
  const takeDamage = (amount) => {
    setLives(l => {
      const nl = l - amount;
      if (nl <= 0) {
        setTimeout(() => finishLose(), 600);
        return 0;
      }
      return nl;
    });
  };

  // For non-Hydra bosses (one question at a time). `timedOut` = Sphinx ran out.
  const resolveSingleAnswer = (correct, timedOut = false) => {
    if (currentQ) recordAnswer(correct, { ...currentQ, _bossKind: boss.id });

    if (boss.id === 'lich') {
      if (correct) {
        const next = chain + 1;
        setChain(next);
        setFeedback({ correct: true, message: `Chain ${next}/${boss.chainTarget} — keep it.` });
        if (next >= boss.chainTarget) {
          setTimeout(() => finishWin(), 1000);
          return;
        }
      } else {
        setChain(0);
        setFeedback({ correct: false, message: 'The chain shatters — begin anew.' });
      }
    } else if (boss.id === 'riddler') {
      if (correct) {
        setFeedback({ correct: true, message: 'A clean answer.' });
      } else {
        setFeedback({ correct: false, message: 'Wrong — a life forfeit.' });
        takeDamage(1);
      }
    } else if (boss.id === 'sphinx') {
      if (correct) {
        setFeedback({ correct: true, message: `Swift and true (${secondsLeft}s remained).` });
      } else {
        setFeedback({ correct: false, message: timedOut ? 'The hourglass emptied — a life lost.' : 'Wrong — a life lost.' });
        takeDamage(1);
      }
    } else if (boss.id === 'behemoth') {
      if (correct) {
        const nh = hits + 1;
        setHits(nh);
        setFeedback({ correct: true, message: `Strike ${nh}/${boss.hitsToFell} lands true.` });
        if (nh >= boss.hitsToFell) {
          setTimeout(() => finishWin(), 1000);
          return;
        }
      } else {
        setFeedback({ correct: false, message: `The blow misses — ${boss.lifeCost} lives forfeit.` });
        takeDamage(boss.lifeCost);
      }
    }

    // Advance after a beat (unless we already triggered win/lose with longer delay)
    setTimeout(() => {
      setFeedback(null);
      setTextAnswer('');
      // For Lich, keep cycling through the pool (wrap with modulo so we don't
      // run out). For others, advance linearly; if we run out without winning,
      // treat as lose.
      if (boss.id === 'lich') {
        setQIdx(i => (i + 1) % questions.length);
      } else {
        const next = qIdx + 1;
        if (next >= questions.length) {
          // Used up all the questions — if win condition wasn't met by now, lose.
          setTimeout(() => finishLose(), 200);
          return;
        }
        setQIdx(next);
      }
    }, 1200);
  };

  // Hydra — submit all 3 at once.
  const submitHydra = () => {
    if (hydraResults || feedback) return;
    const results = questions.slice(0, boss.headCount).map((q, i) => {
      const isMC = q.options && Array.isArray(q.options);
      const isTF = q.type === 'truefalse';
      const ans = hydraAnswers[i];
      let correct = false;
      if (isMC) {
        // For MC, the "answer" is the index stored as a string from the radio.
        correct = parseInt(ans, 10) === q.correctIndex;
      } else if (isTF) {
        correct = (ans === 'true' && q.correctAnswer === true) || (ans === 'false' && q.correctAnswer === false);
      } else {
        // Fillblank: substring match against acceptedAnswers / correctAnswer.
        const norm = (s) => String(s || '').trim().toLowerCase();
        const u = norm(ans);
        if (u) {
          const candidates = [];
          if (q.correctAnswer != null) candidates.push(String(q.correctAnswer));
          if (Array.isArray(q.acceptedAnswers)) candidates.push(...q.acceptedAnswers);
          correct = candidates.some(c => {
            const n = norm(c);
            return n && (n === u || u.includes(n) || n.includes(u));
          });
        }
      }
      recordAnswer(correct, { ...q, _bossKind: 'hydra' });
      return { correct };
    });
    setHydraResults(results);
    const allCorrect = results.every(r => r.correct);
    if (allCorrect) {
      setTimeout(() => finishWin(), 1500);
    } else {
      const wrongCount = results.filter(r => !r.correct).length;
      setFeedback({ correct: false, message: `${wrongCount} head${wrongCount === 1 ? '' : 's'} unbowed — life lost. The Hydra reshapes itself.` });
      takeDamage(1);
      setTimeout(() => {
        setHydraResults(null);
        setHydraAnswers(['', '', '']);
        setFeedback(null);
        // Re-shuffle 3 fresh heads from the pool.
        // Limit: if pool is smaller than 3, reuse.
      }, 2000);
    }
  };

  // === Renderers ===
  const headerColors = { purple: '#a855f7', emerald: '#10b981', amber: '#fde047', sapphire: '#0ea5e9', rose: '#f43f5e' };
  const accent = headerColors[boss.color] || '#a855f7';

  if (!currentQ && boss.id !== 'hydra') {
    return (
      <div className="p-6 rounded text-center text-amber-700 italic" style={{ background: 'rgba(31, 12, 41, 0.7)', border: '1px solid rgba(126, 34, 206, 0.4)' }}>
        This tome lacks enough riddles for {boss.name}. Studythen return.
      </div>
    );
  }

  const renderHeader = () => (
    <div className="p-4 rounded relative mb-3" style={{
      background: 'linear-gradient(135deg, rgba(31, 12, 41, 0.95) 0%, rgba(10, 6, 4, 1) 100%)',
      border: `2px solid ${accent}99`,
      boxShadow: `0 0 25px ${accent}40, inset 0 0 15px rgba(0,0,0,0.6)`,
    }}>
      <div className="flex items-start gap-3">
        <div className="text-4xl flex-shrink-0">{boss.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="text-xs tracking-[0.2em] italic" style={{ color: accent }}>⚔ DUNGEON LORD ⚔</div>
          <h3 className="text-lg font-bold text-amber-200 italic" style={{ textShadow: '0 0 8px rgba(245, 158, 11, 0.4)' }}>{boss.name}</h3>
          <p className="text-xs text-amber-100/70 italic mt-1">{boss.mechanic}</p>
        </div>
        <div className="flex flex-col items-end text-xs">
          <span className="text-red-300 italic">❤ Lives: <span className="font-bold tabular-nums">{lives}</span></span>
          {boss.id === 'lich' && <span className="text-purple-300 italic mt-1">⛓ Chain: <span className="font-bold tabular-nums">{chain}/{boss.chainTarget}</span></span>}
          {boss.id === 'behemoth' && <span className="text-rose-300 italic mt-1">🪨 Hits: <span className="font-bold tabular-nums">{hits}/{boss.hitsToFell}</span></span>}
          {boss.id === 'sphinx' && !feedback && <span className="text-sky-300 italic mt-1">⏳ <span className="font-bold tabular-nums">{secondsLeft}s</span></span>}
          {(boss.id === 'riddler' || boss.id === 'hydra') && (
            <span className="text-amber-300 italic mt-1">
              {boss.id === 'hydra'
                ? `🐉 Heads: ${boss.headCount}`
                : `📜 Riddle ${qIdx + 1}/${questions.length}`}
            </span>
          )}
        </div>
      </div>
    </div>
  );

  const renderFeedback = () => feedback && (
    <div className="p-4 rounded border-2 mb-3" style={{
      background: feedback.correct ? 'rgba(6, 78, 59, 0.5)' : 'rgba(127, 29, 29, 0.5)',
      borderColor: feedback.correct ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)',
    }}>
      <div className="font-bold flex items-center gap-2 italic">
        {feedback.correct ? <Check className="w-5 h-5 text-emerald-400" /> : <X className="w-5 h-5 text-red-400" />}
        {feedback.message}
      </div>
    </div>
  );

  // Standard single-question UI for non-Hydra bosses.
  const renderSingleQuestion = () => {
    const q = currentQ;
    const isMC = q.options && Array.isArray(q.options);
    const isTF = q.type === 'truefalse';
    const isFIB = q.type === 'fillblank' || q.type === 'fill_in_blank';
    const disabled = !!feedback;
    return (
      <div className="p-5 rounded" style={{ background: 'rgba(31, 12, 41, 0.8)', border: '1px solid rgba(126, 34, 206, 0.5)' }}>
        <div className="text-lg text-amber-50 italic mb-4">{q.question}</div>
        {isMC && (
          <div className="space-y-2">
            {q.options.map((opt, i) => (
              <button key={i} disabled={disabled} onClick={() => resolveSingleAnswer(i === q.correctIndex)}
                className="w-full text-left p-3 rounded border-2 text-amber-50 disabled:opacity-50"
                style={{ background: 'rgba(31, 12, 41, 0.6)', borderColor: 'rgba(126, 34, 206, 0.5)' }}>
                <span className="text-purple-400 font-bold mr-2">{String.fromCharCode(65 + i)}.</span>{opt}
              </button>
            ))}
          </div>
        )}
        {isTF && (
          <div className="grid grid-cols-2 gap-3">
            <button disabled={disabled} onClick={() => resolveSingleAnswer(q.correctAnswer === true)} className="p-4 rounded font-bold border-2 border-emerald-400 text-emerald-200 italic disabled:opacity-50" style={{ background: 'rgba(6, 78, 59, 0.4)' }}>⚖ Verily True ⚖</button>
            <button disabled={disabled} onClick={() => resolveSingleAnswer(q.correctAnswer === false)} className="p-4 rounded font-bold border-2 border-red-400 text-red-200 italic disabled:opacity-50" style={{ background: 'rgba(127, 29, 29, 0.4)' }}>⚖ A Falsehood ⚖</button>
          </div>
        )}
        {isFIB && (
          <div className="space-y-2">
            <input type="text" value={textAnswer} onChange={(e) => setTextAnswer(e.target.value)} disabled={disabled}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || !textAnswer.trim() || disabled) return;
                const norm = (s) => String(s || '').trim().toLowerCase();
                const u = norm(textAnswer);
                const cands = [];
                if (q.correctAnswer != null) cands.push(String(q.correctAnswer));
                if (Array.isArray(q.acceptedAnswers)) cands.push(...q.acceptedAnswers);
                const correct = cands.some(c => { const n = norm(c); return n && (n === u || u.includes(n) || n.includes(u)); });
                resolveSingleAnswer(correct);
              }}
              placeholder="Inscribe thy answer..." autoFocus
              className="w-full p-3 rounded border-2 italic text-amber-50"
              style={{ background: 'rgba(31, 12, 41, 0.6)', borderColor: 'rgba(126, 34, 206, 0.5)' }} />
            <button disabled={disabled || !textAnswer.trim()} onClick={() => {
              const norm = (s) => String(s || '').trim().toLowerCase();
              const u = norm(textAnswer);
              const cands = [];
              if (q.correctAnswer != null) cands.push(String(q.correctAnswer));
              if (Array.isArray(q.acceptedAnswers)) cands.push(...q.acceptedAnswers);
              const correct = cands.some(c => { const n = norm(c); return n && (n === u || u.includes(n) || n.includes(u)); });
              resolveSingleAnswer(correct);
            }} className="w-full py-3 font-bold rounded text-amber-50 border-2 border-purple-400 italic disabled:opacity-50"
              style={{ background: 'linear-gradient(to bottom, #a855f7 0%, #6b21a8 100%)' }}>Submit Thy Answer</button>
          </div>
        )}
      </div>
    );
  };

  // Hydra UI — three heads, three answers, one Submit.
  const renderHydra = () => {
    const heads = questions.slice(0, boss.headCount);
    if (heads.length < boss.headCount) {
      return <div className="p-4 text-amber-700 italic text-center">Not enough riddles in this tome to face the Hydra.</div>;
    }
    const submitted = !!hydraResults;
    return (
      <div className="space-y-3">
        {heads.map((q, i) => {
          const isMC = q.options && Array.isArray(q.options);
          const isTF = q.type === 'truefalse';
          const result = hydraResults?.[i];
          const headBorder = result
            ? (result.correct ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)')
            : 'rgba(16, 185, 129, 0.5)';
          return (
            <div key={i} className="p-4 rounded" style={{
              background: 'rgba(6, 30, 22, 0.85)',
              border: `2px solid ${headBorder}`,
              boxShadow: result ? `0 0 12px ${headBorder}` : 'none',
            }}>
              <div className="text-xs text-emerald-400 italic tracking-[0.2em] mb-1">🐉 HEAD {i + 1}</div>
              <div className="text-amber-50 italic mb-2">{q.question}</div>
              {isMC ? (
                <div className="space-y-1.5">
                  {q.options.map((opt, oi) => (
                    <label key={oi} className={`flex items-center gap-2 p-2 rounded border ${submitted ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-emerald-900/30'}`}
                      style={{ background: 'rgba(6, 30, 22, 0.6)', borderColor: hydraAnswers[i] === String(oi) ? 'rgba(16, 185, 129, 0.85)' : 'rgba(16, 185, 129, 0.3)' }}>
                      <input type="radio" name={`hydra-${i}`} value={oi} checked={hydraAnswers[i] === String(oi)}
                        disabled={submitted}
                        onChange={() => setHydraAnswers(a => { const n = [...a]; n[i] = String(oi); return n; })} />
                      <span className="text-emerald-300 font-bold">{String.fromCharCode(65 + oi)}.</span>
                      <span className="text-amber-50 italic">{opt}</span>
                    </label>
                  ))}
                </div>
              ) : isTF ? (
                <div className="grid grid-cols-2 gap-2">
                  {['true', 'false'].map(v => (
                    <button key={v} disabled={submitted}
                      onClick={() => setHydraAnswers(a => { const n = [...a]; n[i] = v; return n; })}
                      className="p-2 rounded font-bold border-2 italic disabled:opacity-50"
                      style={{
                        background: hydraAnswers[i] === v ? 'rgba(6, 78, 59, 0.7)' : 'rgba(6, 30, 22, 0.5)',
                        borderColor: hydraAnswers[i] === v ? 'rgba(16, 185, 129, 0.85)' : 'rgba(16, 185, 129, 0.4)',
                        color: '#a7f3d0',
                      }}>
                      {v === 'true' ? '⚖ Verily True ⚖' : '⚖ A Falsehood ⚖'}
                    </button>
                  ))}
                </div>
              ) : (
                <input type="text" value={hydraAnswers[i]} disabled={submitted}
                  onChange={(e) => setHydraAnswers(a => { const n = [...a]; n[i] = e.target.value; return n; })}
                  placeholder="Inscribe thy answer..."
                  className="w-full p-2 rounded border-2 italic text-amber-50"
                  style={{ background: 'rgba(6, 30, 22, 0.6)', borderColor: 'rgba(16, 185, 129, 0.4)' }} />
              )}
              {result && (
                <div className={`text-xs italic mt-2 ${result.correct ? 'text-emerald-300' : 'text-red-300'}`}>
                  {result.correct ? '✓ Severed' : '✗ Still snapping'}
                </div>
              )}
            </div>
          );
        })}
        <button onClick={submitHydra}
          disabled={submitted || hydraAnswers.some(a => !a)}
          className="w-full py-3 font-bold rounded text-amber-50 border-2 border-emerald-400 italic disabled:opacity-50"
          style={{ background: 'linear-gradient(to bottom, #10b981 0%, #064e3b 100%)', boxShadow: '0 0 18px rgba(16, 185, 129, 0.4)' }}>
          ⚔ Strike All Three ⚔
        </button>
      </div>
    );
  };

  return (
    <div>
      {renderHeader()}
      {renderFeedback()}
      {boss.id === 'hydra' ? renderHydra() : renderSingleQuestion()}
    </div>
  );
}


function ChallengeRenderer({ challenge, onAnswer, powerups, setPowerups, usedFiftyFifty, setUsedFiftyFifty, usedHint, setUsedHint, isBoss }) {
  const [revealed, setRevealed] = useState(false);
  const [hiddenOptions, setHiddenOptions] = useState([]);
  const [showHint, setShowHint] = useState(false);
  const [textAnswer, setTextAnswer] = useState('');
  const [labStep, setLabStep] = useState(0);
  const [grading, setGrading] = useState(false);

  useEffect(() => {
    setRevealed(false); setHiddenOptions([]); setShowHint(false); setTextAnswer(''); setLabStep(0); setGrading(false);
  }, [challenge]);

  const submitFillBlank = async () => {
    if (!textAnswer.trim() || grading) return;
    setGrading(true);
    const verdict = await gradeAnswer({
      question: challenge.question,
      expectedAnswer: challenge.correctAnswer,
      acceptedAnswers: challenge.acceptedAnswers,
      userAnswer: textAnswer,
    });
    setGrading(false);
    onAnswer(verdict.correct, challenge, {
      source: verdict.source,
      oracleFeedback: verdict.feedback,
      fallbackReason: verdict.fallbackReason,
    });
  };

  const useFiftyFifty = () => {
    if (powerups.fiftyfifty <= 0 || usedFiftyFifty || challenge._type !== 'quiz' || !challenge.options) return;
    const wrongIndices = challenge.options.map((_, i) => i).filter(i => i !== challenge.correctIndex);
    const toHide = wrongIndices.sort(() => 0.5 - Math.random()).slice(0, Math.floor(challenge.options.length / 2));
    setHiddenOptions(toHide); setUsedFiftyFifty(true);
    setPowerups(p => ({ ...p, fiftyfifty: p.fiftyfifty - 1 }));
  };

  const useHint = () => {
    if (powerups.hint <= 0 || usedHint || !challenge.hint) return;
    setShowHint(true); setUsedHint(true);
    setPowerups(p => ({ ...p, hint: p.hint - 1 }));
  };

  const renderPowerups = () => (
    <div className="flex gap-2 mb-4 flex-wrap">
      {challenge._type === 'quiz' && challenge.options && (
        <button onClick={useFiftyFifty} disabled={powerups.fiftyfifty <= 0 || usedFiftyFifty}
          className="px-3 py-1.5 rounded text-sm border-2 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 italic"
          style={{ background: 'rgba(41, 24, 12, 0.7)', borderColor: 'rgba(180, 83, 9, 0.5)', color: '#fcd34d' }}>
          ✨ Sage's Bisection ({powerups.fiftyfifty})
        </button>
      )}
      {challenge.hint && (
        <button onClick={useHint} disabled={powerups.hint <= 0 || usedHint}
          className="px-3 py-1.5 rounded text-sm border-2 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 italic"
          style={{ background: 'rgba(41, 24, 12, 0.7)', borderColor: 'rgba(180, 83, 9, 0.5)', color: '#fcd34d' }}>
          <HelpCircle className="w-3 h-3" /> Whisper of the Wise ({powerups.hint})
        </button>
      )}
    </div>
  );

  if (challenge._type === 'flashcard') {
    return (
      <div className="p-6 rounded min-h-[300px] relative" style={{
        background: 'linear-gradient(135deg, rgba(12, 24, 41, 0.9) 0%, rgba(6, 12, 20, 0.95) 100%)',
        border: '2px solid rgba(29, 78, 216, 0.5)', boxShadow: '0 0 25px rgba(59, 130, 246, 0.2), inset 0 0 20px rgba(0,0,0,0.5)',
      }}>
        <div className="text-xs text-sky-400 tracking-[0.3em] mb-2 italic">📜 SCROLL OF KNOWLEDGE {isBoss && '— DUNGEON LORD'}</div>
        {renderPowerups()}
        {showHint && challenge.hint && (
          <div className="mb-3 p-3 rounded text-sm italic" style={{ background: 'rgba(120, 53, 15, 0.4)', border: '1px solid rgba(245, 158, 11, 0.5)', color: '#fde047' }}>
            🪄 {challenge.hint}
          </div>
        )}
        <div className="text-xl mb-6 text-amber-50 italic">{challenge.front || challenge.term}</div>
        {!revealed ? (
          <button onClick={() => setRevealed(true)} className="px-6 py-3 font-bold rounded w-full text-amber-50 border-2 border-sky-400 italic"
            style={{ background: 'linear-gradient(to bottom, #0ea5e9 0%, #1e40af 100%)', boxShadow: '0 0 20px rgba(59, 130, 246, 0.4)' }}>
            ✨ Unveil the Wisdom ✨
          </button>
        ) : (
          <>
            <div className="p-4 mb-4 rounded text-amber-100 italic" style={{ background: 'rgba(12, 24, 41, 0.7)', border: '1px solid rgba(29, 78, 216, 0.4)' }}>
              {challenge.back || challenge.definition}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => onAnswer(false, challenge)} className="px-4 py-3 font-bold rounded border-2 border-red-400 text-red-200 italic" style={{ background: 'rgba(127, 29, 29, 0.5)' }}>I Faltered</button>
              <button onClick={() => onAnswer(true, challenge)} className="px-4 py-3 font-bold rounded border-2 border-emerald-400 text-emerald-200 italic" style={{ background: 'rgba(6, 78, 59, 0.5)' }}>I Knew the Truth</button>
            </div>
          </>
        )}
      </div>
    );
  }

  if (challenge._type === 'quiz') {
    const isMC = challenge.options && Array.isArray(challenge.options);
    const isTF = challenge.type === 'truefalse';
    const isFIB = challenge.type === 'fillblank' || challenge.type === 'fill_in_blank';
    return (
      <div className="p-6 rounded min-h-[300px] relative" style={{
        background: 'linear-gradient(135deg, rgba(31, 12, 41, 0.9) 0%, rgba(15, 6, 20, 0.95) 100%)',
        border: '2px solid rgba(126, 34, 206, 0.5)', boxShadow: '0 0 25px rgba(168, 85, 247, 0.2), inset 0 0 20px rgba(0,0,0,0.5)',
      }}>
        <div className="text-xs text-purple-400 tracking-[0.3em] mb-2 italic">🔮 RIDDLE OF WISDOM {isBoss && '— DUNGEON LORD'}</div>
        {renderPowerups()}
        {showHint && challenge.hint && (
          <div className="mb-3 p-3 rounded text-sm italic" style={{ background: 'rgba(120, 53, 15, 0.4)', border: '1px solid rgba(245, 158, 11, 0.5)', color: '#fde047' }}>🪄 {challenge.hint}</div>
        )}
        <div className="text-lg mb-6 text-amber-50 italic">{challenge.question}</div>
        {isMC && (
          <div className="space-y-2">
            {challenge.options.map((opt, i) => (
              <button key={i} disabled={hiddenOptions.includes(i)} onClick={() => onAnswer(i === challenge.correctIndex, challenge)}
                className="w-full text-left p-3 rounded border-2 transition disabled:opacity-30 disabled:cursor-not-allowed text-amber-50"
                style={hiddenOptions.includes(i) ? { background: 'rgba(31, 12, 41, 0.3)', borderColor: 'rgba(75, 75, 75, 0.5)', textDecoration: 'line-through' }
                : { background: 'rgba(31, 12, 41, 0.6)', borderColor: 'rgba(126, 34, 206, 0.5)' }}>
                <span className="text-purple-400 font-bold mr-2">{String.fromCharCode(65 + i)}.</span>{opt}
              </button>
            ))}
          </div>
        )}
        {isTF && (
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => onAnswer(challenge.correctAnswer === true, challenge)} className="p-4 rounded font-bold border-2 border-emerald-400 text-emerald-200 italic" style={{ background: 'rgba(6, 78, 59, 0.4)' }}>⚖ Verily True ⚖</button>
            <button onClick={() => onAnswer(challenge.correctAnswer === false, challenge)} className="p-4 rounded font-bold border-2 border-red-400 text-red-200 italic" style={{ background: 'rgba(127, 29, 29, 0.4)' }}>⚖ A Falsehood ⚖</button>
          </div>
        )}
        {isFIB && (
          <div className="space-y-3">
            <input type="text" value={textAnswer} onChange={(e) => setTextAnswer(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && textAnswer.trim() && !grading) submitFillBlank(); }}
              disabled={grading}
              placeholder="Inscribe thy answer..." className="w-full p-3 rounded border-2 focus:outline-none italic text-amber-50"
              style={{ background: 'rgba(31, 12, 41, 0.6)', borderColor: 'rgba(126, 34, 206, 0.5)' }} autoFocus />
            <button onClick={submitFillBlank}
              disabled={!textAnswer.trim() || grading} className="w-full py-3 font-bold rounded disabled:opacity-50 text-amber-50 border-2 border-purple-400 italic flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(to bottom, #a855f7 0%, #6b21a8 100%)', boxShadow: '0 0 20px rgba(168, 85, 247, 0.4)' }}>
              {grading ? (<><Loader2 className="w-4 h-4 animate-spin" /> The Oracle deliberates...</>) : 'Submit Thy Answer'}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (challenge._type === 'lab') {
    const steps = challenge.steps || [];
    const currentStep = steps[labStep];
    return (
      <div className="p-6 rounded min-h-[300px] relative" style={{
        background: 'linear-gradient(135deg, rgba(41, 12, 27, 0.9) 0%, rgba(20, 6, 13, 0.95) 100%)',
        border: '2px solid rgba(190, 24, 93, 0.5)', boxShadow: '0 0 25px rgba(244, 63, 94, 0.2), inset 0 0 20px rgba(0,0,0,0.5)',
      }}>
        <div className="text-xs text-rose-400 tracking-[0.3em] mb-2 italic">⚗️ TRIAL OF SKILL {isBoss && '— DUNGEON LORD'}</div>
        <h3 className="text-lg font-bold text-rose-300 mb-2 italic">{challenge.title}</h3>
        {challenge.scenario && <p className="text-sm text-amber-100/70 mb-4 italic">{challenge.scenario}</p>}
        <div className="text-xs text-amber-700 mb-2 italic">⚔ Stage {labStep + 1} of {steps.length} ⚔</div>
        {currentStep && (
          <div className="space-y-3">
            <div className="p-4 rounded text-amber-50 italic" style={{ background: 'rgba(41, 12, 27, 0.7)', border: '1px solid rgba(190, 24, 93, 0.4)' }}>
              {currentStep.prompt || currentStep.question}
            </div>
            {currentStep.options && (
              <div className="space-y-2">
                {currentStep.options.map((opt, i) => (
                  <button key={i} onClick={() => {
                    if (i === currentStep.correctIndex) {
                      if (labStep + 1 >= steps.length) onAnswer(true, challenge);
                      else setLabStep(labStep + 1);
                    } else onAnswer(false, challenge);
                  }} className="w-full text-left p-3 rounded border-2 text-amber-50" style={{ background: 'rgba(41, 12, 27, 0.6)', borderColor: 'rgba(190, 24, 93, 0.5)' }}>{opt}</button>
                ))}
              </div>
            )}
            {!currentStep.options && (
              <div className="space-y-2">
                <input type="text" value={textAnswer} onChange={(e) => setTextAnswer(e.target.value)}
                  placeholder="Inscribe thy answer..." className="w-full p-3 rounded border-2 focus:outline-none italic text-amber-50"
                  style={{ background: 'rgba(41, 12, 27, 0.6)', borderColor: 'rgba(190, 24, 93, 0.5)' }} />
                <button onClick={() => {
                  const accepted = currentStep.acceptedAnswers || [currentStep.answer];
                  const correct = accepted.some(a => a && a.toLowerCase().trim() === textAnswer.toLowerCase().trim());
                  if (correct) {
                    if (labStep + 1 >= steps.length) onAnswer(true, challenge);
                    else { setLabStep(labStep + 1); setTextAnswer(''); }
                  } else onAnswer(false, challenge);
                }} className="w-full py-3 font-bold rounded text-amber-50 border-2 border-rose-400 italic"
                  style={{ background: 'linear-gradient(to bottom, #f43f5e 0%, #9f1239 100%)', boxShadow: '0 0 20px rgba(244, 63, 94, 0.4)' }}>
                  Submit Thy Stage
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
  return null;
}

function FlashcardsMode({ courseSet, cards: cardsProp, tomeProgress, awardXP, updateTomeProgress, playerState, checkAchievement }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  // Pre-shuffled deck comes from App level (stable across re-renders / cloud
  // sync). Fall back to the raw flashcards if a parent hasn't provided one.
  const cards = (cardsProp && cardsProp.length) ? cardsProp : (courseSet.flashcards || []);
  const card = cards[index];

  const rate = (rating) => {
    awardXP(rating === 'easy' ? 5 : rating === 'medium' ? 10 : 15);
    setReviewed(r => r + 1);
    const newCount = (tomeProgress?.cardsReviewed || 0) + 1;
    updateTomeProgress({ cardsReviewed: newCount });
    const totalCardsAcrossLib = playerState.library.reduce((s, t) => s + (t.progress?.cardsReviewed || 0), 0) + 1;
    if (totalCardsAcrossLib >= 50) checkAchievement('card_shark');
    if (totalCardsAcrossLib >= 200) checkAchievement('card_master');
    setFlipped(false);
    setIndex((index + 1) % cards.length);
  };

  if (!card) return <div className="text-center py-12 text-amber-600 italic">No scrolls in this tome.</div>;

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div className="flex justify-between items-center text-sm text-amber-600 italic">
        <span>📜 Scroll {index + 1} of {cards.length}</span>
        <span>Studied this session: {reviewed}</span>
      </div>
      <div onClick={() => setFlipped(!flipped)} className="rounded p-8 min-h-[300px] flex items-center justify-center cursor-pointer transition relative" style={{
        background: 'linear-gradient(135deg, rgba(12, 24, 41, 0.85) 0%, rgba(6, 12, 20, 0.95) 100%)',
        border: '3px double rgba(29, 78, 216, 0.6)', boxShadow: '0 0 30px rgba(59, 130, 246, 0.25), inset 0 0 25px rgba(0,0,0,0.5)',
      }}>
        <div className="text-center">
          <div className="text-xs text-sky-400 tracking-[0.3em] mb-3 italic">{flipped ? '✦ THE ANSWER ✦' : '✦ THE QUESTION ✦'}</div>
          <div className="text-xl text-amber-50 italic leading-relaxed">{flipped ? (card.back || card.definition) : (card.front || card.term)}</div>
          {!flipped && <div className="text-xs text-amber-700 mt-4 italic">~ Touch the scroll to reveal ~</div>}
        </div>
      </div>
      {flipped && (
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => rate('hard')} className="py-3 rounded font-bold border-2 border-red-400 text-red-200 italic" style={{ background: 'rgba(127, 29, 29, 0.5)' }}>⚔ Difficult ⚔</button>
          <button onClick={() => rate('medium')} className="py-3 rounded font-bold border-2 border-amber-400 text-amber-200 italic" style={{ background: 'rgba(120, 53, 15, 0.5)' }}>⚔ Familiar ⚔</button>
          <button onClick={() => rate('easy')} className="py-3 rounded font-bold border-2 border-emerald-400 text-emerald-200 italic" style={{ background: 'rgba(6, 78, 59, 0.5)' }}>⚔ Mastered ⚔</button>
        </div>
      )}
      {!flipped && (
        <div className="flex gap-2">
          <button onClick={() => { setIndex((index - 1 + cards.length) % cards.length); setFlipped(false); }} className="flex-1 py-2 rounded border-2 border-amber-700 text-amber-200 italic" style={{ background: 'rgba(41, 24, 12, 0.7)' }}>← Prior</button>
          <button onClick={() => { setIndex((index + 1) % cards.length); setFlipped(false); }} className="flex-1 py-2 rounded border-2 border-amber-700 text-amber-200 italic" style={{ background: 'rgba(41, 24, 12, 0.7)' }}>Skip →</button>
        </div>
      )}
    </div>
  );
}

function QuizMode({ courseSet, questions: questionsProp, tomeProgress, awardXP, recordAnswer, checkAchievement, playerState, updateTomeProgress }) {
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(null);
  const [textAnswer, setTextAnswer] = useState('');
  const [streak, setStreak] = useState(0);
  const [grading, setGrading] = useState(false);
  // Pre-shuffled deck comes from App level (stable across re-renders / cloud
  // sync). Fall back to the raw quiz array if a parent hasn't provided one.
  const questions = (questionsProp && questionsProp.length) ? questionsProp : (courseSet.quiz || []);
  const q = questions[index];

  const handleAnswer = (correct, extra = {}) => {
    setAnswered({ correct, ...extra });
    recordAnswer(correct, q);
    const newQuizCount = (tomeProgress?.quizAnswered || 0) + 1;
    updateTomeProgress({ quizAnswered: newQuizCount });
    const totalQuizAcrossLib = playerState.library.reduce((s, t) => s + (t.progress?.quizAnswered || 0), 0) + 1;
    if (totalQuizAcrossLib >= 100) checkAchievement('quiz_warrior');
    if (correct) {
      checkAchievement('first_quiz');
      awardXP(10 + streak);
      setStreak(s => {
        const ns = s + 1;
        if (ns >= 10) checkAchievement('streak_10');
        if (ns >= 25) checkAchievement('perfectionist');
        if (ns >= 50) checkAchievement('streak_50');
        if (ns >= 100) checkAchievement('streak_100');
        return ns;
      });
    } else setStreak(0);
  };

  const submitFillBlankWithOracle = async () => {
    if (!textAnswer.trim() || grading) return;
    setGrading(true);
    const verdict = await gradeAnswer({
      question: q.question,
      expectedAnswer: q.correctAnswer,
      acceptedAnswers: q.acceptedAnswers,
      userAnswer: textAnswer,
    });
    setGrading(false);
    handleAnswer(verdict.correct, {
      oracleFeedback: verdict.feedback,
      source: verdict.source,
      fallbackReason: verdict.fallbackReason,
    });
  };

  // Override the verdict from the Oracle. Adjusts streak and counters since
  // we already recorded the original verdict.
  const overrideVerdict = (newCorrect) => {
    setAnswered(prev => {
      if (!prev) return prev;
      if (prev.correct === newCorrect) return prev;
      // Re-record so totalCorrect / streak stay accurate.
      recordAnswer(newCorrect, q);
      if (newCorrect) {
        // Going wrong → correct: refund some XP, restart streak at 1.
        awardXP(10);
        setStreak(1);
      } else {
        // correct → wrong: zero streak.
        setStreak(0);
      }
      return { ...prev, correct: newCorrect, overridden: true };
    });
  };

  const handleSkip = () => {
    setAnswered({ correct: false, skipped: true });
    recordAnswer(false, q);
    const newQuizCount = (tomeProgress?.quizAnswered || 0) + 1;
    updateTomeProgress({ quizAnswered: newQuizCount });
    setStreak(0);
  };

  const next = () => { setAnswered(null); setTextAnswer(''); setIndex((index + 1) % questions.length); };
  if (!q) return <div className="text-center py-12 text-amber-600 italic">No riddles in this tome.</div>;

  const isMC = q.options && Array.isArray(q.options);
  const isTF = q.type === 'truefalse';
  const isFIB = q.type === 'fillblank' || q.type === 'fill_in_blank';

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex justify-between items-center text-sm text-amber-600 italic">
        <span>🔮 Riddle {index + 1} of {questions.length}</span>
        <span className="flex items-center gap-1"><Flame className="w-4 h-4 text-orange-400" /> Streak: {streak}</span>
      </div>
      <div className="rounded p-6 relative" style={{
        background: 'linear-gradient(135deg, rgba(31, 12, 41, 0.85) 0%, rgba(15, 6, 20, 0.95) 100%)',
        border: '3px double rgba(126, 34, 206, 0.6)', boxShadow: '0 0 30px rgba(168, 85, 247, 0.25), inset 0 0 25px rgba(0,0,0,0.5)',
      }}>
        <div className="text-lg text-amber-50 mb-6 italic">{q.question}</div>
        {!answered && isMC && (
          <div className="space-y-2">
            {q.options.map((opt, i) => (
              <button key={i} onClick={() => handleAnswer(i === q.correctIndex)} className="w-full text-left p-3 rounded border-2 transition text-amber-50"
                style={{ background: 'rgba(31, 12, 41, 0.6)', borderColor: 'rgba(126, 34, 206, 0.5)' }}>
                <span className="text-purple-400 font-bold mr-2">{String.fromCharCode(65 + i)}.</span>{opt}
              </button>
            ))}
          </div>
        )}
        {!answered && isTF && (
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => handleAnswer(q.correctAnswer === true)} className="p-4 rounded font-bold border-2 border-emerald-400 text-emerald-200 italic" style={{ background: 'rgba(6, 78, 59, 0.4)' }}>⚖ Verily True ⚖</button>
            <button onClick={() => handleAnswer(q.correctAnswer === false)} className="p-4 rounded font-bold border-2 border-red-400 text-red-200 italic" style={{ background: 'rgba(127, 29, 29, 0.4)' }}>⚖ A Falsehood ⚖</button>
          </div>
        )}
        {!answered && isFIB && (
          <div className="space-y-3">
            <input type="text" value={textAnswer} onChange={(e) => setTextAnswer(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && textAnswer.trim() && !grading) submitFillBlankWithOracle(); }}
              disabled={grading}
              placeholder="Inscribe thy answer..." className="w-full p-3 rounded border-2 focus:outline-none italic text-amber-50"
              style={{ background: 'rgba(31, 12, 41, 0.6)', borderColor: 'rgba(126, 34, 206, 0.5)' }} autoFocus />
            <button onClick={submitFillBlankWithOracle}
              disabled={!textAnswer.trim() || grading} className="w-full py-3 font-bold rounded disabled:opacity-50 text-amber-50 border-2 border-purple-400 italic flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(to bottom, #a855f7 0%, #6b21a8 100%)', boxShadow: '0 0 20px rgba(168, 85, 247, 0.4)' }}>
              {grading ? (<><Loader2 className="w-4 h-4 animate-spin" /> The Oracle deliberates...</>) : 'Submit Thy Answer'}
            </button>
          </div>
        )}
        {answered && (
          <div className="space-y-3">
            <div className="p-4 rounded border-2 space-y-2" style={{
              background: answered.correct ? 'rgba(6, 78, 59, 0.5)' : 'rgba(127, 29, 29, 0.5)',
              borderColor: answered.correct ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)',
            }}>
              <div className="font-bold flex items-center gap-2 italic flex-wrap">
                {answered.correct ? <Check className="w-5 h-5 text-emerald-400" /> : <X className="w-5 h-5 text-red-400" />}
                <span>{answered.correct ? '⚔ Strike True! ⚔' : (answered.skipped ? '↳ Skipped — Added to Tome of Failures' : '✗ The Blow Falters')}</span>
                {answered.overridden && (
                  <span className="text-xs px-2 py-0.5 rounded border border-amber-400/60 text-amber-200 italic">overridden</span>
                )}
                {answered.source === 'oracle' && (
                  <span className="text-xs px-2 py-0.5 rounded border border-purple-400/60 text-purple-200 italic flex items-center gap-1">
                    <Wand2 className="w-3 h-3" /> Graded by the Oracle
                  </span>
                )}
                {answered.source === 'fallback' && (
                  <span className="text-xs px-2 py-0.5 rounded border border-amber-700/60 text-amber-300 italic" title={answered.fallbackReason || ''}>
                    Tome match (Oracle silent)
                  </span>
                )}
              </div>
              {answered.oracleFeedback && (
                <p className="text-sm text-amber-100/90 italic leading-relaxed">{answered.oracleFeedback}</p>
              )}
              {q.explanation && <p className="text-sm text-amber-100/70 italic"><span className="text-purple-300">From the tome:</span> {q.explanation}</p>}
              {!answered.correct && q.correctAnswer !== undefined && (
                <p className="text-sm text-amber-100/70 italic">The truth was: <span className="text-emerald-300">{isMC ? q.options[q.correctIndex] : isTF ? String(q.correctAnswer) : q.correctAnswer}</span></p>
              )}
            </div>
            {isFIB && (answered.source === 'oracle' || answered.source === 'fallback') && (
              <div className="flex gap-2 flex-wrap">
                {!answered.correct && (
                  <button onClick={() => overrideVerdict(true)} className="flex-1 py-2 rounded text-xs italic border-2 border-emerald-500 text-emerald-200 flex items-center justify-center gap-1" style={{ background: 'rgba(6, 78, 59, 0.4)' }}>
                    <Check className="w-3 h-3" /> Mark as correct
                  </button>
                )}
                {answered.correct && (
                  <button onClick={() => overrideVerdict(false)} className="flex-1 py-2 rounded text-xs italic border-2 border-red-500 text-red-200 flex items-center justify-center gap-1" style={{ background: 'rgba(127, 29, 29, 0.4)' }}>
                    <X className="w-3 h-3" /> Mark as wrong
                  </button>
                )}
              </div>
            )}
            <button onClick={next} className="w-full py-3 font-bold rounded text-amber-50 border-2 border-purple-400 italic" style={{ background: 'linear-gradient(to bottom, #a855f7 0%, #6b21a8 100%)', boxShadow: '0 0 20px rgba(168, 85, 247, 0.4)' }}>Next Riddle →</button>
          </div>
        )}
        {!answered && (
          <div className="mt-3 flex justify-end">
            <button
              onClick={handleSkip}
              className="px-3 py-1.5 rounded text-xs border-2 border-red-800 text-red-300 hover:bg-red-900/30 italic flex items-center gap-1"
              style={{ background: 'rgba(41, 12, 12, 0.6)' }}
              title="Skip — counts as wrong, breaks streak"
            >
              <ChevronRight className="w-3 h-3" /> Skip Riddle
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function LabMode({ courseSet, tomeProgress, awardXP, updateTomeProgress, playerState, checkAchievement, recordAnswer }) {
  const [selectedLab, setSelectedLab] = useState(null);
  const [step, setStep] = useState(0);
  const [textAnswer, setTextAnswer] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [grading, setGrading] = useState(false);
  const labs = courseSet.labs || [];

  if (!selectedLab) {
    return (
      <div className="space-y-3 max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold text-rose-300 mb-4 italic">⚗️ Choose Thy Trial ⚗️</h2>
        {labs.length === 0 && <div className="text-amber-600 italic">No trials in this tome.</div>}
        {labs.map((lab, i) => (
          <button key={i} onClick={() => { setSelectedLab(lab); setStep(0); setFeedback(null); }} className="w-full text-left p-4 rounded transition relative" style={{
            background: 'linear-gradient(135deg, rgba(41, 12, 27, 0.85) 0%, rgba(20, 6, 13, 0.95) 100%)',
            border: '2px solid rgba(190, 24, 93, 0.5)', boxShadow: '0 0 15px rgba(244, 63, 94, 0.15)',
          }}>
            <div className="font-bold text-rose-300 text-lg italic">{lab.title}</div>
            {lab.scenario && <div className="text-sm text-amber-100/70 mt-1 italic">{lab.scenario}</div>}
            <div className="text-xs text-amber-700 mt-2 italic">⚔ {(lab.steps || lab.stages)?.length || 0} stages ⚔</div>
          </button>
        ))}
      </div>
    );
  }

  // Tolerate AI-generated tomes that use `stages` instead of `steps`.
  const steps = selectedLab.steps || selectedLab.stages || [];
  const currentStep = steps[step];

  // Multiple-choice steps and Oracle-graded text steps both flow through here
  // once a verdict exists. `extra` carries Oracle feedback/source for display.
  const submitStep = (correct, extra = {}) => {
    const stepItem = {
      id: `${selectedLab.id}_step_${step}`,
      question: currentStep?.prompt || currentStep?.question,
      explanation: currentStep?.explanation,
      _type: 'lab',
    };
    if (recordAnswer) recordAnswer(correct, stepItem);
    setFeedback({ correct, explanation: currentStep?.explanation, ...extra });
    if (correct && !extra.awaitContinue) {
      awardXP(15);
      setTimeout(() => {
        if (step + 1 >= steps.length) {
          const newCount = (tomeProgress?.labsCompleted || 0) + 1;
          updateTomeProgress({ labsCompleted: newCount });
          checkAchievement('first_lab');
          const totalLabsAcrossLib = playerState.library.reduce((s, t) => s + (t.progress?.labsCompleted || 0), 0) + 1;
          if (totalLabsAcrossLib >= 10) checkAchievement('lab_master');
          if (totalLabsAcrossLib >= 25) checkAchievement('lab_grandmaster');
          setSelectedLab(null);
          setFeedback(null);
        } else {
          setStep(step + 1); setTextAnswer(''); setFeedback(null);
        }
      }, 1500);
    } else if (!extra.awaitContinue) {
      setTimeout(() => setFeedback(null), 2000);
    }
  };

  // Continue manually after Oracle-graded feedback (or override). Awards XP if
  // the final verdict was correct, then advances or finishes the trial.
  const continueAfterGrade = () => {
    const correct = !!feedback?.correct;
    if (correct) {
      awardXP(15);
      if (step + 1 >= steps.length) {
        const newCount = (tomeProgress?.labsCompleted || 0) + 1;
        updateTomeProgress({ labsCompleted: newCount });
        checkAchievement('first_lab');
        const totalLabsAcrossLib = playerState.library.reduce((s, t) => s + (t.progress?.labsCompleted || 0), 0) + 1;
        if (totalLabsAcrossLib >= 10) checkAchievement('lab_master');
        if (totalLabsAcrossLib >= 25) checkAchievement('lab_grandmaster');
        setSelectedLab(null);
      } else {
        setStep(step + 1);
        setTextAnswer('');
      }
    }
    setFeedback(null);
  };

  const submitTextWithOracle = async () => {
    if (!textAnswer.trim() || grading) return;
    setGrading(true);
    const verdict = await gradeAnswer({
      question: currentStep?.prompt || currentStep?.question,
      expectedAnswer: currentStep?.answer,
      acceptedAnswers: currentStep?.acceptedAnswers,
      userAnswer: textAnswer,
    });
    setGrading(false);
    submitStep(verdict.correct, {
      awaitContinue: true,
      oracleFeedback: verdict.feedback,
      source: verdict.source,
      fallbackReason: verdict.fallbackReason,
    });
  };

  // Override the verdict (user disagrees with the Oracle).
  const overrideVerdict = (newCorrect) => {
    setFeedback(prev => prev ? { ...prev, correct: newCorrect, overridden: true } : prev);
  };

  const skipStep = () => {
    const stepItem = {
      id: `${selectedLab.id}_step_${step}`,
      question: currentStep?.prompt || currentStep?.question,
      explanation: currentStep?.explanation,
      _type: 'lab',
    };
    if (recordAnswer) recordAnswer(false, stepItem);
    setFeedback({ correct: false, skipped: true, explanation: currentStep?.explanation });
    setTimeout(() => {
      if (step + 1 >= steps.length) {
        setSelectedLab(null);
        setFeedback(null);
      } else {
        setStep(step + 1);
        setTextAnswer('');
        setFeedback(null);
      }
    }, 1500);
  };

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <button onClick={() => setSelectedLab(null)} className="flex items-center gap-2 text-amber-600 hover:text-amber-400 italic">
        <ArrowLeft className="w-4 h-4" /> Back to Trials
      </button>
      <div className="rounded p-6 relative" style={{
        background: 'linear-gradient(135deg, rgba(41, 12, 27, 0.85) 0%, rgba(20, 6, 13, 0.95) 100%)',
        border: '3px double rgba(190, 24, 93, 0.6)', boxShadow: '0 0 25px rgba(244, 63, 94, 0.2)',
      }}>
        <h3 className="text-xl font-bold text-rose-300 mb-2 italic">{selectedLab.title}</h3>
        {selectedLab.scenario && <p className="text-sm text-amber-100/70 mb-4 italic">{selectedLab.scenario}</p>}
        <div className="text-xs text-amber-700 mb-3 italic">⚔ Stage {step + 1} of {steps.length} ⚔</div>
        {currentStep && !feedback && (
          <div className="space-y-3">
            <div className="p-4 rounded text-amber-50 italic" style={{ background: 'rgba(41, 12, 27, 0.7)', border: '1px solid rgba(190, 24, 93, 0.4)' }}>
              {currentStep.prompt || currentStep.question}
            </div>
            {currentStep.options ? (
              <div className="space-y-2">
                {currentStep.options.map((opt, i) => (
                  <button key={i} onClick={() => submitStep(i === currentStep.correctIndex)} className="w-full text-left p-3 rounded border-2 text-amber-50" style={{ background: 'rgba(41, 12, 27, 0.6)', borderColor: 'rgba(190, 24, 93, 0.5)' }}>{opt}</button>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                <input type="text" value={textAnswer} onChange={(e) => setTextAnswer(e.target.value)}
                  placeholder="Inscribe thy answer..." className="w-full p-3 rounded border-2 focus:outline-none italic text-amber-50"
                  disabled={grading}
                  onKeyDown={(e) => { if (e.key === 'Enter' && textAnswer.trim() && !grading) submitTextWithOracle(); }}
                  style={{ background: 'rgba(41, 12, 27, 0.6)', borderColor: 'rgba(190, 24, 93, 0.5)' }} />
                <button onClick={submitTextWithOracle} disabled={!textAnswer.trim() || grading} className="w-full py-3 font-bold rounded disabled:opacity-50 text-amber-50 border-2 border-rose-400 italic flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(to bottom, #f43f5e 0%, #9f1239 100%)', boxShadow: '0 0 20px rgba(244, 63, 94, 0.4)' }}>
                  {grading ? (<><Loader2 className="w-4 h-4 animate-spin" /> The Oracle deliberates...</>) : 'Submit Stage'}
                </button>
              </div>
            )}
            <div className="pt-2 mt-2 border-t border-amber-900/40 flex justify-end">
              <button
                onClick={skipStep}
                className="px-3 py-1.5 rounded text-xs border-2 border-red-800 text-red-300 hover:bg-red-900/30 italic flex items-center gap-1"
                style={{ background: 'rgba(41, 12, 12, 0.6)' }}
                title="Skip this stage — counts as failed, abandons the trial"
              >
                <ChevronRight className="w-3 h-3" /> Skip Stage
              </button>
            </div>
          </div>
        )}
        {feedback && (
          <div className="p-4 rounded border-2 space-y-3" style={{
            background: feedback.correct ? 'rgba(6, 78, 59, 0.5)' : 'rgba(127, 29, 29, 0.5)',
            borderColor: feedback.correct ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)',
          }}>
            <div className="font-bold flex items-center gap-2 italic flex-wrap">
              {feedback.correct ? <Check className="w-5 h-5 text-emerald-400" /> : <X className="w-5 h-5 text-red-400" />}
              <span>{feedback.correct ? '⚔ Stage Conquered! ⚔' : (feedback.skipped ? '↳ Skipped — Trial Abandoned' : '✗ Try Again, Brave One')}</span>
              {feedback.overridden && (
                <span className="text-xs px-2 py-0.5 rounded border border-amber-400/60 text-amber-200 italic">overridden</span>
              )}
              {feedback.source === 'oracle' && (
                <span className="text-xs px-2 py-0.5 rounded border border-purple-400/60 text-purple-200 italic flex items-center gap-1">
                  <Wand2 className="w-3 h-3" /> Graded by the Oracle
                </span>
              )}
              {feedback.source === 'fallback' && (
                <span className="text-xs px-2 py-0.5 rounded border border-amber-700/60 text-amber-300 italic" title={feedback.fallbackReason || ''}>
                  Tome match (Oracle silent)
                </span>
              )}
            </div>
            {feedback.oracleFeedback && (
              <p className="text-sm text-amber-100/90 italic leading-relaxed">{feedback.oracleFeedback}</p>
            )}
            {feedback.explanation && (
              <p className="text-sm text-amber-100/70 italic"><span className="text-purple-300">From the tome:</span> {feedback.explanation}</p>
            )}
            {feedback.awaitContinue && (
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-amber-900/40 flex-wrap">
                <div className="flex gap-2">
                  {!feedback.correct && (
                    <button onClick={() => overrideVerdict(true)} className="px-3 py-1.5 rounded text-xs italic border-2 border-emerald-500 text-emerald-200 flex items-center gap-1" style={{ background: 'rgba(6, 78, 59, 0.4)' }}>
                      <Check className="w-3 h-3" /> Mark as correct
                    </button>
                  )}
                  {feedback.correct && (
                    <button onClick={() => overrideVerdict(false)} className="px-3 py-1.5 rounded text-xs italic border-2 border-red-500 text-red-200 flex items-center gap-1" style={{ background: 'rgba(127, 29, 29, 0.4)' }}>
                      <X className="w-3 h-3" /> Mark as wrong
                    </button>
                  )}
                </div>
                <button onClick={continueAfterGrade} className="px-4 py-2 rounded text-sm font-bold italic border-2 border-amber-300 text-amber-950 flex items-center gap-2"
                  style={{ background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)', boxShadow: '0 0 12px rgba(245, 158, 11, 0.5)' }}>
                  Continue <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ChatMode({ courseSet, tomeProgress, updateTomeProgress, checkAchievement }) {
  // Chat history lives in tome progress so it persists across navigation, reloads, and journal restores
  const messages = tomeProgress?.chatHistory || [];
  const setMessages = (updater) => {
    updateTomeProgress({
      chatHistory: typeof updater === 'function' ? updater(messages) : updater,
    });
  };

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('oracle'); // 'oracle' or 'search'
  const [expandedSources, setExpandedSources] = useState({});
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  // Build searchable index from the tome
  const searchIndex = useMemo(() => {
    const items = [];
    const kb = courseSet.knowledgeBase || courseSet.knowledge_base || '';
    if (kb) {
      // Split knowledge base into chunks (paragraphs or by domain markers)
      const chunks = kb.split(/\n\n+|=== /).filter(c => c.trim().length > 50);
      chunks.forEach((chunk, i) => {
        items.push({
          id: `kb_${i}`,
          type: 'knowledgeBase',
          typeLabel: 'Knowledge Base',
          icon: '📖',
          text: chunk.trim(),
          searchText: chunk.toLowerCase(),
        });
      });
    }
    (courseSet.flashcards || []).forEach(card => {
      const text = `${card.front || card.term || ''}: ${card.back || card.definition || ''}`;
      items.push({
        id: card.id,
        type: 'flashcard',
        typeLabel: 'Scroll',
        icon: '📜',
        text,
        searchText: text.toLowerCase(),
        front: card.front || card.term,
        back: card.back || card.definition,
      });
    });
    (courseSet.quiz || []).forEach(q => {
      const optionsText = (q.options || []).join(' ');
      const correctAnswer = q.options ? q.options[q.correctIndex] : (q.correctAnswer ?? (q.acceptedAnswers || []).join(' / '));
      const text = `${q.question || ''} ${optionsText} ${q.explanation || ''}`;
      items.push({
        id: q.id,
        type: 'quiz',
        typeLabel: 'Riddle',
        icon: '🔮',
        text,
        searchText: text.toLowerCase(),
        question: q.question,
        correctAnswer,
        explanation: q.explanation,
      });
    });
    (courseSet.labs || []).forEach(lab => {
      const stepsText = (lab.steps || lab.stages || []).map(s => `${s.prompt || s.question || ''} ${s.explanation || ''}`).join(' ');
      const text = `${lab.title || ''} ${lab.scenario || ''} ${stepsText}`;
      items.push({
        id: lab.id,
        type: 'lab',
        typeLabel: 'Trial',
        icon: '⚗️',
        text,
        searchText: text.toLowerCase(),
        title: lab.title,
        scenario: lab.scenario,
      });
    });
    return items;
  }, [courseSet]);

  // Stem a word — strip common English suffixes for better matching
  const stem = (word) => {
    let w = word.toLowerCase();
    if (w.length <= 3) return w;
    // Common suffix removal in order
    const suffixes = ['ation', 'ations', 'tions', 'sions', 'ments', 'ness', 'ities', 'iest', 'edly', 'ingly', 'ically', 'ical', 'ization', 'izing', 'izes', 'ized', 'ing', 'ies', 'ied', 'ier', 'est', 'ers', 'ed', 'es', 's', 'ly', 'er'];
    for (const suf of suffixes) {
      if (w.length - suf.length >= 3 && w.endsWith(suf)) {
        return w.slice(0, w.length - suf.length);
      }
    }
    return w;
  };

  // Search the tome with stem-based scoring
  const searchTome = (query, limit = 5) => {
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'and', 'or', 'but', 'if', 'then', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from', 'as', 'about', 'what', 'how', 'why', 'when', 'where', 'who', 'which', 'this', 'that', 'these', 'those', 'do', 'does', 'did', 'have', 'has', 'had', 'can', 'could', 'should', 'would', 'will', 'shall', 'may', 'might', 'must', 'i', 'you', 'me', 'my', 'your', 'we', 'us', 'our', 'they', 'them', 'their', 'it', 'its', 'so', 'too']);
    const queryWords = query.toLowerCase().split(/\W+/).filter(w => w.length > 1 && !stopWords.has(w));
    if (queryWords.length === 0) return [];
    const queryStems = queryWords.map(stem);

    const scored = searchIndex.map(item => {
      let score = 0;
      const itemWords = item.searchText.split(/\W+/).filter(w => w.length > 1);
      const itemStems = new Set(itemWords.map(stem));

      queryStems.forEach((qs, qi) => {
        // Exact stem match (best)
        if (itemStems.has(qs)) {
          score += 10;
        }
        // Substring match in text (good for technical jargon, hyphenated terms)
        else if (item.searchText.includes(queryWords[qi])) {
          score += 7;
        }
        // Partial stem match (e.g., "encrypt" appears in "encryption")
        else {
          for (const its of itemStems) {
            if (its.length >= 4 && qs.length >= 4 && (its.startsWith(qs) || qs.startsWith(its))) {
              score += 5;
              break;
            }
          }
        }
      });
      // Bonus: phrase match
      if (queryWords.length >= 2 && item.searchText.includes(queryWords.join(' '))) {
        score += 15;
      }
      return { ...item, score };
    });

    return scored
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  };

  // Build a search-result message (no AI)
  const renderSearchResults = (query) => {
    const results = searchTome(query, 6);
    if (results.length === 0) {
      return {
        role: 'search',
        content: 'The tome holds no clear answer to that question, brave scholar. Try rephrasing, or ask about a specific term, concept, or domain covered in this tome.',
        sources: [],
      };
    }
    const intro = `I have searched the tome and found ${results.length} relevant passage${results.length === 1 ? '' : 's'} that may illuminate your question:`;
    return { role: 'search', content: intro, sources: results };
  };

  const buildSystemPrompt = (relevantSources) => {
    const tomeTitle = courseSet.metadata.title;
    const sourceText = relevantSources.length > 0
      ? `\n\n=== RELEVANT TOME EXCERPTS (use these as your primary source of truth) ===\n${relevantSources.map((s, i) => `[${i + 1}] (${s.typeLabel}) ${s.text}`).join('\n\n')}\n=== END OF TOME EXCERPTS ===`
      : '';
    const fullKb = courseSet.knowledgeBase || courseSet.knowledge_base || '';

    return `You are the Oracle, a wise and ancient sage who guides scholars through the tome titled "${tomeTitle}". Speak with the warmth of a beloved mentor and the gravitas of one who has studied these mysteries for an age. You may use light fantasy flourishes ("brave scholar", "young one") but stay rigorous and clear above all.

PRIMARY DIRECTIVE: Use the tome as your source of truth. The relevant excerpts below have been retrieved for this question — base your answer on them whenever possible. When you cite information from the tome, reference it like [1] or [2] matching the excerpt numbers below. If the tome does not cover the question, you may draw on broader knowledge but say so explicitly (e.g., "This goes beyond the current tome, but...").
${sourceText}

=== FULL KNOWLEDGE BASE (background context) ===
${fullKb}
=== END KNOWLEDGE BASE ===`;
  };

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: 'user', content: input };
    const newMessages = [...messages, userMsg];
    const query = input;
    setInput('');

    // Update chat history + oracle counter together to avoid races
    const newOracleCount = (tomeProgress?.oracleMessages || 0) + 1;
    updateTomeProgress({
      chatHistory: newMessages,
      oracleMessages: newOracleCount,
    });
    if (newOracleCount >= 25 && checkAchievement) checkAchievement('oracle_friend');

    // Search-only mode: no AI call
    if (mode === 'search') {
      const result = renderSearchResults(query);
      updateTomeProgress({ chatHistory: [...newMessages, result] });
      return;
    }

    // Oracle mode: search tome, send to AI, fall back to search on failure
    setLoading(true);
    const relevantSources = searchTome(query, 5);

    let fallbackReason = null;
    try {
      const response = await fetch("https://dungeon-scholar-oracle.patrick-home-lab.workers.dev", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: buildSystemPrompt(relevantSources),
          messages: newMessages.filter(m => m.role === 'user' || m.role === 'assistant'),
        })
      });
      if (!response.ok) {
        if (response.status === 429) fallbackReason = 'The Oracle\'s voice is silent — too many petitions today. Falling back to Tome Search.';
        else if (response.status === 401 || response.status === 403) fallbackReason = 'The Oracle cannot be reached at present. Falling back to Tome Search.';
        else fallbackReason = 'The Oracle stumbles. Falling back to Tome Search.';

        try {
          const errBody = await response.text();
          const lower = errBody.toLowerCase();
          if (lower.includes('rate') || lower.includes('quota') || lower.includes('limit') || lower.includes('exceeded')) {
            fallbackReason = 'The Oracle\'s voice is silent — quota or rate limit reached. Falling back to Tome Search.';
          }
        } catch {}
      } else {
        const data = await response.json();
        const text = data.content?.filter(c => c.type === 'text').map(c => c.text).join('\n') || '';
        const lower = text.toLowerCase();
        if (data.error || lower.includes('rate limit') || lower.includes('quota')) {
          fallbackReason = 'The Oracle\'s voice is silent — quota or rate limit reached. Falling back to Tome Search.';
        } else if (!text) {
          fallbackReason = 'The Oracle was silent. Falling back to Tome Search.';
        } else {
          updateTomeProgress({ chatHistory: [...newMessages, { role: 'assistant', content: text, sources: relevantSources }] });
          setLoading(false);
          return;
        }
      }
    } catch (err) {
      fallbackReason = 'The mystic connection has faltered. Falling back to Tome Search.';
    }

    // Fallback path
    const fallback = renderSearchResults(query);
    updateTomeProgress({
      chatHistory: [...newMessages,
        { role: 'system_notice', content: fallbackReason },
        fallback,
      ],
    });
    setLoading(false);
  };

  const clearChat = () => {
    updateTomeProgress({ chatHistory: [] });
    setShowClearConfirm(false);
  };

  const toggleSource = (msgIdx, srcIdx) => {
    const key = `${msgIdx}-${srcIdx}`;
    setExpandedSources(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="flex flex-col h-[70vh] max-w-3xl mx-auto">
      {/* Mode toggle */}
      <div className="flex items-center justify-between mb-2 p-3 rounded gap-3 flex-wrap" style={{
        background: 'linear-gradient(135deg, rgba(41, 24, 12, 0.8) 0%, rgba(20, 12, 6, 0.9) 100%)',
        border: '2px solid rgba(180, 83, 9, 0.5)',
      }}>
        <div className="flex flex-col">
          <div className="text-xs text-amber-700 italic tracking-wider">⚜ MODE OF INQUIRY ⚜</div>
          <div className="text-[10px] italic mt-0.5" style={{ color: mode === 'oracle' ? '#fcd34d' : '#86efac' }}>
            {mode === 'oracle' ? '🔮 AI-powered' : '📜 Local tome search'}
          </div>
        </div>
        <div className="flex gap-2 items-center">
          {messages.length > 0 && (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="px-2 py-1.5 rounded text-xs italic border-2 border-red-800 text-red-300 hover:bg-red-900/30 flex items-center gap-1"
              style={{ background: 'rgba(41, 12, 12, 0.6)' }}
              title="Clear chat history"
            >
              <Trash2 className="w-3 h-3" /> Clear
            </button>
          )}
          <div className="flex gap-1 p-1 rounded" style={{ background: 'rgba(10, 6, 4, 0.7)', border: '1px solid rgba(120, 53, 15, 0.4)' }}>
            <button
              onClick={() => setMode('oracle')}
              className="px-3 py-1.5 rounded text-xs font-bold italic transition flex items-center gap-1"
              style={mode === 'oracle' ? {
                background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
                color: '#451a03',
                boxShadow: '0 0 10px rgba(245, 158, 11, 0.5)',
              } : { background: 'transparent', color: '#fcd34d' }}
            >
              <Wand2 className="w-3 h-3" /> The Oracle
            </button>
            <button
              onClick={() => setMode('search')}
              className="px-3 py-1.5 rounded text-xs font-bold italic transition flex items-center gap-1"
              style={mode === 'search' ? {
                background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
                color: '#451a03',
                boxShadow: '0 0 10px rgba(245, 158, 11, 0.5)',
              } : { background: 'transparent', color: '#fcd34d' }}
            >
              <BookOpen className="w-3 h-3" /> Tome Search
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 rounded-t p-4 overflow-y-auto space-y-3 relative" style={{
        background: 'linear-gradient(135deg, rgba(41, 24, 12, 0.85) 0%, rgba(20, 12, 6, 0.95) 100%)',
        border: '2px solid rgba(245, 158, 11, 0.5)',
        borderBottom: 'none',
        boxShadow: 'inset 0 0 30px rgba(0,0,0,0.5)',
      }}>
        {messages.length === 0 && (
          <div className="text-center text-amber-100/60 py-8">
            {mode === 'oracle' ? (
              <>
                <Wand2 className="w-16 h-16 mx-auto text-amber-400 mb-3" style={{ filter: 'drop-shadow(0 0 12px rgba(245, 158, 11, 0.6))' }} />
                <div className="italic text-lg">Speak, brave scholar...</div>
                <div className="text-sm mt-2 italic">The Oracle awaits your questions on <span className="text-amber-300">{courseSet.metadata.title}</span></div>
                <div className="text-xs mt-3 text-amber-700 italic max-w-md mx-auto">The Oracle searches the tome for truth and shall reference its sources.</div>
              </>
            ) : (
              <>
                <BookOpen className="w-16 h-16 mx-auto text-amber-400 mb-3" style={{ filter: 'drop-shadow(0 0 12px rgba(245, 158, 11, 0.6))' }} />
                <div className="italic text-lg">Search the tome directly...</div>
                <div className="text-sm mt-2 italic">No magic shall be summoned — only the tome's own pages of <span className="text-amber-300">{courseSet.metadata.title}</span></div>
                <div className="text-xs mt-3 text-amber-700 italic max-w-md mx-auto">Type a term, concept, or question and the most relevant passages shall be revealed.</div>
              </>
            )}
          </div>
        )}

        {messages.map((m, i) => {
          if (m.role === 'system_notice') {
            return (
              <div key={i} className="flex justify-center">
                <div className="px-4 py-2 rounded text-xs italic max-w-[90%] text-center" style={{
                  background: 'rgba(120, 53, 15, 0.4)',
                  border: '1px solid rgba(245, 158, 11, 0.5)',
                  color: '#fde047',
                }}>
                  ⚠ {m.content}
                </div>
              </div>
            );
          }
          if (m.role === 'user') {
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[80%] p-3 rounded" style={{
                  background: 'linear-gradient(to bottom, rgba(120, 53, 15, 0.6), rgba(41, 24, 12, 0.8))',
                  border: '1px solid rgba(245, 158, 11, 0.5)',
                  color: '#fef3c7',
                }}>
                  <div className="whitespace-pre-wrap italic">{m.content}</div>
                </div>
              </div>
            );
          }
          // Oracle assistant or search result
          const isSearch = m.role === 'search';
          return (
            <div key={i} className="flex justify-start">
              <div className="max-w-[90%] flex flex-col gap-2">
                <div className="p-3 rounded" style={{
                  background: isSearch ? 'rgba(12, 24, 41, 0.7)' : 'rgba(41, 24, 12, 0.7)',
                  border: `1px solid ${isSearch ? 'rgba(59, 130, 246, 0.4)' : 'rgba(245, 158, 11, 0.3)'}`,
                  color: '#fef3c7',
                }}>
                  <div className="text-xs mb-2 tracking-widest italic" style={{ color: isSearch ? '#7dd3fc' : '#fcd34d' }}>
                    {isSearch ? '📖 TOME SEARCH' : '🪄 THE ORACLE'}
                  </div>
                  <div className="whitespace-pre-wrap italic">{m.content}</div>
                </div>
                {/* Sources */}
                {m.sources && m.sources.length > 0 && (
                  <div className="rounded p-2 text-xs" style={{
                    background: 'rgba(20, 12, 6, 0.7)',
                    border: '1px solid rgba(120, 53, 15, 0.5)',
                  }}>
                    <div className="text-amber-600 italic tracking-wider mb-2">⚜ SOURCES FROM THE TOME ⚜</div>
                    <div className="space-y-1">
                      {m.sources.map((s, si) => {
                        const key = `${i}-${si}`;
                        const expanded = expandedSources[key];
                        const sourceLabel = `[${si + 1}] ${s.icon} ${s.typeLabel}`;
                        const preview = s.text.length > 100 ? s.text.slice(0, 100) + '...' : s.text;
                        return (
                          <div key={si} className="rounded" style={{
                            background: 'rgba(41, 24, 12, 0.5)',
                            border: '1px solid rgba(120, 53, 15, 0.4)',
                          }}>
                            <button
                              onClick={() => toggleSource(i, si)}
                              className="w-full text-left p-2 flex items-start gap-2 hover:bg-amber-900/20"
                            >
                              <span className="text-amber-400 font-bold flex-shrink-0">{sourceLabel}</span>
                              <span className="text-amber-100/70 italic flex-1">
                                {expanded ? s.text : preview}
                              </span>
                              <ChevronRight className={`w-3 h-3 text-amber-600 flex-shrink-0 mt-1 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex justify-start">
            <div className="p-3 rounded" style={{ background: 'rgba(41, 24, 12, 0.7)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
              <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="rounded-b p-3 flex gap-2" style={{
        background: 'rgba(20, 12, 6, 0.95)',
        border: '2px solid rgba(245, 158, 11, 0.5)',
        borderTop: 'none',
      }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={mode === 'oracle' ? 'Ask the Oracle...' : 'Search the tome...'}
          disabled={loading}
          className="flex-1 p-3 rounded border-2 focus:outline-none italic text-amber-50"
          style={{ background: 'rgba(41, 24, 12, 0.7)', borderColor: 'rgba(180, 83, 9, 0.5)' }}
        />
        <button
          onClick={send}
          disabled={!input.trim() || loading}
          className="px-4 py-3 font-bold rounded disabled:opacity-50 flex items-center gap-2 text-amber-950 border-2 border-amber-300 italic"
          style={{ background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)', boxShadow: '0 0 15px rgba(245, 158, 11, 0.4)' }}
        >
          {mode === 'oracle' ? <><Send className="w-4 h-4" /> Speak</> : <><BookOpen className="w-4 h-4" /> Search</>}
        </button>
      </div>

      {/* Clear chat confirm */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur z-50 flex items-center justify-center p-4">
          <div className="rounded max-w-md w-full overflow-hidden flex flex-col relative" style={{
            background: 'linear-gradient(135deg, rgba(80, 20, 20, 0.95) 0%, rgba(20, 6, 6, 0.99) 100%)',
            border: '3px double rgba(220, 38, 38, 0.7)',
            boxShadow: '0 0 40px rgba(220, 38, 38, 0.4)',
          }}>
            <div className="p-4 border-b border-red-700/50 flex justify-between items-center">
              <h3 className="text-lg font-bold text-red-300 italic flex items-center gap-2">
                <Trash2 className="w-5 h-5" /> Clear Chat History
              </h3>
              <button onClick={() => setShowClearConfirm(false)} className="p-2 hover:bg-red-900/30 rounded text-red-300">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4">
              <p className="text-amber-100 italic">
                "Erase all messages with the Oracle and Tome Search for this tome? This cannot be undone, brave scholar."
              </p>
            </div>
            <div className="p-4 border-t border-red-700/50 flex gap-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2 rounded border-2 border-amber-700 text-amber-200 italic"
                style={{ background: 'rgba(41, 24, 12, 0.7)' }}
              >
                Cancel
              </button>
              <button
                onClick={clearChat}
                className="flex-1 py-2 font-bold rounded text-amber-50 border-2 border-red-400 italic"
                style={{ background: 'linear-gradient(to bottom, #dc2626 0%, #991b1b 100%)' }}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MistakeVault({ courseSet, tomeProgress, playerState, onRemove, checkAchievement, unlockSpecialTitle, awardXP }) {
  const vault = tomeProgress?.mistakeVault || [];

  useEffect(() => {
    if (vault.length === 0 && playerState.totalAnswered > 10) {
      checkAchievement('vault_clear');
      unlockSpecialTitle('vaultkeeper');
    }
  }, [vault.length]);

  if (!courseSet) {
    return (
      <div className="text-center py-12 max-w-md mx-auto">
        <Skull className="w-20 h-20 mx-auto text-stone-600 mb-4" />
        <h2 className="text-2xl font-bold text-amber-300 mb-2 italic">No Active Tome</h2>
        <p className="text-amber-100/60 italic">Open a tome to view its vault of failures.</p>
      </div>
    );
  }

  if (vault.length === 0) {
    return (
      <div className="text-center py-12 max-w-md mx-auto">
        <Skull className="w-20 h-20 mx-auto text-stone-600 mb-4" />
        <h2 className="text-2xl font-bold text-amber-300 mb-2 italic">The Tome is Empty</h2>
        <p className="text-amber-100/60 italic">"All foes have been vanquished, brave scholar. Let new challenges find you..."</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-amber-200 mb-4 flex items-center gap-2 italic">
        <Skull className="w-7 h-7 text-red-400" /> Tome of Failures ({vault.length})
      </h2>
      {vault.map((item, i) => (
        <div key={i} className="p-4 rounded relative" style={{
          background: 'linear-gradient(135deg, rgba(41, 12, 12, 0.7) 0%, rgba(20, 6, 6, 0.9) 100%)',
          border: '2px solid rgba(185, 28, 28, 0.5)',
        }}>
          <div className="flex justify-between items-start gap-3">
            <div className="flex-1">
              <div className="text-xs text-red-400 tracking-[0.3em] mb-1 italic">⚔ {(item._type || 'item').toUpperCase()} ⚔</div>
              <div className="text-amber-50 mb-2 italic">{item.question || item.front || item.term || item.title}</div>
              {item.explanation && (
                <div className="text-sm text-amber-100/70 mt-2 p-2 rounded italic" style={{ background: 'rgba(20, 12, 6, 0.6)', border: '1px solid rgba(120, 53, 15, 0.4)' }}>{item.explanation}</div>
              )}
            </div>
            <button onClick={() => { onRemove(item.id); awardXP(5); }} className="px-3 py-1 rounded text-sm border-2 border-emerald-400 text-emerald-200" style={{ background: 'rgba(6, 78, 59, 0.5)' }} title="Vanquish this foe">
              <Check className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}


function RunHistoryScreen({ playerState, setScreen }) {
  const activeTome = playerState.library?.find(t => t.id === playerState.activeTomeId);
  const tomeProgress = activeTome?.progress || blankTomeProgress();
  const tomeTitle = activeTome?.data?.metadata?.title || 'Unknown Tome';
  const summary = useMemo(() => summarizeRunHistory(tomeProgress.runHistory), [tomeProgress.runHistory]);
  const [expanded, setExpanded] = useState(null); // runId

  const sorted = useMemo(
    () => [...summary.runs].sort((a, b) => new Date(b.date) - new Date(a.date)),
    [summary.runs]
  );

  return (
    <div className="space-y-6">
      <div className="p-6 rounded relative" style={{
        background: 'linear-gradient(135deg, rgba(31, 12, 41, 0.7) 0%, rgba(10, 6, 4, 0.95) 100%)',
        border: '3px double rgba(168, 85, 247, 0.6)',
        boxShadow: '0 0 30px rgba(168, 85, 247, 0.2), inset 0 0 30px rgba(0,0,0,0.5)',
      }}>
        <div className="absolute top-2 left-2 text-purple-400 text-sm">⚜</div>
        <div className="absolute top-2 right-2 text-purple-400 text-sm">⚜</div>
        <div className="absolute bottom-2 left-2 text-purple-400 text-sm">⚜</div>
        <div className="absolute bottom-2 right-2 text-purple-400 text-sm">⚜</div>

        <div className="flex items-center gap-3 mb-3">
          <Scroll className="w-10 h-10 text-purple-300" style={{ filter: 'drop-shadow(0 0 10px rgba(168, 85, 247, 0.6))' }} />
          <div>
            <h2 className="text-2xl font-bold text-purple-200 italic" style={{ textShadow: '0 0 12px rgba(168, 85, 247, 0.4)' }}>
              The Chronicle of Delves
            </h2>
            <div className="text-xs text-purple-400 tracking-[0.2em] italic">
              ⚜ {tomeTitle} ⚜
            </div>
          </div>
        </div>

        {summary.totalRuns === 0 ? (
          <p className="text-amber-100/60 italic text-sm">No delves recorded for this tome yet. Brave the dungeon to inscribe thy first chapter.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
            <RecordTile
              label="Total Delves"
              value={`${summary.totalRuns}`}
              sub={`${summary.totalWins}W · ${summary.totalRuns - summary.totalWins}L`}
            />
            <RecordTile
              label="Win Rate"
              value={`${Math.round(summary.winRate * 100)}%`}
              sub={summary.totalRuns < 5 ? `(${summary.totalRuns}/5 for stable rate)` : null}
            />
            <RecordTile
              label="Highest Score"
              value={summary.highestScore ? summary.highestScore.score.toLocaleString() : '—'}
              sub={summary.highestScore ? DIFFICULTIES[summary.highestScore.difficulty]?.label : null}
            />
            <RecordTile
              label="Fastest Win"
              value={summary.fastestWin ? formatDuration(summary.fastestWin.durationSec) : '—'}
              sub={summary.fastestWin ? DIFFICULTIES[summary.fastestWin.difficulty]?.label : null}
            />
            <RecordTile
              label="Longest Streak"
              value={summary.longestStreak ? `${summary.longestStreak.maxStreak}` : '—'}
              sub={summary.longestStreak ? DIFFICULTIES[summary.longestStreak.difficulty]?.label : null}
            />
          </div>
        )}
      </div>

      {summary.totalRuns === 0 ? (
        <div className="text-center py-12">
          <button onClick={() => setScreen('dungeon')} className="px-5 py-3 rounded font-bold italic border-2 border-red-400 text-amber-50 inline-flex items-center gap-2"
            style={{ background: 'linear-gradient(to bottom, #dc2626 0%, #991b1b 100%)', boxShadow: '0 0 18px rgba(220, 38, 38, 0.4)' }}>
            <Swords className="w-4 h-4" /> Begin a Delve
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(run => {
            const diff = DIFFICULTIES[run.difficulty] || DIFFICULTIES.apprentice;
            const boss = BOSS_TYPES[run.bossId];
            const isOpen = expanded === run.runId;
            const dateLabel = new Date(run.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            return (
              <div key={run.runId} className="rounded relative overflow-hidden" style={{
                background: run.won
                  ? 'linear-gradient(135deg, rgba(6, 78, 59, 0.4) 0%, rgba(10, 6, 4, 0.95) 100%)'
                  : 'linear-gradient(135deg, rgba(127, 29, 29, 0.4) 0%, rgba(10, 6, 4, 0.95) 100%)',
                border: run.won ? '2px solid rgba(16, 185, 129, 0.55)' : '2px solid rgba(239, 68, 68, 0.5)',
              }}>
                <button
                  onClick={() => setExpanded(isOpen ? null : run.runId)}
                  className="w-full p-4 text-left flex items-center gap-3 flex-wrap"
                >
                  <span className="text-2xl flex-shrink-0">{boss?.icon || '⚔'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-bold italic ${run.won ? 'text-emerald-200' : 'text-red-200'}`}>
                        {run.won ? '⚔ Victory' : '✗ Defeat'}
                      </span>
                      <span className="text-xs text-amber-200 italic">{diff.icon} {diff.label}</span>
                      {boss && <span className="text-xs text-purple-300 italic">vs {boss.name}</span>}
                      {run.modifiers?.length > 0 && (
                        <span className="text-xs text-amber-700 italic">⚜ {run.modifiers.length} curse{run.modifiers.length === 1 ? '' : 's'}</span>
                      )}
                    </div>
                    <div className="text-xs text-amber-700 italic mt-0.5">{dateLabel}</div>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs">
                    <span className="text-amber-300"><Gem className="w-3 h-3 inline" /> {run.score?.toLocaleString() || 0}</span>
                    <span className="text-orange-300"><Flame className="w-3 h-3 inline" /> {run.maxStreak || 0}</span>
                    <span className="text-red-300">❤ {run.livesRemaining}/{run.maxLives}</span>
                    <span className="text-purple-300">⏱ {formatDuration(run.durationSec)}</span>
                  </div>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-amber-400" /> : <ChevronDown className="w-4 h-4 text-amber-400" />}
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 border-t border-amber-900/40 pt-3 space-y-2">
                    <div className="text-xs text-purple-300 italic">
                      Mistakes this run: <span className="text-amber-200 font-bold">{run.mistakes}</span> · Total questions: <span className="text-amber-200 font-bold">{run.totalQuestions}</span>
                    </div>
                    {(run.questionLog || []).length === 0 ? (
                      <div className="text-xs text-amber-700 italic">No per-question log was captured for this delve.</div>
                    ) : (
                      <div className="space-y-1">
                        {run.questionLog.map((q, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs italic" style={{ background: 'rgba(10, 6, 4, 0.5)', padding: '6px 8px', borderRadius: '4px' }}>
                            {q.correct
                              ? <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                              : <X className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />}
                            <div className="flex-1 min-w-0">
                              <div className="text-amber-100/80 truncate">{q.prompt}</div>
                              <div className="text-amber-700">
                                {q.type ? <span>type: {q.type}</span> : null}
                                {q.bossKind ? <span> · {BOSS_TYPES[q.bossKind]?.name || q.bossKind}</span> : null}
                                {q.timeSec ? <span> · {q.timeSec}s</span> : null}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RecordTile({ label, value, sub }) {
  return (
    <div className="p-3 rounded relative" style={{
      background: 'linear-gradient(135deg, rgba(120, 53, 15, 0.45) 0%, rgba(41, 24, 12, 0.85) 100%)',
      border: '1px solid rgba(245, 158, 11, 0.4)',
      boxShadow: 'inset 0 0 12px rgba(0,0,0,0.4)',
    }}>
      <div className="text-xs text-amber-700 tracking-[0.15em] italic uppercase">{label}</div>
      <div className="text-xl font-bold text-amber-200 italic tabular-nums" style={{ textShadow: '0 0 6px rgba(245, 158, 11, 0.3)' }}>{value}</div>
      {sub && <div className="text-xs text-amber-100/60 italic">{sub}</div>}
    </div>
  );
}

function ShopScreen({ playerState, setScreen, onPurchase }) {
  const [activeTab, setActiveTab] = useState('apothecary');
  const [pendingPurchase, setPendingPurchase] = useState(null); // item object
  const [purchaseError, setPurchaseError] = useState(null);

  // Daily-rotating stock — recomputes when the date string changes (refreshes
  // at midnight). Memoized so revisits within the same day reuse the picks.
  const today = todayDateStr();
  const stockByCategory = useMemo(() => {
    const out = {};
    Object.keys(ITEM_CATEGORIES).forEach((catId) => {
      out[catId] = pickShopStock(today, catId, 4);
    });
    return out;
  }, [today]);

  const tabs = Object.entries(ITEM_CATEGORIES).map(([id, cat]) => ({ id, ...cat }));
  const currentCat = ITEM_CATEGORIES[activeTab];
  const currentStock = stockByCategory[activeTab] || [];

  const isOwned = (item) => {
    if (!item.oneTime) return false;
    return ((playerState.inventory || {})[item.id] || 0) > 0;
  };
  const sanctumLevel = (item) => sanctumCount(playerState, item);
  const sanctumCap = (item) => item.cap || 1;

  const tryBuy = () => {
    if (!pendingPurchase) return;
    const result = onPurchase(pendingPurchase.id);
    if (result.ok) {
      setPendingPurchase(null);
      setPurchaseError(null);
    } else {
      setPurchaseError(result.reason);
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-6 rounded relative" style={{
        background: 'linear-gradient(135deg, rgba(120, 53, 15, 0.5) 0%, rgba(10, 6, 4, 0.95) 100%)',
        border: '3px double rgba(245, 158, 11, 0.6)',
        boxShadow: '0 0 30px rgba(245, 158, 11, 0.2), inset 0 0 30px rgba(0,0,0,0.5)',
      }}>
        <div className="absolute top-2 left-2 text-amber-500 text-sm">⚜</div>
        <div className="absolute top-2 right-2 text-amber-500 text-sm">⚜</div>
        <div className="absolute bottom-2 left-2 text-amber-500 text-sm">⚜</div>
        <div className="absolute bottom-2 right-2 text-amber-500 text-sm">⚜</div>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <ShoppingBag className="w-10 h-10 text-amber-300" style={{ filter: 'drop-shadow(0 0 10px rgba(245, 158, 11, 0.6))' }} />
            <div>
              <h2 className="text-2xl font-bold text-amber-200 italic" style={{ textShadow: '0 0 12px rgba(245, 158, 11, 0.4)' }}>
                The Marketplace
              </h2>
              <div className="text-xs text-amber-400 tracking-[0.2em] italic">
                ⚜ ROTATING WARES — {today} ⚜
              </div>
              <div className="text-xs text-amber-100/70 italic mt-1">
                Stock changes at the breaking of each dawn.
              </div>
            </div>
          </div>
          <div className="px-4 py-2 rounded border-2 border-amber-700/60 flex items-center gap-2" style={{
            background: 'linear-gradient(to bottom, rgba(120, 53, 15, 0.5), rgba(41, 24, 12, 0.85))',
            boxShadow: '0 0 10px rgba(245, 158, 11, 0.2), inset 0 0 10px rgba(0,0,0,0.4)',
          }}>
            <Coins className="w-5 h-5 text-amber-300" style={{ filter: 'drop-shadow(0 0 4px rgba(245, 158, 11, 0.6))' }} />
            <span className="text-amber-200 font-bold italic text-lg tabular-nums">{playerState.gold || 0}</span>
            <span className="text-amber-700 italic text-xs">gold</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className="px-4 py-2.5 rounded font-bold italic text-sm border-2 flex items-center gap-2 transition"
            style={{
              borderColor: activeTab === t.id ? 'rgba(245, 158, 11, 0.85)' : 'rgba(126, 34, 206, 0.5)',
              background: activeTab === t.id
                ? 'linear-gradient(to bottom, rgba(120, 53, 15, 0.6), rgba(41, 24, 12, 0.95))'
                : 'rgba(31, 12, 41, 0.5)',
              color: activeTab === t.id ? '#fde047' : '#d8b4fe',
              boxShadow: activeTab === t.id ? '0 0 15px rgba(245, 158, 11, 0.35)' : 'none',
            }}
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      <p className="text-amber-100/70 italic text-sm">{currentCat.blurb}</p>

      {currentStock.length === 0 ? (
        <div className="text-center py-12 text-amber-700 italic">
          The shelves are bare in this hall today.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {currentStock.map((item) => {
            const owned = isOwned(item);
            const atCap = item.category === 'sanctum' && sanctumAtCap(playerState, item);
            const canAfford = (playerState.gold || 0) >= item.price;
            const locked = item.locked;
            const disabled = owned || atCap || locked || !canAfford;
            const buttonLabel = locked ? 'Sealed'
              : owned ? 'Owned'
              : atCap ? `Maxed (${sanctumLevel(item)}/${sanctumCap(item)})`
              : !canAfford ? 'Insufficient gold'
              : 'Purchase';
            return (
              <div key={item.id} className="p-5 rounded relative" style={{
                background: locked
                  ? 'linear-gradient(135deg, rgba(15, 8, 20, 0.6) 0%, rgba(10, 6, 4, 0.95) 100%)'
                  : owned || atCap
                    ? 'linear-gradient(135deg, rgba(6, 78, 59, 0.4) 0%, rgba(10, 6, 4, 0.9) 100%)'
                    : 'linear-gradient(135deg, rgba(31, 12, 41, 0.7) 0%, rgba(10, 6, 4, 0.95) 100%)',
                border: locked
                  ? '1px solid rgba(60, 35, 80, 0.4)'
                  : owned || atCap
                    ? '2px solid rgba(16, 185, 129, 0.6)'
                    : '2px solid rgba(126, 34, 206, 0.5)',
                boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)',
              }}>
                <div className="absolute top-1 left-1 text-amber-700/60 text-xs">⚜</div>
                <div className="absolute top-1 right-1 text-amber-700/60 text-xs">⚜</div>
                <div className="absolute bottom-1 left-1 text-amber-700/60 text-xs">⚜</div>
                <div className="absolute bottom-1 right-1 text-amber-700/60 text-xs">⚜</div>

                <div className="flex items-start gap-3 mb-3">
                  <div className="text-3xl flex-shrink-0">{item.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2 flex-wrap">
                      <h3 className={`font-bold italic text-sm ${locked ? 'text-amber-700/70' : 'text-amber-200'}`}
                          style={!locked ? { textShadow: '0 0 6px rgba(245, 158, 11, 0.3)' } : undefined}>
                        {item.name}
                      </h3>
                      {item.category === 'sanctum' && (
                        <span className="text-xs text-emerald-300 italic">
                          {sanctumLevel(item)}/{sanctumCap(item)}
                        </span>
                      )}
                    </div>
                    <p className={`text-xs italic mt-1 ${locked ? 'text-amber-700/50' : 'text-amber-100/70'}`}>
                      {item.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs italic flex items-center gap-1">
                    <Coins className="w-4 h-4 text-amber-300" />
                    <span className={`font-bold tabular-nums ${canAfford ? 'text-amber-300' : 'text-red-300'}`}>{item.price}</span>
                    <span className="text-amber-700">gold</span>
                  </div>
                  <button
                    onClick={() => { if (!disabled) { setPendingPurchase(item); setPurchaseError(null); } }}
                    disabled={disabled}
                    className="px-3 py-1.5 rounded text-xs font-bold italic border-2 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={disabled
                      ? { background: 'rgba(31, 12, 41, 0.6)', borderColor: 'rgba(126, 34, 206, 0.4)', color: '#a78bfa' }
                      : { background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)', borderColor: '#fde047', color: '#451a03', boxShadow: '0 0 12px rgba(245, 158, 11, 0.5)' }}
                  >
                    {locked ? <Lock className="w-3 h-3" /> : owned || atCap ? <Check className="w-3 h-3" /> : <Coins className="w-3 h-3" />}
                    {buttonLabel}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pendingPurchase && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur z-50 flex items-center justify-center p-4">
          <div className="rounded max-w-md w-full overflow-hidden flex flex-col relative" style={{
            background: 'linear-gradient(135deg, rgba(41, 24, 12, 0.99) 0%, rgba(10, 6, 4, 1) 100%)',
            border: '3px double rgba(245, 158, 11, 0.7)',
            boxShadow: '0 0 60px rgba(245, 158, 11, 0.4)',
          }}>
            <div className="absolute top-2 left-2 text-amber-500 text-lg">⚜</div>
            <div className="absolute top-2 right-2 text-amber-500 text-lg">⚜</div>
            <div className="absolute bottom-2 left-2 text-amber-500 text-lg">⚜</div>
            <div className="absolute bottom-2 right-2 text-amber-500 text-lg">⚜</div>

            <div className="p-6 space-y-4 text-center">
              <div className="text-5xl">{pendingPurchase.icon}</div>
              <div>
                <h3 className="text-xl font-bold text-amber-200 italic" style={{ textShadow: '0 0 8px rgba(245, 158, 11, 0.4)' }}>
                  Purchase {pendingPurchase.name}?
                </h3>
                <p className="text-sm text-amber-100/80 italic mt-2">{pendingPurchase.description}</p>
              </div>
              <div className="px-4 py-3 rounded border border-amber-700/60 inline-flex items-center gap-2" style={{ background: 'rgba(120, 53, 15, 0.4)' }}>
                <span className="text-xs text-amber-700 italic">Cost:</span>
                <Coins className="w-4 h-4 text-amber-300" />
                <span className="text-amber-200 font-bold italic tabular-nums">{pendingPurchase.price}</span>
                <span className="text-xs text-amber-700 italic">gold</span>
              </div>
              <div className="text-xs text-amber-100/60 italic">
                Thou hast <span className="text-amber-300 font-bold">{playerState.gold || 0}</span> gold.
              </div>
              {purchaseError && (
                <div className="px-3 py-2 rounded text-sm italic border border-red-500/60 text-red-200" style={{ background: 'rgba(127, 29, 29, 0.4)' }}>
                  {purchaseError}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-amber-700/50 flex gap-2">
              <button onClick={() => { setPendingPurchase(null); setPurchaseError(null); }}
                className="flex-1 py-3 rounded border-2 border-amber-700 text-amber-200 italic"
                style={{ background: 'rgba(41, 24, 12, 0.7)' }}>
                Cancel
              </button>
              <button onClick={tryBuy}
                className="flex-1 py-3 font-bold rounded flex items-center justify-center gap-2 text-amber-950 border-2 border-amber-300 italic"
                style={{ background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)', boxShadow: '0 0 20px rgba(245, 158, 11, 0.5)' }}>
                <Coins className="w-4 h-4" /> Confirm Purchase
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InventoryScreen({ playerState, setScreen, onEquip, onUnequip, onEquipPotion, onUnequipPotion }) {
  const inv = playerState.inventory || {};
  const equipped = playerState.equipped || {};
  const equippedPotions = equipped.potions || [null, null, null];
  const totalItems = Object.values(inv).reduce((s, n) => s + (n || 0), 0);

  const itemsByCategory = Object.keys(ITEM_CATEGORIES).reduce((acc, cat) => {
    acc[cat] = ITEMS
      .filter(it => it.category === cat && (inv[it.id] || 0) > 0)
      .map(it => ({ ...it, count: inv[it.id] }));
    return acc;
  }, {});

  const SLOTS = [
    { id: 'weapon', label: 'Weapon', icon: '⚔️' },
    { id: 'head',   label: 'Head',   icon: '👑' },
    { id: 'cloak',  label: 'Cloak',  icon: '🌌' },
    { id: 'pet',    label: 'Pet',    icon: '🐾' },
  ];

  return (
    <div className="space-y-6">
      <div className="p-6 rounded relative" style={{
        background: 'linear-gradient(135deg, rgba(6, 78, 59, 0.4) 0%, rgba(10, 6, 4, 0.95) 100%)',
        border: '3px double rgba(16, 185, 129, 0.6)',
        boxShadow: '0 0 30px rgba(16, 185, 129, 0.2), inset 0 0 30px rgba(0,0,0,0.5)',
      }}>
        <div className="absolute top-2 left-2 text-emerald-400 text-sm">⚜</div>
        <div className="absolute top-2 right-2 text-emerald-400 text-sm">⚜</div>
        <div className="absolute bottom-2 left-2 text-emerald-400 text-sm">⚜</div>
        <div className="absolute bottom-2 right-2 text-emerald-400 text-sm">⚜</div>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Package className="w-10 h-10 text-emerald-300" style={{ filter: 'drop-shadow(0 0 10px rgba(16, 185, 129, 0.6))' }} />
            <div>
              <h2 className="text-2xl font-bold text-emerald-200 italic" style={{ textShadow: '0 0 12px rgba(16, 185, 129, 0.4)' }}>
                The Hoard
              </h2>
              <div className="text-xs text-emerald-400 tracking-[0.2em] italic">
                ⚜ THY GATHERED TREASURES ⚜
              </div>
              <div className="text-xs text-amber-100/70 italic mt-1">
                {totalItems} item{totalItems === 1 ? '' : 's'} stowed
              </div>
            </div>
          </div>
          <div className="px-4 py-2 rounded border-2 border-amber-700/60 flex items-center gap-2" style={{
            background: 'linear-gradient(to bottom, rgba(120, 53, 15, 0.5), rgba(41, 24, 12, 0.85))',
            boxShadow: '0 0 10px rgba(245, 158, 11, 0.2), inset 0 0 10px rgba(0,0,0,0.4)',
          }}>
            <Coins className="w-5 h-5 text-amber-300" style={{ filter: 'drop-shadow(0 0 4px rgba(245, 158, 11, 0.6))' }} />
            <span className="text-amber-200 font-bold italic text-lg tabular-nums">{playerState.gold || 0}</span>
            <span className="text-amber-700 italic text-xs">gold</span>
          </div>
        </div>
      </div>

      {/* Loadout — current equipment per slot. Always shown, even with no
          inventory, so the player has a clear hint that gear exists. */}
      <div className="rounded p-4 relative" style={{
        background: 'linear-gradient(135deg, rgba(120, 53, 15, 0.35) 0%, rgba(10, 6, 4, 0.92) 100%)',
        border: '2px solid rgba(245, 158, 11, 0.45)',
        boxShadow: '0 0 12px rgba(245, 158, 11, 0.15), inset 0 0 12px rgba(0,0,0,0.5)',
      }}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">⚔</span>
          <h3 className="text-base font-bold text-amber-200 italic tracking-wider" style={{ textShadow: '0 0 8px rgba(245,158,11,0.3)' }}>
            Loadout
          </h3>
          <div className="flex-1 h-px bg-gradient-to-r from-amber-700/50 to-transparent" />
          <span className="text-[10px] text-amber-700 italic">Equipped gear is active inside the dungeon.</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {SLOTS.map((s) => {
            const equippedId = equipped[s.id];
            const item = equippedId ? findItem(equippedId) : null;
            return (
              <div key={s.id} className="p-3 rounded flex items-center gap-2" style={{
                background: 'rgba(31,17,8,0.6)',
                border: `1px solid ${item ? 'rgba(245,158,11,0.6)' : 'rgba(120,53,15,0.4)'}`,
              }}>
                <div className="text-2xl">{item ? item.icon : s.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-amber-700 italic uppercase tracking-wider">{s.label}</div>
                  <div className="text-xs text-amber-200 italic truncate">
                    {item ? item.name : <span className="text-amber-700/60">— Empty —</span>}
                  </div>
                </div>
                {item && onUnequip && (
                  <button
                    onClick={() => onUnequip(s.id)}
                    className="text-[10px] text-amber-600 hover:text-amber-300 italic underline"
                    title="Unequip"
                  >
                    Doff
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Potion quick-slots — usable from hotkeys 1/2/3 inside the dungeon. */}
        <div className="mt-3 flex items-center gap-2 mb-2">
          <span className="text-base">🧪</span>
          <h4 className="text-xs font-bold text-amber-200 italic tracking-wider">Potion Quick-Slots</h4>
          <div className="flex-1 h-px bg-gradient-to-r from-amber-700/40 to-transparent" />
          <span className="text-[10px] text-amber-700 italic">Hotkeys 1 · 2 · 3</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => {
            const id = equippedPotions[i];
            const item = id ? findItem(id) : null;
            const count = item ? (inv[item.id] || 0) : 0;
            return (
              <div key={i} className="p-2 rounded flex items-center gap-2" style={{
                background: 'rgba(31,17,8,0.6)',
                border: `1px solid ${item ? 'rgba(34,197,94,0.6)' : 'rgba(120,53,15,0.4)'}`,
              }}>
                <div className="w-8 h-8 flex items-center justify-center rounded text-xl" style={{
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid rgba(120,53,15,0.4)',
                }}>
                  {item ? item.icon : <span className="text-amber-700/40 text-xs italic">{i + 1}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-amber-700 italic uppercase tracking-wider">Slot {i + 1}</div>
                  <div className="text-xs text-amber-200 italic truncate">
                    {item ? `${item.name} ×${count}` : <span className="text-amber-700/60">— Empty —</span>}
                  </div>
                </div>
                {item && onUnequipPotion && (
                  <button
                    onClick={() => onUnequipPotion(i)}
                    className="text-[10px] text-amber-600 hover:text-amber-300 italic underline"
                    title="Clear quick-slot"
                  >
                    Clear
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {totalItems === 0 ? (
        <div className="text-center py-16 px-6 rounded relative" style={{
          background: 'linear-gradient(135deg, rgba(31, 12, 41, 0.5) 0%, rgba(10, 6, 4, 0.9) 100%)',
          border: '2px dashed rgba(126, 34, 206, 0.4)',
        }}>
          <Package className="w-16 h-16 mx-auto text-purple-300/50 mb-4" />
          <p className="text-amber-100/70 italic mb-2">Thy hoard lies empty, scholar.</p>
          <p className="text-xs text-amber-700 italic max-w-md mx-auto">
            Earn gold by answering riddles, conquering dungeons, and claiming quests — then visit the Marketplace to purchase potions, finery, and permanent boons.
          </p>
          <button onClick={() => setScreen('shop')} className="mt-4 px-4 py-2 rounded text-sm font-bold italic border-2 border-amber-300 text-amber-950 inline-flex items-center gap-2"
            style={{ background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)', boxShadow: '0 0 12px rgba(245, 158, 11, 0.5)' }}>
            <ShoppingBag className="w-4 h-4" /> Visit the Marketplace
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(ITEM_CATEGORIES).map(([catId, cat]) => {
            const items = itemsByCategory[catId];
            if (!items || items.length === 0) return null;
            return (
              <div key={catId} className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{cat.icon}</span>
                  <h3 className="text-lg font-bold text-amber-200 italic tracking-wider" style={{ textShadow: '0 0 8px rgba(245, 158, 11, 0.3)' }}>
                    {cat.label}
                  </h3>
                  <div className="flex-1 h-px bg-gradient-to-r from-amber-700/50 to-transparent" />
                  <span className="text-xs text-amber-700 italic">
                    {items.length} kind{items.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  {items.map(it => {
                    const isEquipped = it.slot && equipped[it.slot] === it.id;
                    return (
                    <div key={it.id} className="p-4 rounded relative" style={{
                      background: 'linear-gradient(135deg, rgba(31, 12, 41, 0.65) 0%, rgba(10, 6, 4, 0.95) 100%)',
                      border: `2px solid ${isEquipped ? 'rgba(245, 158, 11, 0.7)' : 'rgba(126, 34, 206, 0.45)'}`,
                      boxShadow: isEquipped
                        ? '0 0 14px rgba(245, 158, 11, 0.3), inset 0 0 15px rgba(0,0,0,0.5)'
                        : '0 0 12px rgba(168, 85, 247, 0.12), inset 0 0 15px rgba(0,0,0,0.5)',
                    }}>
                      <div className="absolute top-1 left-1 text-amber-700/60 text-xs">⚜</div>
                      <div className="absolute top-1 right-1 text-amber-700/60 text-xs">⚜</div>
                      <div className="absolute bottom-1 left-1 text-amber-700/60 text-xs">⚜</div>
                      <div className="absolute bottom-1 right-1 text-amber-700/60 text-xs">⚜</div>
                      <div className="flex items-start gap-3">
                        <div className="text-3xl flex-shrink-0">{it.icon}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <h4 className="font-bold text-amber-200 italic text-sm" style={{ textShadow: '0 0 6px rgba(245, 158, 11, 0.3)' }}>
                              {it.name}
                              {isEquipped && <span className="ml-2 text-[10px] text-amber-400 italic">(Equipped)</span>}
                            </h4>
                            <span className="text-xs text-amber-300 font-bold italic tabular-nums">×{it.count}</span>
                          </div>
                          <p className="text-xs text-amber-100/70 italic mt-1">{it.description}</p>
                          {it.slot && !it.locked && (
                            <div className="mt-2 flex items-center gap-2">
                              {isEquipped ? (
                                <button
                                  onClick={() => onUnequip && onUnequip(it.slot)}
                                  className="px-2 py-1 rounded text-[11px] italic"
                                  style={{
                                    background: 'rgba(31,17,8,0.7)',
                                    border: '1px solid rgba(245,158,11,0.6)',
                                    color: '#fbbf24',
                                  }}
                                >
                                  Unequip
                                </button>
                              ) : (
                                <button
                                  onClick={() => onEquip && onEquip(it.id)}
                                  className="px-2 py-1 rounded text-[11px] italic"
                                  style={{
                                    background: 'rgba(120,53,15,0.55)',
                                    border: '1px solid rgba(245,158,11,0.6)',
                                    color: '#fde047',
                                  }}
                                >
                                  Equip ({it.slot})
                                </button>
                              )}
                            </div>
                          )}
                          {it.category === 'apothecary' && !it.locked && onEquipPotion && (
                            <div className="mt-2 flex items-center gap-1">
                              <span className="text-[10px] text-amber-700 italic mr-1">Quick-slot:</span>
                              {[0, 1, 2].map((i) => {
                                const filledId = equippedPotions[i];
                                const isThis = filledId === it.id;
                                const isOther = filledId && filledId !== it.id;
                                return (
                                  <button
                                    key={i}
                                    onClick={() => {
                                      if (isThis) onUnequipPotion(i);
                                      else onEquipPotion(it.id, i);
                                    }}
                                    className="px-2 py-0.5 rounded text-[10px] italic"
                                    style={{
                                      background: isThis ? 'rgba(120,53,15,0.7)' : 'rgba(31,17,8,0.6)',
                                      border: `1px solid ${isThis ? 'rgba(245,158,11,0.8)' : 'rgba(120,53,15,0.4)'}`,
                                      color: isThis ? '#fde047' : '#a8a29e',
                                    }}
                                    title={isOther ? `Replace ${findItem(filledId)?.name || 'current'} in slot ${i + 1}` : `Slot ${i + 1}`}
                                  >
                                    {i + 1}{isThis ? '★' : isOther ? '↺' : ''}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="text-center pt-2 flex flex-wrap justify-center gap-2">
        <button onClick={() => setScreen('shop')} className="px-4 py-2 rounded text-xs italic border-2 border-amber-700 text-amber-300 hover:bg-amber-900/30 inline-flex items-center gap-2"
          style={{ background: 'rgba(41, 24, 12, 0.5)' }}>
          <ShoppingBag className="w-3.5 h-3.5" /> Browse the Marketplace
        </button>
        <button onClick={() => setScreen('crafting')} className="px-4 py-2 rounded text-xs italic border-2 border-emerald-700 text-emerald-300 hover:bg-emerald-900/30 inline-flex items-center gap-2"
          style={{ background: 'rgba(6, 78, 59, 0.4)' }}>
          🌿 The Brewing Bench
        </button>
      </div>
    </div>
  );
}

// Phase 17 — Bestiary. Lore + drop hints + defeat counters for every
// dungeon dweller, grouped by biome. Bosses unlock tiered lore with
// repeated defeats (5 = expanded, 10 = secret).
function BestiaryScreen({ playerState, setScreen }) {
  const tracked = playerState.bestiary || {};
  const grouped = Object.entries(BESTIARY_ENTRIES).reduce((acc, [kind, entry]) => {
    const biome = entry.biome || 'misc';
    if (!acc[biome]) acc[biome] = [];
    acc[biome].push({ kind, ...entry });
    return acc;
  }, {});
  // Stable order for biomes — matches the explore selector layout.
  const BIOME_ORDER = ['crypt', 'sewers', 'tower', 'halls', 'wastes'];
  const BIOME_LABELS = {
    crypt: { name: 'Crypt of Cryptography', icon: '🗝️', accent: '#a855f7' },
    sewers: { name: 'Sewers of OWASP', icon: '🕸️', accent: '#10b981' },
    tower: { name: 'Tower of Network Defense', icon: '🗼', accent: '#3b82f6' },
    halls: { name: 'Halls of the Hardware', icon: '⚙️', accent: '#f59e0b' },
    wastes: { name: 'Wastes of WiFi', icon: '📡', accent: '#d97706' },
  };

  const totalSeen = Object.keys(tracked).length;
  const totalKnown = Object.keys(BESTIARY_ENTRIES).length;

  const entryLore = (entry, defeats) => {
    if (typeof entry.lore === 'string') return entry.lore;
    // Boss tiered lore.
    let text = entry.lore.base;
    if (defeats >= 5 && entry.lore.expanded) {
      text += `\n\n✦ ${entry.lore.expanded}`;
    }
    if (defeats >= 10 && entry.lore.secret) {
      text += `\n\n✦✦ ${entry.lore.secret}`;
    }
    return text;
  };

  return (
    <div className="space-y-6">
      <div className="p-6 rounded relative" style={{
        background: 'linear-gradient(135deg, rgba(31, 12, 41, 0.55) 0%, rgba(10, 6, 4, 0.95) 100%)',
        border: '3px double rgba(168, 85, 247, 0.6)',
        boxShadow: '0 0 30px rgba(168, 85, 247, 0.2), inset 0 0 30px rgba(0,0,0,0.5)',
      }}>
        <div className="absolute top-2 left-2 text-purple-300 text-sm">⚜</div>
        <div className="absolute top-2 right-2 text-purple-300 text-sm">⚜</div>
        <div className="absolute bottom-2 left-2 text-purple-300 text-sm">⚜</div>
        <div className="absolute bottom-2 right-2 text-purple-300 text-sm">⚜</div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="text-4xl">📖</div>
            <div>
              <h2 className="text-2xl font-bold text-purple-200 italic" style={{ textShadow: '0 0 12px rgba(168, 85, 247, 0.4)' }}>
                Bestiary
              </h2>
              <div className="text-xs text-purple-400 tracking-[0.2em] italic">⚜ THE FOES THAT BLED ⚜</div>
              <div className="text-xs text-amber-100/70 italic mt-1">
                {totalSeen} / {totalKnown} entries unlocked.
              </div>
            </div>
          </div>
          <button onClick={() => setScreen('home')}
            className="px-3 py-2 rounded text-xs italic border-2 border-purple-700 text-purple-300 hover:bg-purple-900/30"
            style={{ background: 'rgba(31, 12, 41, 0.45)' }}>
            ← Return to the Hearth
          </button>
        </div>
      </div>

      {BIOME_ORDER.map((biomeId) => {
        const entries = grouped[biomeId] || [];
        if (entries.length === 0) return null;
        const meta = BIOME_LABELS[biomeId] || { name: biomeId, icon: '⚜', accent: '#fbbf24' };
        return (
          <div key={biomeId} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{meta.icon}</span>
              <h3 className="text-lg font-bold italic tracking-wider" style={{ color: meta.accent, textShadow: `0 0 8px ${meta.accent}66` }}>
                {meta.name}
              </h3>
              <div className="flex-1 h-px bg-gradient-to-r from-amber-700/50 to-transparent" />
              <span className="text-xs text-amber-700 italic">
                {entries.filter(e => tracked[e.kind]).length}/{entries.length} found
              </span>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              {entries.map((entry) => {
                const status = tracked[entry.kind];
                const seen = !!status;
                const defeats = status?.defeats || 0;
                const isBoss = entry.tier === 'boss';
                return (
                  <div key={entry.kind} className="p-4 rounded relative" style={{
                    background: seen
                      ? 'linear-gradient(135deg, rgba(31, 17, 8, 0.9) 0%, rgba(10, 6, 4, 0.97) 100%)'
                      : 'linear-gradient(135deg, rgba(15, 12, 18, 0.85) 0%, rgba(6, 4, 8, 0.95) 100%)',
                    border: `2px ${isBoss ? 'double' : 'solid'} ${
                      seen
                        ? (isBoss ? meta.accent : 'rgba(245, 158, 11, 0.5)')
                        : 'rgba(120, 53, 15, 0.3)'
                    }`,
                    boxShadow: seen && isBoss ? `0 0 14px ${meta.accent}33` : 'none',
                    opacity: seen ? 1 : 0.65,
                  }}>
                    <div className="flex items-start gap-3 mb-2">
                      <div className="text-3xl">{seen ? entry.icon : '❓'}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <h4 className={`font-bold italic text-sm ${seen ? 'text-amber-200' : 'text-amber-700/80'}`}>
                            {seen ? entry.name : '???'}
                            {isBoss && seen && <span className="ml-2 text-[10px] text-purple-300 italic">(Boss)</span>}
                            {entry.tier === 'elite' && seen && <span className="ml-2 text-[10px] text-orange-300 italic">(Elite)</span>}
                          </h4>
                          {seen && (
                            <span className="text-xs text-amber-300 font-bold italic tabular-nums">
                              ×{defeats}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] italic text-amber-100/70 mt-1 whitespace-pre-line">
                          {seen ? entryLore(entry, defeats) : 'Defeat one in the dungeon to unlock this entry.'}
                        </p>
                        {seen && entry.drops && (
                          <div className="text-[10px] italic text-emerald-300/80 mt-2">
                            <span className="text-amber-700 not-italic">Drops:</span> {entry.drops}
                          </div>
                        )}
                        {isBoss && seen && (
                          <div className="text-[10px] italic mt-2" style={{ color: meta.accent }}>
                            ✦ Lore tiers: {defeats >= 1 ? 'base' : '—'}
                            {' · '}{defeats >= 5 ? 'expanded' : `expanded @ 5 (${defeats}/5)`}
                            {' · '}{defeats >= 10 ? 'secret' : `secret @ 10 (${defeats}/10)`}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Phase 16 — Crafting bench. Spend gathered ingredients to brew run-grade
// potions without the Marketplace's gold cost.
function CraftingScreen({ playerState, setScreen, onCraft }) {
  const inv = playerState.inventory || {};
  const ingredients = ITEMS.filter(it => it.category === 'ingredient');
  const ownedIngredients = ingredients
    .map(it => ({ ...it, count: inv[it.id] || 0 }))
    .filter(it => it.count > 0);
  const ingredientHave = (id) => inv[id] || 0;
  const [feedback, setFeedback] = useState(null);

  const tryCraft = (recipe) => {
    if (!onCraft) return;
    const res = onCraft(recipe.id);
    if (!res?.ok) {
      setFeedback({ recipeId: recipe.id, text: res?.reason || 'Could not brew.', tone: 'bad' });
      setTimeout(() => setFeedback(null), 1800);
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-6 rounded relative" style={{
        background: 'linear-gradient(135deg, rgba(6, 78, 59, 0.4) 0%, rgba(10, 6, 4, 0.95) 100%)',
        border: '3px double rgba(16, 185, 129, 0.6)',
        boxShadow: '0 0 30px rgba(16, 185, 129, 0.2), inset 0 0 30px rgba(0,0,0,0.5)',
      }}>
        <div className="absolute top-2 left-2 text-emerald-400 text-sm">⚜</div>
        <div className="absolute top-2 right-2 text-emerald-400 text-sm">⚜</div>
        <div className="absolute bottom-2 left-2 text-emerald-400 text-sm">⚜</div>
        <div className="absolute bottom-2 right-2 text-emerald-400 text-sm">⚜</div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="text-4xl">🌿</div>
            <div>
              <h2 className="text-2xl font-bold text-emerald-200 italic" style={{ textShadow: '0 0 12px rgba(16, 185, 129, 0.4)' }}>
                The Brewing Bench
              </h2>
              <div className="text-xs text-emerald-400 tracking-[0.2em] italic">
                ⚜ COMBINE REAGENTS · BREW POTIONS ⚜
              </div>
              <div className="text-xs text-amber-100/70 italic mt-1">
                Reagents are harvested from plants and chests in the dungeon.
              </div>
            </div>
          </div>
          <button onClick={() => setScreen('inventory')} className="px-3 py-2 rounded text-xs italic border-2 border-emerald-700 text-emerald-300 hover:bg-emerald-900/30"
            style={{ background: 'rgba(6, 78, 59, 0.45)' }}>
            ← Back to The Hoard
          </button>
        </div>
      </div>

      {/* Ingredient inventory ribbon */}
      <div className="p-4 rounded" style={{
        background: 'linear-gradient(135deg, rgba(31, 12, 41, 0.6) 0%, rgba(10, 6, 4, 0.95) 100%)',
        border: '2px solid rgba(126, 34, 206, 0.4)',
      }}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-base">🧺</span>
          <h4 className="text-xs font-bold italic text-amber-200 tracking-wider">Reagents on hand</h4>
          <div className="flex-1 h-px bg-gradient-to-r from-amber-700/40 to-transparent" />
          <span className="text-[10px] italic text-amber-700">{ownedIngredients.length}/{ingredients.length} kinds</span>
        </div>
        {ownedIngredients.length === 0 ? (
          <p className="text-xs italic text-amber-700/80">
            Thy basket lies empty. Walk over plants in the dungeon to gather what thou needest.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {ownedIngredients.map(it => (
              <div key={it.id} className="px-2 py-1 rounded flex items-center gap-1 text-xs italic"
                   style={{
                     background: 'rgba(0,0,0,0.4)',
                     border: '1px solid rgba(120,53,15,0.4)',
                     color: '#fde68a',
                   }}>
                <span>{it.icon}</span>
                <span>{it.name}</span>
                <span className="text-amber-300 font-bold">×{it.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recipe cards */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📜</span>
          <h3 className="text-lg font-bold text-amber-200 italic tracking-wider" style={{ textShadow: '0 0 8px rgba(245, 158, 11, 0.3)' }}>
            Known Recipes
          </h3>
          <div className="flex-1 h-px bg-gradient-to-r from-amber-700/50 to-transparent" />
          <span className="text-xs text-amber-700 italic">{RECIPES.length} brews</span>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          {RECIPES.map(recipe => {
            const result = findItem(recipe.resultId);
            const canCraft = Object.entries(recipe.ingredients).every(([id, n]) => ingredientHave(id) >= n);
            const ownedResult = inv[recipe.resultId] || 0;
            const isFlash = feedback && feedback.recipeId === recipe.id;
            return (
              <div key={recipe.id} className="p-4 rounded relative" style={{
                background: 'linear-gradient(135deg, rgba(20, 30, 24, 0.7) 0%, rgba(10, 6, 4, 0.95) 100%)',
                border: `2px solid ${canCraft ? 'rgba(34, 197, 94, 0.55)' : 'rgba(120, 53, 15, 0.4)'}`,
                boxShadow: canCraft ? '0 0 14px rgba(34, 197, 94, 0.18)' : 'inset 0 0 12px rgba(0,0,0,0.4)',
              }}>
                <div className="flex items-start gap-3 mb-3">
                  <div className="text-3xl">{result?.icon || recipe.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <h4 className="font-bold text-amber-200 italic text-sm">{recipe.name}</h4>
                      <span className="text-[10px] italic text-amber-700">Owned ×{ownedResult}</span>
                    </div>
                    <p className="text-[11px] italic text-amber-100/70 mt-0.5">{result?.description}</p>
                  </div>
                </div>
                <div className="space-y-1 mb-3">
                  {Object.entries(recipe.ingredients).map(([id, n]) => {
                    const ing = findItem(id);
                    const have = ingredientHave(id);
                    const enough = have >= n;
                    return (
                      <div key={id} className="flex items-center justify-between text-xs italic">
                        <div className="flex items-center gap-1">
                          <span>{ing?.icon || '🌿'}</span>
                          <span className={enough ? 'text-amber-200' : 'text-rose-300/80'}>
                            {ing?.name || id}
                          </span>
                        </div>
                        <span className={`tabular-nums font-bold ${enough ? 'text-emerald-300' : 'text-rose-300'}`}>
                          {have}/{n}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={() => tryCraft(recipe)}
                  disabled={!canCraft}
                  className="w-full px-3 py-2 rounded text-xs italic font-bold"
                  style={{
                    background: canCraft
                      ? 'linear-gradient(to bottom, #34d399 0%, #059669 100%)'
                      : 'rgba(31,17,8,0.5)',
                    border: canCraft ? '2px solid #6ee7b7' : '1px solid rgba(120,53,15,0.4)',
                    color: canCraft ? '#022c22' : '#52443a',
                    cursor: canCraft ? 'pointer' : 'not-allowed',
                    boxShadow: canCraft ? '0 0 10px rgba(16,185,129,0.4)' : 'none',
                  }}
                >
                  {canCraft ? 'Brew' : 'Missing reagents'}
                </button>
                {isFlash && (
                  <div className="text-[10px] italic mt-1 text-rose-300">{feedback.text}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Reusable card for daily and weekly quests (identical visual treatment).
function QuestCard({ q, onClaim }) {
  const pct = Math.min(100, (q.progress / q.target) * 100);
  const goldReward = Math.max(1, Math.floor(q.xp * 0.1));
  return (
    <div className="p-5 rounded relative" style={{
      background: q.claimed
        ? 'linear-gradient(135deg, rgba(6, 78, 59, 0.5) 0%, rgba(10, 6, 4, 0.9) 100%)'
        : q.claimable
          ? 'linear-gradient(135deg, rgba(120, 53, 15, 0.6) 0%, rgba(41, 24, 12, 0.95) 100%)'
          : 'linear-gradient(135deg, rgba(31, 12, 41, 0.7) 0%, rgba(10, 6, 4, 0.95) 100%)',
      border: q.claimed
        ? '2px solid rgba(16, 185, 129, 0.6)'
        : q.claimable
          ? '3px double rgba(245, 158, 11, 0.8)'
          : '2px solid rgba(126, 34, 206, 0.5)',
      boxShadow: q.claimable
        ? '0 0 25px rgba(245, 158, 11, 0.4), inset 0 0 20px rgba(0,0,0,0.5)'
        : q.claimed
          ? '0 0 15px rgba(16, 185, 129, 0.2), inset 0 0 20px rgba(0,0,0,0.5)'
          : '0 0 15px rgba(168, 85, 247, 0.15), inset 0 0 20px rgba(0,0,0,0.5)',
    }}>
      <div className="absolute top-1 left-1 text-amber-700/60 text-xs">⚜</div>
      <div className="absolute top-1 right-1 text-amber-700/60 text-xs">⚜</div>
      <div className="absolute bottom-1 left-1 text-amber-700/60 text-xs">⚜</div>
      <div className="absolute bottom-1 right-1 text-amber-700/60 text-xs">⚜</div>

      <div className="flex items-start gap-3 mb-3">
        <div className="text-3xl flex-shrink-0">{q.icon}</div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-amber-200 italic text-sm" style={{ textShadow: '0 0 6px rgba(245, 158, 11, 0.3)' }}>
            {q.title}
          </h3>
          <p className="text-xs text-amber-100/70 italic">
            {q.description.replace('{target}', q.target)}
          </p>
        </div>
        {q.claimed && (
          <CheckCircle2 className="w-6 h-6 text-emerald-400 flex-shrink-0" style={{ filter: 'drop-shadow(0 0 6px rgba(16, 185, 129, 0.6))' }} />
        )}
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-amber-700 italic">Progress</span>
          <span className={q.claimable ? 'text-amber-300 font-bold' : 'text-amber-100/70'}>
            {q.progress}/{q.target}
          </span>
        </div>
        <div className="h-2 rounded-full overflow-hidden border border-amber-800" style={{ background: 'rgba(10, 6, 4, 0.7)' }}>
          <div className="h-full transition-all duration-500" style={{
            width: `${pct}%`,
            background: q.claimed
              ? 'linear-gradient(to right, #10b981, #34d399)'
              : q.claimable
                ? 'linear-gradient(to right, #f59e0b, #fde047)'
                : 'linear-gradient(to right, #a855f7, #d8b4fe)',
            boxShadow: q.claimable ? '0 0 8px rgba(245, 158, 11, 0.6)' : 'none',
          }} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-purple-300 italic flex items-center gap-2 flex-wrap">
          <span>✦ Reward:</span>
          <span className="text-amber-300 font-bold">+{q.xp} XP</span>
          <span className="text-amber-700">•</span>
          <span className="text-amber-300 font-bold inline-flex items-center gap-0.5">
            <Coins className="w-3 h-3" /> +{goldReward}
          </span>
        </div>
        {q.claimed ? (
          <span className="text-xs text-emerald-400 italic font-bold flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> CLAIMED
          </span>
        ) : q.claimable ? (
          <button
            onClick={() => onClaim(q.id)}
            className="px-3 py-1.5 rounded text-xs font-bold text-amber-950 border-2 border-amber-300 italic flex items-center gap-1 hover:scale-105 active:scale-95 transition"
            style={{
              background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
              boxShadow: '0 0 12px rgba(245, 158, 11, 0.5)',
            }}
          >
            <Gift className="w-3 h-3" /> Claim
          </button>
        ) : (
          <span className="text-xs text-amber-700/70 italic flex items-center gap-1">
            <Clock className="w-3 h-3" /> In Progress
          </span>
        )}
      </div>
    </div>
  );
}

// One section of the Quest Board (daily OR weekly). Header card + card grid.
function QuestSection({ tagline, subtitle, emptyMsg, quests, onClaim, onClaimAll, claimableCount }) {
  const completed = quests.filter(q => q.claimed).length;
  const totalXp = quests.reduce((s, q) => s + (q.claimed ? q.xp : 0), 0);
  const possibleXp = quests.reduce((s, q) => s + q.xp, 0);

  return (
    <div className="space-y-4">
      <div className="p-5 rounded relative flex items-center justify-between flex-wrap gap-3" style={{
        background: 'linear-gradient(135deg, rgba(31, 12, 41, 0.7) 0%, rgba(10, 6, 4, 0.95) 100%)',
        border: '2px solid rgba(168, 85, 247, 0.5)',
        boxShadow: '0 0 25px rgba(168, 85, 247, 0.15), inset 0 0 20px rgba(0,0,0,0.5)',
      }}>
        <div className="absolute top-1 left-1 text-purple-400/60 text-xs">⚜</div>
        <div className="absolute top-1 right-1 text-purple-400/60 text-xs">⚜</div>
        <div className="absolute bottom-1 left-1 text-purple-400/60 text-xs">⚜</div>
        <div className="absolute bottom-1 right-1 text-purple-400/60 text-xs">⚜</div>
        <div>
          <div className="text-xs text-purple-400 tracking-[0.2em] italic">{subtitle}</div>
          <div className="text-xs text-amber-100/70 italic mt-1">
            {completed}/{quests.length} claimed • {totalXp}/{possibleXp} XP earned
          </div>
        </div>
        {claimableCount > 0 && (
          <button
            onClick={onClaimAll}
            className="px-4 py-2 rounded text-sm font-bold border-2 border-amber-300 italic flex items-center gap-2 text-amber-950"
            style={{
              background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
              boxShadow: '0 0 20px rgba(245, 158, 11, 0.5)',
            }}
          >
            <Gift className="w-4 h-4" /> Claim All ({claimableCount})
          </button>
        )}
      </div>

      <p className="text-amber-100/70 italic text-sm">{tagline}</p>

      {quests.length === 0 ? (
        <div className="text-center py-12 text-amber-700 italic">{emptyMsg}</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {quests.map(q => <QuestCard key={q.id} q={q} onClaim={onClaim} />)}
        </div>
      )}
    </div>
  );
}

// One step of a story chain. Three visual states: claimed (narrative revealed),
// current (title + progress, narrative hidden), locked (sealed).
function StoryStepCard({ step, idx, status, claimable, progress, target, isFinal, chainBonusXp, chainBonusGold, onClaim }) {
  // status: 'claimed' | 'current' | 'locked'
  const isClaimed = status === 'claimed';
  const isCurrent = status === 'current';
  const isLocked = status === 'locked';
  const pct = target > 0 ? Math.min(100, (progress / target) * 100) : 0;
  const stepGold = Math.max(1, Math.floor(step.xp * 0.1));
  const totalXp = step.xp + (isFinal && chainBonusXp ? chainBonusXp : 0);
  const goldReward = isFinal ? stepGold + (chainBonusGold || 0) : stepGold;

  const bg = isClaimed
    ? 'linear-gradient(135deg, rgba(6, 78, 59, 0.5) 0%, rgba(10, 6, 4, 0.9) 100%)'
    : isCurrent && claimable
      ? 'linear-gradient(135deg, rgba(120, 53, 15, 0.6) 0%, rgba(41, 24, 12, 0.95) 100%)'
      : isCurrent
        ? 'linear-gradient(135deg, rgba(31, 12, 41, 0.7) 0%, rgba(10, 6, 4, 0.95) 100%)'
        : 'linear-gradient(135deg, rgba(15, 8, 20, 0.6) 0%, rgba(10, 6, 4, 0.95) 100%)';
  const border = isClaimed
    ? '2px solid rgba(16, 185, 129, 0.6)'
    : isCurrent && claimable
      ? '3px double rgba(245, 158, 11, 0.8)'
      : isCurrent
        ? '2px solid rgba(168, 85, 247, 0.55)'
        : '1px solid rgba(60, 35, 80, 0.45)';
  const shadow = isClaimed
    ? '0 0 15px rgba(16, 185, 129, 0.2), inset 0 0 20px rgba(0,0,0,0.5)'
    : isCurrent && claimable
      ? '0 0 25px rgba(245, 158, 11, 0.4), inset 0 0 20px rgba(0,0,0,0.5)'
      : isCurrent
        ? '0 0 15px rgba(168, 85, 247, 0.25), inset 0 0 20px rgba(0,0,0,0.5)'
        : 'inset 0 0 20px rgba(0,0,0,0.5)';

  return (
    <div className="p-4 rounded relative" style={{ background: bg, border, boxShadow: shadow }}>
      <div className="absolute top-1 left-1 text-amber-700/60 text-xs">⚜</div>
      <div className="absolute top-1 right-1 text-amber-700/60 text-xs">⚜</div>
      <div className="absolute bottom-1 left-1 text-amber-700/60 text-xs">⚜</div>
      <div className="absolute bottom-1 right-1 text-amber-700/60 text-xs">⚜</div>

      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-9 h-9 rounded-full border-2 flex items-center justify-center text-xs font-bold italic" style={{
          borderColor: isClaimed ? 'rgba(16, 185, 129, 0.7)' : isCurrent ? 'rgba(245, 158, 11, 0.7)' : 'rgba(60, 35, 80, 0.6)',
          background: isClaimed ? 'rgba(6, 78, 59, 0.6)' : isCurrent ? 'rgba(120, 53, 15, 0.5)' : 'rgba(10, 6, 4, 0.7)',
          color: isClaimed ? '#34d399' : isCurrent ? '#fde047' : '#6b4f8f',
        }}>
          {isClaimed ? <Check className="w-4 h-4" /> : isLocked ? <Lock className="w-3.5 h-3.5" /> : (idx + 1)}
        </div>

        <div className="flex-1 min-w-0">
          <h4 className={`font-bold italic text-sm ${isLocked ? 'text-amber-700/70' : 'text-amber-200'}`}
              style={!isLocked ? { textShadow: '0 0 6px rgba(245, 158, 11, 0.3)' } : undefined}>
            {isLocked ? '— Sealed Until the Path Opens —' : step.title}
            {isFinal && !isLocked && (
              <span className="ml-2 text-xs text-purple-300">✦ FINAL</span>
            )}
          </h4>

          {(isClaimed || isCurrent) && step.narrative && (
            <p className={`text-xs italic mt-2 leading-relaxed ${isCurrent ? 'text-amber-100/85' : 'text-amber-100/80'}`}>
              {step.narrative}
            </p>
          )}

          {isCurrent && (
            <>
              <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold italic" style={{
                background: 'linear-gradient(to bottom, rgba(120, 53, 15, 0.4), rgba(41, 24, 12, 0.7))',
                border: '1px solid rgba(245, 158, 11, 0.5)',
                color: '#fde047',
              }}>
                ✦ Task: {formatStoryAction(step.counter, step.target)}
              </div>
              <div className="mt-3">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-amber-700 italic">Progress</span>
                  <span className={claimable ? 'text-amber-300 font-bold' : 'text-amber-100/70'}>
                    {progress}/{target}
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden border border-amber-800" style={{ background: 'rgba(10, 6, 4, 0.7)' }}>
                  <div className="h-full transition-all duration-500" style={{
                    width: `${pct}%`,
                    background: claimable ? 'linear-gradient(to right, #f59e0b, #fde047)' : 'linear-gradient(to right, #a855f7, #d8b4fe)',
                    boxShadow: claimable ? '0 0 8px rgba(245, 158, 11, 0.6)' : 'none',
                  }} />
                </div>
              </div>
            </>
          )}

          <div className="flex items-center justify-between gap-2 mt-3">
            <div className={`text-xs italic flex items-center gap-2 flex-wrap ${isLocked ? 'text-amber-700/50' : 'text-purple-300'}`}>
              <span>✦ Reward:</span>
              <span className={isLocked ? 'text-amber-700/60' : 'text-amber-300 font-bold'}>+{step.xp} XP</span>
              <span className={isLocked ? 'text-amber-700/40' : 'text-amber-700'}>•</span>
              <span className={`font-bold inline-flex items-center gap-0.5 ${isLocked ? 'text-amber-700/60' : 'text-amber-300'}`}>
                <Coins className="w-3 h-3" /> +{goldReward}
              </span>
              {isFinal && chainBonusXp > 0 && !isLocked && (
                <span className="text-purple-300/80">(includes chain bonus)</span>
              )}
            </div>
            {isClaimed ? (
              <span className="text-xs text-emerald-400 italic font-bold">CLAIMED</span>
            ) : claimable && isCurrent ? (
              <button
                onClick={onClaim}
                className="px-3 py-1.5 rounded text-xs font-bold text-amber-950 border-2 border-amber-300 italic flex items-center gap-1"
                style={{
                  background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
                  boxShadow: '0 0 12px rgba(245, 158, 11, 0.5)',
                }}
              >
                <Gift className="w-3 h-3" /> Claim
              </button>
            ) : isCurrent ? (
              <span className="text-xs text-amber-700 italic">In Progress...</span>
            ) : (
              <span className="text-xs text-amber-700/60 italic">Sealed</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// One full story chain: header card with chain title/reward + ordered list of step cards.
function StoryChainView({ chainStatus, onClaimStep }) {
  const { chain, stepIndex, progress, target, claimable, completed, claimedSteps } = chainStatus;
  const totalSteps = chain.steps.length;
  const stepsDone = Math.min(stepIndex, totalSteps);

  return (
    <div className="space-y-4">
      <div className="p-5 rounded relative" style={{
        background: completed
          ? 'linear-gradient(135deg, rgba(120, 53, 15, 0.55) 0%, rgba(10, 6, 4, 0.95) 100%)'
          : 'linear-gradient(135deg, rgba(31, 12, 41, 0.7) 0%, rgba(10, 6, 4, 0.95) 100%)',
        border: completed ? '3px double rgba(245, 158, 11, 0.7)' : '2px solid rgba(126, 34, 206, 0.5)',
        boxShadow: completed
          ? '0 0 25px rgba(245, 158, 11, 0.3), inset 0 0 20px rgba(0,0,0,0.5)'
          : '0 0 15px rgba(168, 85, 247, 0.15), inset 0 0 20px rgba(0,0,0,0.5)',
      }}>
        <div className="absolute top-1 left-1 text-amber-700/60 text-xs">⚜</div>
        <div className="absolute top-1 right-1 text-amber-700/60 text-xs">⚜</div>
        <div className="absolute bottom-1 left-1 text-amber-700/60 text-xs">⚜</div>
        <div className="absolute bottom-1 right-1 text-amber-700/60 text-xs">⚜</div>

        <div className="flex items-start gap-4">
          <div className="text-5xl flex-shrink-0">{chain.icon}</div>
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-bold text-amber-200 italic" style={{ textShadow: '0 0 8px rgba(245, 158, 11, 0.4)' }}>
              {chain.title}
            </h3>
            <p className="text-xs text-amber-100/70 italic mt-1">{chain.description}</p>
            <div className="mt-3 flex items-center gap-4 flex-wrap text-xs">
              <span className="text-purple-300 italic">
                Progress: <span className="text-amber-300 font-bold">{stepsDone}/{totalSteps} steps</span>
              </span>
              {chain.rewardTitleId && SPECIAL_TITLES[chain.rewardTitleId] && (
                <span className="text-purple-300 italic">
                  ✦ Title Reward: <span className="text-amber-300 font-bold">{SPECIAL_TITLES[chain.rewardTitleId].name}</span>
                </span>
              )}
              {chain.rewardXp > 0 && (
                <span className="text-purple-300 italic">
                  ✦ Bonus XP: <span className="text-amber-300 font-bold">+{chain.rewardXp}</span>
                </span>
              )}
              {(chain.rewardGold ?? Math.floor((chain.rewardXp || 0) * 0.1)) > 0 && (
                <span className="text-purple-300 italic inline-flex items-center gap-1">
                  ✦ Bonus
                  <span className="text-amber-300 font-bold inline-flex items-center gap-0.5">
                    <Coins className="w-3 h-3" /> +{chain.rewardGold ?? Math.floor((chain.rewardXp || 0) * 0.1)}
                  </span>
                </span>
              )}
            </div>
            <div className="h-1.5 rounded-full overflow-hidden border border-amber-800 mt-3" style={{ background: 'rgba(10, 6, 4, 0.7)' }}>
              <div className="h-full transition-all duration-500" style={{
                width: `${(stepsDone / totalSteps) * 100}%`,
                background: completed
                  ? 'linear-gradient(to right, #f59e0b, #fde047)'
                  : 'linear-gradient(to right, #a855f7, #d8b4fe)',
                boxShadow: completed ? '0 0 8px rgba(245, 158, 11, 0.6)' : 'none',
              }} />
            </div>
            {completed && (
              <div className="mt-3 text-emerald-400 italic font-bold flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Chain Complete — the path lies behind thee.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {chain.steps.map((step, idx) => {
          const status = completed || idx < stepIndex
            ? 'claimed'
            : idx === stepIndex
              ? 'current'
              : 'locked';
          const isFinal = step.finalStep || idx === totalSteps - 1;
          return (
            <StoryStepCard
              key={step.id}
              step={step}
              idx={idx}
              status={status}
              claimable={status === 'current' && claimable}
              progress={status === 'current' ? progress : 0}
              target={status === 'current' ? target : 0}
              isFinal={isFinal}
              chainBonusXp={chain.rewardXp || 0}
              chainBonusGold={chain.rewardGold ?? Math.floor((chain.rewardXp || 0) * 0.1)}
              onClaim={() => onClaimStep(chain.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

function QuestBoard({
  dailyQuests, dailyDate, onClaimDaily, onClaimAllDaily,
  weeklyQuests, weekStart, onClaimWeekly, onClaimAllWeekly,
  storyChains, onClaimStoryStep,
}) {
  const [activeTab, setActiveTab] = useState('daily');

  const dailyClaimable = dailyQuests.filter(q => q.claimable).length;
  const weeklyClaimable = weeklyQuests.filter(q => q.claimable).length;
  const storyClaimable = storyChains.filter(s => s.claimable).length;
  const totalClaimable = dailyClaimable + weeklyClaimable + storyClaimable;

  const tabs = [
    { id: 'daily', label: 'Daily', icon: '☀', claimable: dailyClaimable },
    { id: 'weekly', label: 'Weekly', icon: '🌙', claimable: weeklyClaimable },
    { id: 'story', label: 'Story', icon: '🌟', claimable: storyClaimable },
  ];

  return (
    <div className="space-y-6">
      {/* Top brand header */}
      <div className="p-6 rounded relative" style={{
        background: 'linear-gradient(135deg, rgba(31, 12, 41, 0.7) 0%, rgba(10, 6, 4, 0.95) 100%)',
        border: '3px double rgba(168, 85, 247, 0.6)',
        boxShadow: '0 0 40px rgba(168, 85, 247, 0.2), inset 0 0 30px rgba(0,0,0,0.5)',
      }}>
        <div className="absolute top-2 left-2 text-purple-400 text-sm">⚜</div>
        <div className="absolute top-2 right-2 text-purple-400 text-sm">⚜</div>
        <div className="absolute bottom-2 left-2 text-purple-400 text-sm">⚜</div>
        <div className="absolute bottom-2 right-2 text-purple-400 text-sm">⚜</div>

        <div className="flex items-center gap-3">
          <ScrollText className="w-10 h-10 text-purple-300" style={{ filter: 'drop-shadow(0 0 10px rgba(168, 85, 247, 0.6))' }} />
          <div>
            <h2 className="text-2xl font-bold text-purple-200 italic" style={{ textShadow: '0 0 12px rgba(168, 85, 247, 0.4)' }}>
              The Quest Board
            </h2>
            <div className="text-xs text-purple-400 tracking-[0.2em] italic">
              ⚜ DAILY • WEEKLY • STORY ⚜
            </div>
            {totalClaimable > 0 && (
              <div className="text-xs text-amber-300 italic mt-1 font-bold animate-pulse">
                {totalClaimable} reward{totalClaimable === 1 ? '' : 's'} await thy hand
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tab buttons */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className="px-5 py-2.5 rounded font-bold italic text-sm border-2 flex items-center gap-2 transition"
            style={{
              borderColor: activeTab === t.id ? 'rgba(245, 158, 11, 0.85)' : 'rgba(126, 34, 206, 0.5)',
              background: activeTab === t.id
                ? 'linear-gradient(to bottom, rgba(120, 53, 15, 0.6), rgba(41, 24, 12, 0.95))'
                : 'rgba(31, 12, 41, 0.5)',
              color: activeTab === t.id ? '#fde047' : '#d8b4fe',
              boxShadow: activeTab === t.id ? '0 0 15px rgba(245, 158, 11, 0.35)' : 'none',
            }}
          >
            <span>{t.icon}</span>
            {t.label}
            {t.claimable > 0 && (
              <span className="bg-amber-500 text-amber-950 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center border border-amber-300 animate-pulse">
                {t.claimable}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'daily' && (
        <QuestSection
          subtitle={`⚜ DAILY QUESTS — ${dailyDate || '...'} ⚜`}
          tagline={'"Every dawn brings new quests, brave scholar. Complete them to earn experience and grow stronger. Quests refresh at midnight."'}
          emptyMsg="The board is bare — return on the morrow for new quests."
          quests={dailyQuests}
          onClaim={onClaimDaily}
          onClaimAll={onClaimAllDaily}
          claimableCount={dailyClaimable}
        />
      )}
      {activeTab === 'weekly' && (
        <QuestSection
          subtitle={`⚜ WEEKLY QUESTS — Week of ${weekStart || '...'} ⚜`}
          tagline={'"Greater trials, greater glory. These quests demand the labor of seven days — undertake them with patience, and the rewards shall be plentiful. Refreshes each Monday."'}
          emptyMsg="No weekly trials are posted — return when the week renews."
          quests={weeklyQuests}
          onClaim={onClaimWeekly}
          onClaimAll={onClaimAllWeekly}
          claimableCount={weeklyClaimable}
        />
      )}
      {activeTab === 'story' && (
        <div className="space-y-6">
          <p className="text-amber-100/70 italic text-sm">
            "Behold the great chronicles, scholar. Each path is long, each step a verse — walk them, and the legend of thy ascent shall be written in starlight."
          </p>
          {storyChains.length === 0 ? (
            <div className="text-center py-12 text-amber-700 italic">No chronicles have yet begun.</div>
          ) : (
            storyChains.map(cs => (
              <StoryChainView key={cs.chain.id} chainStatus={cs} onClaimStep={onClaimStoryStep} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function WelcomeModal({ onStart, onSkip }) {
  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur z-50 flex items-center justify-center p-4">
      <div className="rounded max-w-2xl w-full overflow-hidden flex flex-col relative" style={{
        background: 'linear-gradient(135deg, rgba(41, 24, 12, 0.99) 0%, rgba(10, 6, 4, 1) 100%)',
        border: '4px double rgba(245, 158, 11, 0.7)',
        boxShadow: '0 0 60px rgba(245, 158, 11, 0.4)',
      }}>
        <div className="absolute top-2 left-2 text-amber-500 text-lg">⚜</div>
        <div className="absolute top-2 right-2 text-amber-500 text-lg">⚜</div>
        <div className="absolute bottom-2 left-2 text-amber-500 text-lg">⚜</div>
        <div className="absolute bottom-2 right-2 text-amber-500 text-lg">⚜</div>

        <div className="p-8 text-center space-y-4">
          <Castle className="w-20 h-20 mx-auto text-amber-400" style={{ filter: 'drop-shadow(0 0 16px rgba(245, 158, 11, 0.8))' }} />
          <h2 className="text-3xl font-bold tracking-wider" style={{
            background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 50%, #92400e 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            textShadow: '0 0 20px rgba(245, 158, 11, 0.4)',
          }}>
            ⚔ WELCOME, BRAVE SCHOLAR ⚔
          </h2>
          <p className="text-amber-100/80 italic leading-relaxed">
            "Long has the realm awaited thy arrival. Within these halls, knowledge becomes adventure — riddles become quests, scrolls become spells of memory, and every studied page brings thee closer to mastery."
          </p>
          <p className="text-amber-100/70 italic text-sm">
            Wouldst thou follow the path of the Scholar's Awakening? A fourteen-step tutorial shall guide thee through each of these sacred halls. Or thou mayest set forth alone, if thy spirit demands it.
          </p>
          <div className="text-xs text-amber-700 italic mt-4">
            ✦ Completing the Awakening grants the title <span className="text-amber-300 font-bold">The Initiated</span> ✦
          </div>
        </div>
        <div className="p-4 border-t border-amber-700/50 flex gap-2">
          <button onClick={onSkip} className="flex-1 py-3 rounded border-2 border-amber-700 text-amber-200 italic"
            style={{ background: 'rgba(41, 24, 12, 0.7)' }}>
            Walk Alone
          </button>
          <button onClick={onStart} className="flex-1 py-3 font-bold rounded flex items-center justify-center gap-2 text-amber-950 border-2 border-amber-300 italic"
            style={{ background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)', boxShadow: '0 0 20px rgba(245, 158, 11, 0.5)' }}>
            <Compass className="w-4 h-4" /> Begin the Awakening
          </button>
        </div>
      </div>
    </div>
  );
}

function TutorialPanel({ stepIndex, collapsed, onToggle, onAdvance, onSkip, onAction }) {
  const step = TUTORIAL_STEPS[stepIndex];
  if (!step) return null;
  const progress = ((stepIndex + 1) / TUTORIAL_STEPS.length) * 100;

  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-sm w-full md:w-96" style={{ pointerEvents: 'auto' }}>
      <div className="rounded relative" style={{
        background: 'linear-gradient(135deg, rgba(31, 12, 41, 0.97) 0%, rgba(10, 6, 4, 0.99) 100%)',
        border: '3px double rgba(168, 85, 247, 0.7)',
        boxShadow: '0 0 30px rgba(168, 85, 247, 0.4), inset 0 0 20px rgba(0,0,0,0.5)',
      }}>
        <div className="absolute top-1 left-1 text-purple-400/60 text-xs">⚜</div>
        <div className="absolute top-1 right-1 text-purple-400/60 text-xs">⚜</div>
        <div className="absolute bottom-1 left-1 text-purple-400/60 text-xs">⚜</div>
        <div className="absolute bottom-1 right-1 text-purple-400/60 text-xs">⚜</div>

        <button
          onClick={onToggle}
          className="w-full flex items-center justify-between p-3 hover:bg-purple-900/20"
        >
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-purple-400" style={{ filter: 'drop-shadow(0 0 6px rgba(168, 85, 247, 0.6))' }} />
            <span className="text-xs text-purple-300 italic tracking-widest">
              ⚜ THE AWAKENING — {stepIndex + 1}/{TUTORIAL_STEPS.length}
            </span>
          </div>
          {collapsed ? <ChevronUp className="w-4 h-4 text-purple-400" /> : <ChevronDown className="w-4 h-4 text-purple-400" />}
        </button>

        {!collapsed && (
          <div className="px-4 pb-4 space-y-3">
            <div className="h-1.5 rounded-full overflow-hidden border border-purple-800" style={{ background: 'rgba(10, 6, 4, 0.7)' }}>
              <div className="h-full transition-all" style={{
                width: `${progress}%`,
                background: 'linear-gradient(to right, #a855f7, #d8b4fe)',
                boxShadow: '0 0 8px rgba(168, 85, 247, 0.6)',
              }} />
            </div>

            <h4 className="font-bold text-purple-200 italic text-sm" style={{ textShadow: '0 0 8px rgba(168, 85, 247, 0.4)' }}>
              {step.title}
            </h4>
            <p className="text-xs text-amber-100/80 italic leading-relaxed">{step.description}</p>

            {step.xp && (
              <div className="text-[10px] text-purple-400 italic">
                ✦ Reward: +{step.xp} XP{stepIndex === TUTORIAL_STEPS.length - 1 && ' + The Initiated title'}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              {step.autoComplete ? (
                step.actionLabel ? (
                  <button
                    onClick={() => onAction(step.id)}
                    className="flex-1 py-2 rounded text-sm font-bold text-amber-50 border-2 border-purple-300 italic"
                    style={{ background: 'linear-gradient(to bottom, #a855f7 0%, #6b21a8 100%)', boxShadow: '0 0 12px rgba(168, 85, 247, 0.4)' }}
                  >
                    {step.actionLabel}
                  </button>
                ) : (
                  <div className="flex-1 py-2 px-3 rounded text-xs italic text-purple-300 text-center" style={{
                    background: 'rgba(31, 12, 41, 0.6)', border: '1px dashed rgba(168, 85, 247, 0.5)',
                  }}>
                    {step.completionLabel}
                  </div>
                )
              ) : (
                <button
                  onClick={() => {
                    if (step.actionLabel) onAction(step.id);
                    onAdvance(step.id);
                  }}
                  className="flex-1 py-2 rounded text-sm font-bold text-amber-50 border-2 border-purple-300 italic"
                  style={{ background: 'linear-gradient(to bottom, #a855f7 0%, #6b21a8 100%)', boxShadow: '0 0 12px rgba(168, 85, 247, 0.4)' }}
                >
                  {step.completionLabel}
                </button>
              )}
              <button
                onClick={onSkip}
                className="px-3 py-2 rounded text-xs border-2 border-amber-700 text-amber-300 hover:bg-amber-900/30 italic"
                style={{ background: 'rgba(41, 24, 12, 0.7)' }}
                title="Skip the tutorial — thy path is thine own"
              >
                Skip
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ShareTomeModal({ tome, onClose }) {
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef(null);
  const code = useMemo(() => tome ? encodeTomeShareCode(tome.data) : null, [tome]);

  const copy = () => {
    if (!code) return;
    let success = false;
    try {
      const ta = textareaRef.current;
      if (ta) { ta.focus(); ta.select(); try { success = document.execCommand('copy'); } catch { success = false; } }
    } catch { success = false; }
    if (!success && navigator.clipboard) {
      navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {});
      return;
    }
    setCopied(success);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!tome) return null;

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur z-50 flex items-center justify-center p-4">
      <div className="rounded max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col relative" style={{
        background: 'linear-gradient(135deg, rgba(31, 12, 41, 0.97) 0%, rgba(10, 6, 4, 0.99) 100%)',
        border: '3px double rgba(168, 85, 247, 0.6)',
        boxShadow: '0 0 40px rgba(168, 85, 247, 0.3)',
      }}>
        <div className="absolute top-2 left-2 text-purple-400 text-sm">⚜</div>
        <div className="absolute top-2 right-2 text-purple-400 text-sm">⚜</div>
        <div className="absolute bottom-2 left-2 text-purple-400 text-sm">⚜</div>
        <div className="absolute bottom-2 right-2 text-purple-400 text-sm">⚜</div>

        <div className="p-4 border-b border-purple-700/50 flex justify-between items-center">
          <h3 className="text-xl font-bold text-purple-300 flex items-center gap-2 italic">
            <Share2 className="w-5 h-5" /> ✦ Share Thy Tome ✦
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-purple-900/30 rounded text-purple-300">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-3">
          <p className="text-sm text-amber-100/80 italic">
            "Below is the sacred share code for <span className="text-amber-300 font-bold">{tome.data.metadata.title}</span>. Share it with fellow scholars — they may import it via the Hash sigil to receive the tome."
          </p>
          <div className="text-xs text-purple-400 italic">
            Code length: {code?.length || 0} characters
          </div>
          <textarea
            ref={textareaRef}
            value={code || ''}
            readOnly
            className="flex-1 min-h-[200px] p-3 rounded border-2 focus:outline-none text-amber-50 font-mono text-xs"
            style={{
              background: 'rgba(10, 6, 4, 0.7)',
              borderColor: 'rgba(126, 34, 206, 0.5)',
              fontFamily: 'monospace',
              wordBreak: 'break-all',
            }}
            onFocus={(e) => e.target.select()}
          />
          <p className="text-xs text-amber-700 italic">
            ⚠ Note: The code contains the entire tome's contents. Larger tomes produce longer codes — for very large tomes, sharing the JSON file directly may be more practical.
          </p>
        </div>
        <div className="p-4 border-t border-purple-700/50 flex gap-2">
          <button onClick={onClose} className="px-6 py-3 rounded border-2 border-amber-700 text-amber-200 italic" style={{ background: 'rgba(41, 24, 12, 0.7)' }}>Close</button>
          <button onClick={copy} className="flex-1 py-3 font-bold rounded flex items-center justify-center gap-2 text-amber-50 border-2 border-purple-300 italic"
            style={{ background: 'linear-gradient(to bottom, #a855f7 0%, #6b21a8 100%)', boxShadow: '0 0 20px rgba(168, 85, 247, 0.5)' }}>
            {copied ? <><Check className="w-4 h-4" /> Inscribed!</> : <><Copy className="w-4 h-4" /> Copy Share Code</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportCodeModal({ onClose, onSubmit }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!text.trim()) {
      setError('Paste the share code first');
      return;
    }
    const success = onSubmit(text);
    if (success) onClose();
    else setError('Could not decode — make sure the entire code (starting with TOME-V1:) is pasted');
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur z-50 flex items-center justify-center p-4">
      <div className="rounded max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col relative" style={{
        background: 'linear-gradient(135deg, rgba(31, 12, 41, 0.97) 0%, rgba(10, 6, 4, 0.99) 100%)',
        border: '3px double rgba(168, 85, 247, 0.6)',
        boxShadow: '0 0 40px rgba(168, 85, 247, 0.3)',
      }}>
        <div className="absolute top-2 left-2 text-purple-400 text-sm">⚜</div>
        <div className="absolute top-2 right-2 text-purple-400 text-sm">⚜</div>
        <div className="absolute bottom-2 left-2 text-purple-400 text-sm">⚜</div>
        <div className="absolute bottom-2 right-2 text-purple-400 text-sm">⚜</div>

        <div className="p-4 border-b border-purple-700/50 flex justify-between items-center">
          <h3 className="text-xl font-bold text-purple-300 flex items-center gap-2 italic">
            <Hash className="w-5 h-5" /> ✦ Import Share Code ✦
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-purple-900/30 rounded text-purple-300">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-3">
          <p className="text-sm text-amber-100/80 italic">
            "Paste the sacred share code from a fellow scholar below. The code shall be deciphered and the tome added to thy library."
          </p>
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setError(''); }}
            placeholder="TOME-V1:..."
            className="flex-1 min-h-[200px] p-3 rounded border-2 focus:outline-none text-amber-50 font-mono text-xs"
            style={{
              background: 'rgba(10, 6, 4, 0.7)',
              borderColor: 'rgba(126, 34, 206, 0.5)',
              fontFamily: 'monospace',
              wordBreak: 'break-all',
            }}
            autoFocus
          />
          {error && (
            <div className="p-3 rounded text-sm italic" style={{
              background: 'rgba(127, 29, 29, 0.5)',
              border: '1px solid rgba(239, 68, 68, 0.7)',
              color: '#fecaca',
            }}>
              ✗ {error}
            </div>
          )}
        </div>
        <div className="p-4 border-t border-purple-700/50 flex gap-2">
          <button onClick={onClose} className="px-6 py-3 rounded border-2 border-amber-700 text-amber-200 italic" style={{ background: 'rgba(41, 24, 12, 0.7)' }}>Cancel</button>
          <button onClick={handleSubmit} disabled={!text.trim()} className="flex-1 py-3 font-bold rounded flex items-center justify-center gap-2 text-amber-50 border-2 border-purple-300 italic disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(to bottom, #a855f7 0%, #6b21a8 100%)', boxShadow: '0 0 20px rgba(168, 85, 247, 0.5)' }}>
            <Hash className="w-4 h-4" /> Decode & Inscribe
          </button>
        </div>
      </div>
    </div>
  );
}

function MetadataEditModal({ tome, onSave, onClose }) {
  const meta = tome?.data?.metadata || {};
  const [title, setTitle] = useState(meta.title || '');
  const [description, setDescription] = useState(meta.description || '');
  const [subject, setSubject] = useState(meta.subject || '');
  const [author, setAuthor] = useState(meta.author || '');
  const [difficulty, setDifficulty] = useState(meta.difficulty || 0);
  const [tagsText, setTagsText] = useState((meta.tags || []).join(', '));

  if (!tome) return null;

  const submit = () => {
    const tags = tagsText.split(',').map(t => t.trim()).filter(Boolean);
    onSave({
      title: title.trim() || meta.title || 'Untitled Tome',
      description: description.trim(),
      subject: subject.trim(),
      author: author.trim(),
      difficulty: difficulty || undefined,
      tags,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur z-50 flex items-center justify-center p-4">
      <div className="rounded max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col relative" style={{
        background: 'linear-gradient(135deg, rgba(41, 24, 12, 0.97) 0%, rgba(10, 6, 4, 0.99) 100%)',
        border: '3px double rgba(245, 158, 11, 0.6)',
        boxShadow: '0 0 40px rgba(245, 158, 11, 0.3)',
      }}>
        <div className="absolute top-2 left-2 text-amber-500 text-sm">⚜</div>
        <div className="absolute top-2 right-2 text-amber-500 text-sm">⚜</div>
        <div className="absolute bottom-2 left-2 text-amber-500 text-sm">⚜</div>
        <div className="absolute bottom-2 right-2 text-amber-500 text-sm">⚜</div>

        <div className="p-4 border-b border-amber-700/50 flex justify-between items-center">
          <h3 className="text-xl font-bold text-amber-300 flex items-center gap-2 italic">
            <Tag className="w-5 h-5" /> ✦ Edit Tome Metadata ✦
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-amber-900/30 rounded text-amber-300">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-3">
          <div>
            <label className="text-xs text-amber-600 tracking-wider italic mb-1 block">⚔ TITLE</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full p-2 rounded border-2 focus:outline-none italic text-amber-50"
              style={{ background: 'rgba(20, 12, 6, 0.7)', borderColor: 'rgba(180, 83, 9, 0.5)' }} />
          </div>
          <div>
            <label className="text-xs text-amber-600 tracking-wider italic mb-1 block">⚔ DESCRIPTION</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              className="w-full p-2 rounded border-2 focus:outline-none italic text-amber-50"
              style={{ background: 'rgba(20, 12, 6, 0.7)', borderColor: 'rgba(180, 83, 9, 0.5)' }} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-amber-600 tracking-wider italic mb-1 block">📚 SUBJECT</label>
              <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g., Cybersecurity"
                className="w-full p-2 rounded border-2 focus:outline-none italic text-amber-50"
                style={{ background: 'rgba(20, 12, 6, 0.7)', borderColor: 'rgba(180, 83, 9, 0.5)' }} />
            </div>
            <div>
              <label className="text-xs text-amber-600 tracking-wider italic mb-1 block">✒️ AUTHOR</label>
              <input type="text" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Optional"
                className="w-full p-2 rounded border-2 focus:outline-none italic text-amber-50"
                style={{ background: 'rgba(20, 12, 6, 0.7)', borderColor: 'rgba(180, 83, 9, 0.5)' }} />
            </div>
          </div>
          <div>
            <label className="text-xs text-amber-600 tracking-wider italic mb-1 block">⚔ DIFFICULTY</label>
            <div className="flex gap-2">
              {[0, 1, 2, 3, 4, 5].map(d => (
                <button key={d} onClick={() => setDifficulty(d)}
                  className="flex-1 py-2 rounded border-2 italic text-sm"
                  style={{
                    background: difficulty === d ? 'rgba(120, 53, 15, 0.6)' : 'rgba(41, 24, 12, 0.5)',
                    borderColor: difficulty === d ? 'rgba(245, 158, 11, 0.8)' : 'rgba(120, 53, 15, 0.4)',
                    color: difficulty === d ? '#fde047' : '#a8a29e',
                  }}>
                  {d === 0 ? '— None' : '★'.repeat(d)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-amber-600 tracking-wider italic mb-1 block">🏷️ TAGS (comma-separated)</label>
            <input type="text" value={tagsText} onChange={(e) => setTagsText(e.target.value)}
              placeholder="e.g., security+, cert-prep, exam-2024"
              className="w-full p-2 rounded border-2 focus:outline-none italic text-amber-50"
              style={{ background: 'rgba(20, 12, 6, 0.7)', borderColor: 'rgba(180, 83, 9, 0.5)' }} />
          </div>
        </div>
        <div className="p-4 border-t border-amber-700/50 flex gap-2">
          <button onClick={onClose} className="px-6 py-3 rounded border-2 border-amber-700 text-amber-200 italic" style={{ background: 'rgba(41, 24, 12, 0.7)' }}>Cancel</button>
          <button onClick={submit} className="flex-1 py-3 font-bold rounded flex items-center justify-center gap-2 text-amber-950 border-2 border-amber-300 italic"
            style={{ background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)', boxShadow: '0 0 20px rgba(245, 158, 11, 0.5)' }}>
            <Check className="w-4 h-4" /> Save Metadata
          </button>
        </div>
      </div>
    </div>
  );
}

function ResetConfirmModal({ onConfirm, onCancel }) {
  const [confirmText, setConfirmText] = useState('');
  const isMatch = confirmText.trim().toUpperCase() === 'BEGIN ANEW';

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur z-50 flex items-center justify-center p-4">
      <div className="rounded max-w-md w-full overflow-hidden flex flex-col relative" style={{
        background: 'linear-gradient(135deg, rgba(80, 20, 20, 0.95) 0%, rgba(20, 6, 6, 0.99) 100%)',
        border: '3px double rgba(220, 38, 38, 0.7)',
        boxShadow: '0 0 40px rgba(220, 38, 38, 0.4)',
      }}>
        <div className="absolute top-2 left-2 text-red-500 text-sm">⚔</div>
        <div className="absolute top-2 right-2 text-red-500 text-sm">⚔</div>
        <div className="absolute bottom-2 left-2 text-red-500 text-sm">⚔</div>
        <div className="absolute bottom-2 right-2 text-red-500 text-sm">⚔</div>

        <div className="p-4 border-b border-red-700/50 flex justify-between items-center">
          <h3 className="text-xl font-bold text-red-300 flex items-center gap-2 italic">
            <Skull className="w-5 h-5" /> ⚠ Erase Thy Saga ⚠
          </h3>
          <button onClick={onCancel} className="p-2 hover:bg-red-900/30 rounded text-red-300">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <p className="text-amber-100 italic leading-relaxed">
            "Brave scholar, dost thou truly wish to erase thy saga? All levels, achievements, titles, gold, tomes, and progress shall be lost to the void — never to return."
          </p>
          <p className="text-red-300 italic text-sm font-bold">
            This act cannot be undone.
          </p>
          <div className="text-xs text-amber-700 italic mt-2">
            Type <span className="text-amber-300 font-bold">BEGIN ANEW</span> below to confirm:
          </div>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && isMatch) onConfirm(); }}
            placeholder="BEGIN ANEW"
            className="w-full p-3 rounded border-2 focus:outline-none italic text-amber-50 tracking-wider"
            style={{
              background: 'rgba(20, 6, 6, 0.8)',
              borderColor: isMatch ? 'rgba(239, 68, 68, 0.8)' : 'rgba(120, 53, 15, 0.5)',
              boxShadow: isMatch ? '0 0 15px rgba(239, 68, 68, 0.4)' : 'none',
            }}
            autoFocus
          />
        </div>
        <div className="p-4 border-t border-red-700/50 flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded border-2 border-amber-700 text-amber-200 italic"
            style={{ background: 'rgba(41, 24, 12, 0.7)' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!isMatch}
            className="flex-1 py-3 font-bold rounded text-amber-50 border-2 border-red-400 italic disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(to bottom, #dc2626 0%, #991b1b 100%)',
              boxShadow: isMatch ? '0 0 20px rgba(220, 38, 38, 0.5)' : 'none',
            }}
          >
            ⚔ Erase Saga ⚔
          </button>
        </div>
      </div>
    </div>
  );
}

function PasteTomeModal({ onClose, onSubmit }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!text.trim()) {
      setError('Paste the tome text first');
      return;
    }
    const success = onSubmit(text);
    if (success) onClose();
    else setError('Could not parse — make sure you pasted the entire JSON object');
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur z-50 flex items-center justify-center p-4">
      <div className="rounded max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col relative" style={{
        background: 'linear-gradient(135deg, rgba(41, 24, 12, 0.97) 0%, rgba(10, 6, 4, 0.99) 100%)',
        border: '3px double rgba(245, 158, 11, 0.6)',
        boxShadow: '0 0 40px rgba(245, 158, 11, 0.3)',
      }}>
        <div className="absolute top-2 left-2 text-amber-500 text-sm">⚜</div>
        <div className="absolute top-2 right-2 text-amber-500 text-sm">⚜</div>
        <div className="absolute bottom-2 left-2 text-amber-500 text-sm">⚜</div>
        <div className="absolute bottom-2 right-2 text-amber-500 text-sm">⚜</div>

        <div className="p-4 border-b border-amber-700/50 flex justify-between items-center">
          <h3 className="text-xl font-bold text-amber-300 flex items-center gap-2 italic">
            <Copy className="w-5 h-5" /> ✦ Inscribe Tome by Hand ✦
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-amber-900/30 rounded text-amber-300">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-3">
          <p className="text-sm text-amber-100/80 italic">
            "Paste the tome's sacred text below. Code-block fences (```json) shall be stripped automatically. Only valid tome JSON shall be accepted."
          </p>
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setError(''); }}
            placeholder='{"metadata": {"title": "..."}, "flashcards": [...], ...}'
            className="flex-1 min-h-[300px] p-3 rounded border-2 focus:outline-none text-amber-50 font-mono text-xs"
            style={{
              background: 'rgba(10, 6, 4, 0.7)',
              borderColor: 'rgba(180, 83, 9, 0.5)',
              fontFamily: 'monospace',
            }}
            autoFocus
          />
          {error && (
            <div className="p-3 rounded text-sm italic" style={{
              background: 'rgba(127, 29, 29, 0.5)',
              border: '1px solid rgba(239, 68, 68, 0.7)',
              color: '#fecaca',
            }}>
              ✗ {error}
            </div>
          )}
        </div>
        <div className="p-4 border-t border-amber-700/50 flex gap-2">
          <button
            onClick={onClose}
            className="px-6 py-3 rounded border-2 border-amber-700 text-amber-200 italic"
            style={{ background: 'rgba(41, 24, 12, 0.7)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!text.trim()}
            className="flex-1 py-3 font-bold rounded flex items-center justify-center gap-2 text-amber-950 border-2 border-amber-300 italic disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
              boxShadow: '0 0 20px rgba(245, 158, 11, 0.5)',
            }}
          >
            <Scroll className="w-4 h-4" /> Inscribe the Tome
          </button>
        </div>
      </div>
    </div>
  );
}

function AchievementsModal({ playerState, onClose }) {
  const categoryLabels = {
    milestone: '⚔ First Steps ⚔',
    dungeon: '🐉 Dungeon Glory 🐉',
    streak: '🔥 Streaks of Fury 🔥',
    volume: '📊 Trials Endured 📊',
    labs: '⚗️ Trials of Skill ⚗️',
    cards: '📜 Scholarly Pursuits 📜',
    quiz: '🔮 Riddle Mastery 🔮',
    oracle: '🪄 Oracle\'s Favor 🪄',
    level: '⬆️ Ranks of Power ⬆️',
    mastery: '🦉 Wisdom & Mastery 🦉',
    devotion: '🕯️ Daily Devotion 🕯️',
    vault: '🗡️ Vault of Redemption 🗡️',
    xp: '💰 Treasure Hoarded 💰',
    special: '✨ Special Honors ✨',
  };
  const grouped = ACHIEVEMENTS.reduce((acc, a) => {
    const cat = a.category || 'special';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(a);
    return acc;
  }, {});
  const categoryOrder = ['milestone', 'dungeon', 'streak', 'volume', 'labs', 'cards', 'quiz', 'oracle', 'level', 'mastery', 'devotion', 'vault', 'xp', 'special'];

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur z-50 flex items-center justify-center p-4">
      <div className="rounded max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col relative" style={{
        background: 'linear-gradient(135deg, rgba(41, 24, 12, 0.97) 0%, rgba(10, 6, 4, 0.99) 100%)',
        border: '3px double rgba(245, 158, 11, 0.6)', boxShadow: '0 0 40px rgba(245, 158, 11, 0.3)',
      }}>
        <div className="p-4 border-b border-amber-700/50 flex justify-between items-center">
          <h3 className="text-xl font-bold text-amber-300 flex items-center gap-2 italic">
            <Trophy className="w-5 h-5" /> ⚔ Hall of Glory ({playerState.achievements.length}/{ACHIEVEMENTS.length}) ⚔
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-amber-900/30 rounded text-amber-300"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 overflow-y-auto flex-1 space-y-5">
          {categoryOrder.filter(c => grouped[c]).map(cat => {
            const achievements = grouped[cat];
            const unlockedCount = achievements.filter(a => playerState.achievements.includes(a.id)).length;
            return (
              <div key={cat}>
                <h4 className="text-sm text-amber-500 mb-2 tracking-[0.2em] italic font-bold">{categoryLabels[cat]} <span className="text-amber-700 text-xs">({unlockedCount}/{achievements.length})</span></h4>
                <div className="grid md:grid-cols-2 gap-2">
                  {achievements.map(a => {
                    const unlocked = playerState.achievements.includes(a.id);
                    return (
                      <div key={a.id} className="p-3 rounded border-2" style={{
                        background: unlocked ? 'rgba(120, 53, 15, 0.4)' : 'rgba(41, 24, 12, 0.4)',
                        borderColor: unlocked ? 'rgba(245, 158, 11, 0.7)' : 'rgba(75, 75, 75, 0.5)',
                        opacity: unlocked ? 1 : 0.5, boxShadow: unlocked ? '0 0 12px rgba(245, 158, 11, 0.2)' : 'none',
                      }}>
                        <div className="flex items-start gap-2">
                          <div className="text-2xl">{unlocked ? a.icon : '🔒'}</div>
                          <div>
                            <div className="font-bold text-amber-100 italic text-sm">{a.name}</div>
                            <div className="text-xs text-amber-100/60 italic">{a.desc}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TitlesModal({ playerState, onSelect, onClose }) {
  const currentLevel = playerState.level;
  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur z-50 flex items-center justify-center p-4">
      <div className="rounded max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col relative" style={{
        background: 'linear-gradient(135deg, rgba(41, 24, 12, 0.97) 0%, rgba(10, 6, 4, 0.99) 100%)',
        border: '3px double rgba(245, 158, 11, 0.6)', boxShadow: '0 0 40px rgba(245, 158, 11, 0.3)',
      }}>
        <div className="p-4 border-b border-amber-700/50 flex justify-between items-center">
          <h3 className="text-xl font-bold text-amber-300 italic">⚔ Choose Thy Title ⚔</h3>
          <button onClick={onClose} className="p-2 hover:bg-amber-900/30 rounded text-amber-300"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          <div>
            <h4 className="text-sm text-amber-600 mb-2 tracking-[0.3em] italic">⚜ TITLES OF RANK ⚜</h4>
            <div className="space-y-2">
              <button onClick={() => onSelect(null)} className="w-full text-left p-3 rounded border-2" style={{
                background: !playerState.selectedTitle ? 'rgba(120, 53, 15, 0.5)' : 'rgba(41, 24, 12, 0.4)',
                borderColor: !playerState.selectedTitle ? 'rgba(245, 158, 11, 0.8)' : 'rgba(120, 53, 15, 0.5)',
              }}>
                <div className="font-bold text-amber-100 italic">Auto (Current Rank)</div>
                <div className="text-xs text-amber-100/60 italic">Display title based on current level</div>
              </button>
              {TITLES.map(t => {
                const unlocked = currentLevel >= t.min;
                return (
                  <div key={t.name} className="p-3 rounded border-2" style={{
                    background: unlocked ? 'rgba(41, 24, 12, 0.5)' : 'rgba(20, 12, 6, 0.4)',
                    borderColor: unlocked ? 'rgba(120, 53, 15, 0.5)' : 'rgba(45, 30, 20, 0.5)',
                    opacity: unlocked ? 1 : 0.4,
                  }}>
                    <div className="flex justify-between">
                      <div className="font-bold text-amber-100 italic">{unlocked ? t.name : '???'}</div>
                      <div className="text-xs text-amber-700">Lvl {t.min}+</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <h4 className="text-sm text-amber-600 mb-2 tracking-[0.3em] italic">✦ LEGENDARY TITLES ✦</h4>
            <div className="space-y-2">
              {Object.entries(SPECIAL_TITLES).map(([key, t]) => {
                const unlocked = playerState.unlockedTitles.includes(key);
                return (
                  <button key={key} onClick={() => unlocked && onSelect(key)} disabled={!unlocked} className="w-full text-left p-3 rounded border-2 disabled:cursor-not-allowed" style={{
                    background: playerState.selectedTitle === key ? 'rgba(126, 34, 206, 0.4)' : unlocked ? 'rgba(41, 24, 12, 0.5)' : 'rgba(20, 12, 6, 0.4)',
                    borderColor: playerState.selectedTitle === key ? 'rgba(168, 85, 247, 0.8)' : unlocked ? 'rgba(120, 53, 15, 0.5)' : 'rgba(45, 30, 20, 0.5)',
                    opacity: unlocked ? 1 : 0.4,
                  }}>
                    <div className="flex justify-between">
                      <div className="font-bold text-amber-100 italic">{unlocked ? t.name : '???'}</div>
                      {unlocked && <Sparkles className="w-4 h-4 text-purple-400" />}
                    </div>
                    <div className="text-xs text-amber-100/60 italic">{t.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
