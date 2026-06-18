
// === Items & Inventory ===
// Five shop categories matching Phase 7's tabs. Each item belongs to one.
//   apothecary — consumable potions/buffs (per-run effects)
//   wardrobe   — titles, borders, profile flourishes
//   stable     — pet familiars (full mechanics arrive in Phase 18)
//   armory     — cosmetic weapon skins
//   sanctum    — permanent passive upgrades (one-time purchase, capped where noted)
export const ITEM_CATEGORIES = {
  apothecary: { label: 'Apothecary', icon: '⚗️', color: 'rose',    blurb: 'Potions and brews to aid thy delve.' },
  wardrobe:   { label: 'Wardrobe',   icon: '👑', color: 'purple',  blurb: 'Titles, borders, and flourishes for thy profile.' },
  stable:     { label: 'Stable',     icon: '🐾', color: 'emerald', blurb: 'Familiars to walk the dungeon at thy side. (Awaiting Phase 18.)' },
  armory:     { label: 'Armory',     icon: '⚔️', color: 'sapphire', blurb: 'Cosmetic blades and shields for the discerning scholar.' },
  sanctum:    { label: 'Sanctum',    icon: '🏛️', color: 'amber',   blurb: 'Permanent boons — purchased once, carried forever.' },
  ingredient: { label: 'Ingredients', icon: '🌿', color: 'emerald', blurb: 'Reagents harvested from the dungeon — bring them to the bench to brew.' },
  arcanum:    { label: 'Arcanum',     icon: '📜', color: 'sapphire', blurb: 'Scrolls of active magic. Purchase a scroll once to learn the spell forever.' },
  devotion:   { label: 'Reliquary',   icon: '🕯️', color: 'purple',   blurb: 'Relics bought with devotion — gathered through daily offerings on the calendar.' },
  celestial:  { label: 'Celestial',   icon: '🌟', color: 'amber',    blurb: 'Eternal boons paid for with Ascension Tokens — earned by transcending the cycle.' },
};


export const ITEMS = [
  // === Apothecary (consumables) ===
  { id: 'minor_heal_tonic',  name: 'Minor Healing Tonic',     description: 'Restore one life when sipped within the dungeon.',                     icon: '🧪', category: 'apothecary', effect: 'heal_1',         price: 30 },
  { id: 'greater_heal_tonic',name: 'Greater Healing Draught', description: 'Restore two lives in a single delve.',                                 icon: '⚗️', category: 'apothecary', effect: 'heal_2',         price: 75 },
  { id: 'foresight_scroll',  name: 'Scroll of Foresight',     description: 'Reveal the category of the next riddle before it is posed.',           icon: '📜', category: 'apothecary', effect: 'preview_next',   price: 40 },
  { id: 'scholars_brew',     name: "Scholar's Brew",          description: 'A bracing tea — gain +25% XP for the next three riddles of a delve.',  icon: '☕', category: 'apothecary', effect: 'xp_buff_3',      price: 50 },
  { id: 'shield_draught',    name: 'Shield Draught',          description: 'Replenish a single dungeon shield (used in Phase 14 combat).',         icon: '🛡️', category: 'apothecary', effect: 'refill_shield',  price: 60 },
  { id: 'tinkers_oil',       name: "Tinker's Oil",            description: 'Restore 2 mana within a delve.',                                      icon: '🪔', category: 'apothecary', effect: 'restore_mana',   price: 45 },
  { id: 'phoenix_ember',     name: 'Phoenix Ember',           description: 'Revive once after defeat — consumed on use.',                          icon: '🔥', category: 'apothecary', effect: 'revive_once',    price: 200 },

  // === Wardrobe (cosmetics + equippable head/cloak items) ===
  { id: 'iron_circlet',      name: 'Iron Circlet',            description: 'A modest crown of forged iron. Equip for +1 max HP in the dungeon.',    icon: '👑', category: 'wardrobe',   effect: 'border_iron',    price: 150, oneTime: true, slot: 'head'  },
  { id: 'silver_circlet',    name: 'Silver Circlet',          description: 'A keen-eyed silver crown. Equip for +1 max HP and +1 shield.',          icon: '🪙', category: 'wardrobe',   effect: 'border_silver',  price: 400, oneTime: true, slot: 'head'  },
  { id: 'gilded_quill',      name: 'Gilded Quill',            description: 'A quill of beaten gold — adorns thy profile with a flourish.',         icon: '🪶', category: 'wardrobe',   effect: 'avatar_quill',   price: 200, oneTime: true },
  { id: 'starbound_cloak',   name: 'Cloak of the Starbound',  description: 'A velvet cloak studded with constellations. Equip to ignore thy first wrong answer each delve.', icon: '🌌', category: 'wardrobe',   effect: 'bg_starbound',   price: 350, oneTime: true, slot: 'cloak' },
  { id: 'tome_emblem',       name: 'Tome Emblem',             description: 'A small heraldic crest of an open tome, displayed beside thy title.',   icon: '📔', category: 'wardrobe',   effect: 'emblem_tome',    price: 120, oneTime: true },

  // === Stable (pet eggs — purchase to add to thy Stable, hatched as familiars) ===
  { id: 'wise_owl_egg',      name: 'Wise Owl Egg',            description: 'Hatches into a Wise Owl. Equip in the Stable for +5% delve XP, scaling with its level.', icon: '🥚', category: 'stable',     effect: 'pet_owl',        price: 300, oneTime: true, petId: 'wise_owl' },
  { id: 'dragon_hatchling',  name: 'Dragon Hatchling',        description: 'Hatches into an Ember Dragon. Equip for +1 starting shield in the dungeon.',           icon: '🐉', category: 'stable',     effect: 'pet_dragon',     price: 600, oneTime: true, petId: 'ember_dragon' },
  { id: 'mimic_pup',         name: 'Mimic Pup',               description: 'A mischievous treasure-hunter. Equip for +10% gold drop, scaling with its level.',     icon: '🪙', category: 'stable',     effect: 'pet_mimic',      price: 400, oneTime: true, petId: 'mimic_pup' },
  { id: 'fox_kit',           name: 'Glade Fox Kit',           description: 'A nimble forager. Equip for a chance at double plant drops in the dungeon.',           icon: '🦊', category: 'stable',     effect: 'pet_fox',        price: 350, oneTime: true, petId: 'glade_fox' },
  { id: 'sewer_imp_egg',     name: 'Sewer Imp Egg',           description: "Hatches into a Sewer Imp. Equip to ignore thy first wrong answer (stacks with cloak).",icon: '👹', category: 'stable',     effect: 'pet_imp',        price: 500, oneTime: true, petId: 'sewer_imp' },

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
  { id: 'ember_ash',     name: 'Ember Ash',     description: 'Soot scraped from a still-warm forge. Used in fire-touched brews.',      icon: '🔥', category: 'ingredient', price: 25 },
  { id: 'glow_root',     name: 'Glow Root',     description: 'A bioluminescent tuber that pulses faintly in the dark.',                 icon: '🌱', category: 'ingredient', price: 30 },
  { id: 'sigil_dust',    name: 'Sigil Dust',    description: 'Powdered runes left behind by faded inscriptions.',                       icon: '✨', category: 'ingredient', price: 35 },
  { id: 'iron_filings',  name: 'Iron Filings',  description: 'Curls of dark metal — the bones of shielding draughts.',                  icon: '⚙️', category: 'ingredient', price: 30 },
  { id: 'crystal_shard', name: 'Crystal Shard', description: 'A sliver of focused arcane glass.',                                       icon: '💎', category: 'ingredient', price: 40 },
  { id: 'moonleaf',      name: 'Moonleaf',      description: 'A pale leaf that holds the dew of a forgotten night.',                    icon: '🍃', category: 'ingredient', price: 35 },
  { id: 'cactus_pulp',   name: 'Cactus Pulp',   description: 'Wet fibre wrenched from a sun-bleached cactus.',                          icon: '🌵', category: 'ingredient', price: 40 },

  // === Arcanum (Phase 19 — spell scrolls; one-time, learn on purchase) ===
  { id: 'scroll_glyph_of_mending', name: 'Scroll of Mending',  description: 'Learn Glyph of Mending — a 2-mana spell that restores 1 HP in the dungeon.',         icon: '✨', category: 'arcanum', price: 250, oneTime: true, spellId: 'glyph_of_mending' },
  { id: 'scroll_lance_of_lumens',  name: 'Scroll of Lumens',   description: 'Learn Lance of Lumens — a 3-mana spell that smites the nearest mob (bosses immune).', icon: '⚡', category: 'arcanum', price: 400, oneTime: true, spellId: 'lance_of_lumens' },
  { id: 'scroll_ward_of_aegis',    name: 'Scroll of Aegis',    description: 'Learn Ward of Aegis — a 2-mana spell granting a single shield bond.',                 icon: '🛡️', category: 'arcanum', price: 300, oneTime: true, spellId: 'ward_of_aegis' },
  { id: 'scroll_bolt_of_truth',    name: 'Scroll of Truth',    description: 'Learn Bolt of Truth — a 3-mana spell that auto-resolves the current battle question.',icon: '📖', category: 'arcanum', price: 450, oneTime: true, spellId: 'bolt_of_truth' },
  { id: 'scroll_riftstep',         name: 'Scroll of Riftstep', description: 'Learn Riftstep — a 2-mana escape spell that returns thee to the spawn chamber.',      icon: '🌀', category: 'arcanum', price: 350, oneTime: true, spellId: 'riftstep' },
  { id: 'scroll_sigil_of_clarity', name: 'Scroll of Clarity',  description: 'Learn Sigil of Clarity — a 1-mana spell that reveals the answer to a battle question.',icon: '👁️', category: 'arcanum', price: 200, oneTime: true, spellId: 'sigil_of_clarity' },

  // === Reliquary (Phase 20 — purchased with devotion, not gold) ===
  { id: 'relic_mana_pearl',   name: 'Pearl of Mana',          description: '+1 maximum mana per delve. Stacks up to 3 times.',                     icon: '💎', category: 'devotion', effect: 'perm_max_mana',  devotionPrice: 8, permKey: 'maxManaBonus', cap: 3 },
  { id: 'relic_pet_compass',  name: "Familiar's Compass",     description: '+25% pet XP from every delve. Stacks once.',                           icon: '🧭', category: 'devotion', effect: 'perm_pet_xp',    devotionPrice: 6, permKey: 'petXpBonus',    cap: 1 },
  { id: 'relic_devout_purse', name: 'Devout Purse',           description: '+10% gold from daily offerings. Stacks up to 2 times.',                icon: '💰', category: 'devotion', effect: 'perm_devo_gold', devotionPrice: 10, permKey: 'devoGoldPct',  cap: 2, step: 10 },
  { id: 'relic_bestiary_eye', name: 'Eye of the Bestiary',    description: 'Unveil all bestiary entries from a single defeat. One-time.',          icon: '📖', category: 'devotion', effect: 'perm_full_lore', devotionPrice: 12, permKey: 'fullLoreOnFirst', cap: 1 },

  // === Celestial (Phase 23 — purchased with ascension tokens) ===
  { id: 'celestial_xp_font',     name: 'Font of Eternal XP',     description: '+25% XP from every source. Stacks up to 4 times.',                   icon: '⭐', category: 'celestial', effect: 'asc_xp',     ascensionPrice: 1, permKey: 'ascXpPct',     cap: 4, step: 25 },
  { id: 'celestial_gold_font',   name: 'Font of Eternal Gold',   description: '+25% gold from every source. Stacks up to 4 times.',                 icon: '💫', category: 'celestial', effect: 'asc_gold',   ascensionPrice: 1, permKey: 'ascGoldPct',   cap: 4, step: 25 },
  { id: 'celestial_max_hp',      name: 'Heart of the Celestials',description: '+1 maximum HP in every delve. Stacks up to 3 times.',                 icon: '🌠', category: 'celestial', effect: 'asc_hp',     ascensionPrice: 2, permKey: 'ascMaxHp',     cap: 3 },
  { id: 'celestial_max_mana',    name: 'Star of Boundless Mana', description: '+1 maximum mana per delve. Stacks up to 3 times.',                   icon: '✨', category: 'celestial', effect: 'asc_mana',   ascensionPrice: 2, permKey: 'ascMaxMana',   cap: 3 },
  { id: 'celestial_starting_pot',name: 'Astral Apothecary',      description: '+1 starting potion in every delve. Stacks up to 2 times.',           icon: '🌌', category: 'celestial', effect: 'asc_pot',    ascensionPrice: 3, permKey: 'ascStartPot',  cap: 2 },
  { id: 'celestial_revive',      name: 'Phoenix of the Spheres', description: 'Begin every delve with a Phoenix Ember already burning.',            icon: '🔥', category: 'celestial', effect: 'asc_revive', ascensionPrice: 4, permKey: 'ascAutoRevive',cap: 1 },
];


// === Recipes (Phase 16) =================================================
// Crafting at The Bench: spend ingredients, gain a potion. Run-specific
// effects already live on the apothecary items themselves.
export const RECIPES = [
  { id: 'craft_minor_heal',   name: 'Minor Healing Tonic',   icon: '🧪', resultId: 'minor_heal_tonic',   ingredients: { glow_root: 1, ember_ash: 1 } },
  { id: 'craft_greater_heal', name: 'Greater Healing Draught', icon: '⚗️', resultId: 'greater_heal_tonic', ingredients: { glow_root: 2, moonleaf: 1, ember_ash: 1 } },
  { id: 'craft_shield',       name: 'Shield Draught',        icon: '🛡️', resultId: 'shield_draught',     ingredients: { iron_filings: 1, crystal_shard: 1, sigil_dust: 1 } },
  { id: 'craft_brew',         name: "Scholar's Brew",        icon: '☕', resultId: 'scholars_brew',      ingredients: { moonleaf: 1, glow_root: 1, cactus_pulp: 1 } },
  { id: 'craft_phoenix',      name: 'Phoenix Ember',         icon: '🔥', resultId: 'phoenix_ember',      ingredients: { ember_ash: 3, sigil_dust: 1, crystal_shard: 1 } },
  { id: 'craft_foresight',    name: 'Foresight Scroll',      icon: '📜', resultId: 'foresight_scroll',   ingredients: { sigil_dust: 1, moonleaf: 1 } },
  { id: 'craft_tinkers',      name: "Tinker's Oil",          icon: '🪔', resultId: 'tinkers_oil',        ingredients: { iron_filings: 2, cactus_pulp: 1 } },
];


export const findItem = (id) => ITEMS.find(it => it.id === id);



// Permanent-upgrade items are purchased N times, capped per item. This computes
// the player's current count, what the next purchase would cost, and whether
// they can buy more.
export const sanctumCount = (state, item) => {
  if (item.category !== 'sanctum' || !item.permKey) return 0;
  const counts = state.permUpgrades || {};
  const step = item.step || 1;
  const raw = counts[item.permKey] || 0;
  return Math.floor(raw / step);
};


export const sanctumAtCap = (state, item) => sanctumCount(state, item) >= (item.cap || 1);


// Deterministic daily shop stock — pick N items from a category's pool keyed
// on the date so every player sees the same rotation that day. Locked items
// (e.g. Stable pets pre-Phase 18) are still picked but rendered as "Sealed".
export const pickShopStock = (dateStr, category, n = 4) => {
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
