// Static catalogue of every bundled MP3 grouped by subcategory. Surfaced by the
// Library UI ('sounds' category) — see library-service.loadCategoryItems. Pure
// data, no fetch: the paths are public/ asset references resolved at runtime.
// NOTE: paths are RELATIVE (`./sounds/...`), not absolute (`/sounds/...`). The
// packaged app loads the renderer via `file://`, where a leading-slash path
// resolves to the filesystem root (→ load fails, "couldn't play"). Relative
// paths resolve against the renderer index.html in both dev (http) and
// packaged (file://). Matches sound-manager.ts / sound-playback.ts.
export const SOUND_INVENTORY: { id: string; name: string; subcategory: string; path: string }[] = [
  // Ambient (14)
  { id: 'ambient-battle', name: 'Battle', subcategory: 'ambient', path: './sounds/ambient/battle.mp3' },
  { id: 'ambient-battle-1', name: 'Battle (Alt)', subcategory: 'ambient', path: './sounds/ambient/battle-1.mp3' },
  { id: 'ambient-cave', name: 'Cave', subcategory: 'ambient', path: './sounds/ambient/cave.mp3' },
  { id: 'ambient-city', name: 'City', subcategory: 'ambient', path: './sounds/ambient/city.mp3' },
  { id: 'ambient-city-1', name: 'City (Alt)', subcategory: 'ambient', path: './sounds/ambient/city-1.mp3' },
  { id: 'ambient-defeat', name: 'Defeat', subcategory: 'ambient', path: './sounds/ambient/defeat.mp3' },
  { id: 'ambient-defeat-1', name: 'Defeat (Alt)', subcategory: 'ambient', path: './sounds/ambient/defeat-1.mp3' },
  { id: 'ambient-dungeon', name: 'Dungeon', subcategory: 'ambient', path: './sounds/ambient/dungeon.mp3' },
  { id: 'ambient-forest', name: 'Forest', subcategory: 'ambient', path: './sounds/ambient/forest.mp3' },
  { id: 'ambient-tavern', name: 'Tavern', subcategory: 'ambient', path: './sounds/ambient/tavern.mp3' },
  { id: 'ambient-tavern-1', name: 'Tavern (Alt)', subcategory: 'ambient', path: './sounds/ambient/tavern-1.mp3' },
  { id: 'ambient-tension', name: 'Tension', subcategory: 'ambient', path: './sounds/ambient/tension.mp3' },
  { id: 'ambient-victory', name: 'Victory', subcategory: 'ambient', path: './sounds/ambient/victory.mp3' },
  { id: 'ambient-victory-1', name: 'Victory (Alt)', subcategory: 'ambient', path: './sounds/ambient/victory-1.mp3' },
  // Combat (10)
  { id: 'combat-attack-hit', name: 'Attack Hit', subcategory: 'combat', path: './sounds/combat/attack-hit.mp3' },
  { id: 'combat-attack-miss', name: 'Attack Miss', subcategory: 'combat', path: './sounds/combat/attack-miss.mp3' },
  { id: 'combat-crit-hit', name: 'Critical Hit', subcategory: 'combat', path: './sounds/combat/crit-hit.mp3' },
  { id: 'combat-crit-miss', name: 'Critical Miss', subcategory: 'combat', path: './sounds/combat/crit-miss.mp3' },
  { id: 'combat-damage', name: 'Damage', subcategory: 'combat', path: './sounds/combat/damage.mp3' },
  { id: 'combat-death', name: 'Death', subcategory: 'combat', path: './sounds/combat/death.mp3' },
  { id: 'combat-instant-kill', name: 'Instant Kill', subcategory: 'combat', path: './sounds/combat/instant-kill.mp3' },
  { id: 'combat-melee-attack', name: 'Melee Attack', subcategory: 'combat', path: './sounds/combat/melee-attack.mp3' },
  {
    id: 'combat-ranged-attack',
    name: 'Ranged Attack',
    subcategory: 'combat',
    path: './sounds/combat/ranged-attack.mp3'
  },
  { id: 'combat-stabilize', name: 'Stabilize', subcategory: 'combat', path: './sounds/combat/stabilize.mp3' },
  // Conditions (11)
  { id: 'conditions-apply', name: 'Apply Condition', subcategory: 'conditions', path: './sounds/conditions/apply.mp3' },
  { id: 'conditions-blinded', name: 'Blinded', subcategory: 'conditions', path: './sounds/conditions/blinded.mp3' },
  { id: 'conditions-charmed', name: 'Charmed', subcategory: 'conditions', path: './sounds/conditions/charmed.mp3' },
  {
    id: 'conditions-exhaustion',
    name: 'Exhaustion',
    subcategory: 'conditions',
    path: './sounds/conditions/exhaustion.mp3'
  },
  {
    id: 'conditions-frightened',
    name: 'Frightened',
    subcategory: 'conditions',
    path: './sounds/conditions/frightened.mp3'
  },
  {
    id: 'conditions-paralyzed',
    name: 'Paralyzed',
    subcategory: 'conditions',
    path: './sounds/conditions/paralyzed.mp3'
  },
  { id: 'conditions-poisoned', name: 'Poisoned', subcategory: 'conditions', path: './sounds/conditions/poisoned.mp3' },
  { id: 'conditions-prone', name: 'Prone', subcategory: 'conditions', path: './sounds/conditions/prone.mp3' },
  {
    id: 'conditions-restrained',
    name: 'Restrained',
    subcategory: 'conditions',
    path: './sounds/conditions/restrained.mp3'
  },
  { id: 'conditions-stunned', name: 'Stunned', subcategory: 'conditions', path: './sounds/conditions/stunned.mp3' },
  {
    id: 'conditions-unconscious',
    name: 'Unconscious',
    subcategory: 'conditions',
    path: './sounds/conditions/unconscious.mp3'
  },
  // Creatures - Beasts (9)
  {
    id: 'creatures-beasts-bat',
    name: 'Bat',
    subcategory: 'creatures/beasts',
    path: './sounds/creatures/beasts/bat.mp3'
  },
  {
    id: 'creatures-beasts-bear',
    name: 'Bear',
    subcategory: 'creatures/beasts',
    path: './sounds/creatures/beasts/bear.mp3'
  },
  {
    id: 'creatures-beasts-crow',
    name: 'Crow',
    subcategory: 'creatures/beasts',
    path: './sounds/creatures/beasts/crow.mp3'
  },
  {
    id: 'creatures-beasts-horse',
    name: 'Horse',
    subcategory: 'creatures/beasts',
    path: './sounds/creatures/beasts/horse.mp3'
  },
  {
    id: 'creatures-beasts-owl',
    name: 'Owl',
    subcategory: 'creatures/beasts',
    path: './sounds/creatures/beasts/owl.mp3'
  },
  {
    id: 'creatures-beasts-rat',
    name: 'Rat',
    subcategory: 'creatures/beasts',
    path: './sounds/creatures/beasts/rat.mp3'
  },
  {
    id: 'creatures-beasts-snake',
    name: 'Snake',
    subcategory: 'creatures/beasts',
    path: './sounds/creatures/beasts/snake.mp3'
  },
  {
    id: 'creatures-beasts-spider',
    name: 'Spider',
    subcategory: 'creatures/beasts',
    path: './sounds/creatures/beasts/spider.mp3'
  },
  {
    id: 'creatures-beasts-wolf',
    name: 'Wolf',
    subcategory: 'creatures/beasts',
    path: './sounds/creatures/beasts/wolf.mp3'
  },
  // Creatures - Monsters (9)
  {
    id: 'creatures-monsters-demon',
    name: 'Demon',
    subcategory: 'creatures/monsters',
    path: './sounds/creatures/monsters/demon.mp3'
  },
  {
    id: 'creatures-monsters-dragon',
    name: 'Dragon',
    subcategory: 'creatures/monsters',
    path: './sounds/creatures/monsters/dragon.mp3'
  },
  {
    id: 'creatures-monsters-elemental',
    name: 'Elemental',
    subcategory: 'creatures/monsters',
    path: './sounds/creatures/monsters/elemental.mp3'
  },
  {
    id: 'creatures-monsters-ghost',
    name: 'Ghost',
    subcategory: 'creatures/monsters',
    path: './sounds/creatures/monsters/ghost.mp3'
  },
  {
    id: 'creatures-monsters-giant',
    name: 'Giant',
    subcategory: 'creatures/monsters',
    path: './sounds/creatures/monsters/giant.mp3'
  },
  {
    id: 'creatures-monsters-goblin',
    name: 'Goblin',
    subcategory: 'creatures/monsters',
    path: './sounds/creatures/monsters/goblin.mp3'
  },
  {
    id: 'creatures-monsters-ogre',
    name: 'Ogre',
    subcategory: 'creatures/monsters',
    path: './sounds/creatures/monsters/ogre.mp3'
  },
  {
    id: 'creatures-monsters-troll',
    name: 'Troll',
    subcategory: 'creatures/monsters',
    path: './sounds/creatures/monsters/troll.mp3'
  },
  {
    id: 'creatures-monsters-undead',
    name: 'Undead',
    subcategory: 'creatures/monsters',
    path: './sounds/creatures/monsters/undead.mp3'
  },
  // Dice (36)
  { id: 'dice-advantage-1', name: 'Advantage (1)', subcategory: 'dice', path: './sounds/dice/advantage-1.mp3' },
  { id: 'dice-advantage-2', name: 'Advantage (2)', subcategory: 'dice', path: './sounds/dice/advantage-2.mp3' },
  { id: 'dice-advantage-3', name: 'Advantage (3)', subcategory: 'dice', path: './sounds/dice/advantage-3.mp3' },
  { id: 'dice-d4-1', name: 'd4 (1)', subcategory: 'dice', path: './sounds/dice/d4-1.mp3' },
  { id: 'dice-d4-2', name: 'd4 (2)', subcategory: 'dice', path: './sounds/dice/d4-2.mp3' },
  { id: 'dice-d4-3', name: 'd4 (3)', subcategory: 'dice', path: './sounds/dice/d4-3.mp3' },
  { id: 'dice-d6-1', name: 'd6 (1)', subcategory: 'dice', path: './sounds/dice/d6-1.mp3' },
  { id: 'dice-d6-2', name: 'd6 (2)', subcategory: 'dice', path: './sounds/dice/d6-2.mp3' },
  { id: 'dice-d6-3', name: 'd6 (3)', subcategory: 'dice', path: './sounds/dice/d6-3.mp3' },
  { id: 'dice-d8-1', name: 'd8 (1)', subcategory: 'dice', path: './sounds/dice/d8-1.mp3' },
  { id: 'dice-d8-2', name: 'd8 (2)', subcategory: 'dice', path: './sounds/dice/d8-2.mp3' },
  { id: 'dice-d8-3', name: 'd8 (3)', subcategory: 'dice', path: './sounds/dice/d8-3.mp3' },
  { id: 'dice-d10-1', name: 'd10 (1)', subcategory: 'dice', path: './sounds/dice/d10-1.mp3' },
  { id: 'dice-d10-2', name: 'd10 (2)', subcategory: 'dice', path: './sounds/dice/d10-2.mp3' },
  { id: 'dice-d10-3', name: 'd10 (3)', subcategory: 'dice', path: './sounds/dice/d10-3.mp3' },
  { id: 'dice-d12-1', name: 'd12 (1)', subcategory: 'dice', path: './sounds/dice/d12-1.mp3' },
  { id: 'dice-d12-2', name: 'd12 (2)', subcategory: 'dice', path: './sounds/dice/d12-2.mp3' },
  { id: 'dice-d12-3', name: 'd12 (3)', subcategory: 'dice', path: './sounds/dice/d12-3.mp3' },
  { id: 'dice-d20-1', name: 'd20 (1)', subcategory: 'dice', path: './sounds/dice/d20-1.mp3' },
  { id: 'dice-d20-2', name: 'd20 (2)', subcategory: 'dice', path: './sounds/dice/d20-2.mp3' },
  { id: 'dice-d20-3', name: 'd20 (3)', subcategory: 'dice', path: './sounds/dice/d20-3.mp3' },
  { id: 'dice-d100-1', name: 'd100 (1)', subcategory: 'dice', path: './sounds/dice/d100-1.mp3' },
  { id: 'dice-d100-2', name: 'd100 (2)', subcategory: 'dice', path: './sounds/dice/d100-2.mp3' },
  { id: 'dice-d100-3', name: 'd100 (3)', subcategory: 'dice', path: './sounds/dice/d100-3.mp3' },
  {
    id: 'dice-disadvantage-1',
    name: 'Disadvantage (1)',
    subcategory: 'dice',
    path: './sounds/dice/disadvantage-1.mp3'
  },
  {
    id: 'dice-disadvantage-2',
    name: 'Disadvantage (2)',
    subcategory: 'dice',
    path: './sounds/dice/disadvantage-2.mp3'
  },
  {
    id: 'dice-disadvantage-3',
    name: 'Disadvantage (3)',
    subcategory: 'dice',
    path: './sounds/dice/disadvantage-3.mp3'
  },
  { id: 'dice-nat-1-1', name: 'Nat 1 (1)', subcategory: 'dice', path: './sounds/dice/nat-1-1.mp3' },
  { id: 'dice-nat-1-2', name: 'Nat 1 (2)', subcategory: 'dice', path: './sounds/dice/nat-1-2.mp3' },
  { id: 'dice-nat-1-3', name: 'Nat 1 (3)', subcategory: 'dice', path: './sounds/dice/nat-1-3.mp3' },
  { id: 'dice-nat-20-1', name: 'Nat 20 (1)', subcategory: 'dice', path: './sounds/dice/nat-20-1.mp3' },
  { id: 'dice-nat-20-2', name: 'Nat 20 (2)', subcategory: 'dice', path: './sounds/dice/nat-20-2.mp3' },
  { id: 'dice-nat-20-3', name: 'Nat 20 (3)', subcategory: 'dice', path: './sounds/dice/nat-20-3.mp3' },
  { id: 'dice-roll-1', name: 'Roll (1)', subcategory: 'dice', path: './sounds/dice/roll-1.mp3' },
  { id: 'dice-roll-2', name: 'Roll (2)', subcategory: 'dice', path: './sounds/dice/roll-2.mp3' },
  { id: 'dice-roll-3', name: 'Roll (3)', subcategory: 'dice', path: './sounds/dice/roll-3.mp3' },
  // Spells (10)
  { id: 'spells-abjuration', name: 'Abjuration', subcategory: 'spells', path: './sounds/spells/abjuration.mp3' },
  { id: 'spells-conjuration', name: 'Conjuration', subcategory: 'spells', path: './sounds/spells/conjuration.mp3' },
  { id: 'spells-counterspell', name: 'Counterspell', subcategory: 'spells', path: './sounds/spells/counterspell.mp3' },
  { id: 'spells-divination', name: 'Divination', subcategory: 'spells', path: './sounds/spells/divination.mp3' },
  { id: 'spells-enchantment', name: 'Enchantment', subcategory: 'spells', path: './sounds/spells/enchantment.mp3' },
  { id: 'spells-evocation', name: 'Evocation', subcategory: 'spells', path: './sounds/spells/evocation.mp3' },
  { id: 'spells-fizzle', name: 'Fizzle', subcategory: 'spells', path: './sounds/spells/fizzle.mp3' },
  { id: 'spells-illusion', name: 'Illusion', subcategory: 'spells', path: './sounds/spells/illusion.mp3' },
  { id: 'spells-necromancy', name: 'Necromancy', subcategory: 'spells', path: './sounds/spells/necromancy.mp3' },
  {
    id: 'spells-transmutation',
    name: 'Transmutation',
    subcategory: 'spells',
    path: './sounds/spells/transmutation.mp3'
  },
  // UI (16)
  { id: 'ui-announcement', name: 'Announcement', subcategory: 'ui', path: './sounds/ui/announcement.mp3' },
  { id: 'ui-bastion-event', name: 'Bastion Event', subcategory: 'ui', path: './sounds/ui/bastion-event.mp3' },
  { id: 'ui-death-save', name: 'Death Save', subcategory: 'ui', path: './sounds/ui/death-save.mp3' },
  { id: 'ui-door-open', name: 'Door Open', subcategory: 'ui', path: './sounds/ui/door-open.mp3' },
  { id: 'ui-heal', name: 'Heal', subcategory: 'ui', path: './sounds/ui/heal.mp3' },
  { id: 'ui-initiative-start', name: 'Initiative Start', subcategory: 'ui', path: './sounds/ui/initiative-start.mp3' },
  { id: 'ui-level-up', name: 'Level Up', subcategory: 'ui', path: './sounds/ui/level-up.mp3' },
  { id: 'ui-long-rest', name: 'Long Rest', subcategory: 'ui', path: './sounds/ui/long-rest.mp3' },
  { id: 'ui-loot-found', name: 'Loot Found', subcategory: 'ui', path: './sounds/ui/loot-found.mp3' },
  { id: 'ui-ping', name: 'Ping', subcategory: 'ui', path: './sounds/ui/ping.mp3' },
  { id: 'ui-round-end', name: 'Round End', subcategory: 'ui', path: './sounds/ui/round-end.mp3' },
  { id: 'ui-shop-open', name: 'Shop Open', subcategory: 'ui', path: './sounds/ui/shop-open.mp3' },
  { id: 'ui-short-rest', name: 'Short Rest', subcategory: 'ui', path: './sounds/ui/short-rest.mp3' },
  { id: 'ui-trap-triggered', name: 'Trap Triggered', subcategory: 'ui', path: './sounds/ui/trap-triggered.mp3' },
  { id: 'ui-turn-notify', name: 'Turn Notify', subcategory: 'ui', path: './sounds/ui/turn-notify.mp3' },
  { id: 'ui-xp-gain', name: 'XP Gain', subcategory: 'ui', path: './sounds/ui/xp-gain.mp3' },
  // Weapons - Magic (4)
  {
    id: 'weapons-magic-flaming',
    name: 'Flaming',
    subcategory: 'weapons/magic',
    path: './sounds/weapons/magic/flaming.mp3'
  },
  { id: 'weapons-magic-frost', name: 'Frost', subcategory: 'weapons/magic', path: './sounds/weapons/magic/frost.mp3' },
  { id: 'weapons-magic-holy', name: 'Holy', subcategory: 'weapons/magic', path: './sounds/weapons/magic/holy.mp3' },
  {
    id: 'weapons-magic-lightning',
    name: 'Lightning',
    subcategory: 'weapons/magic',
    path: './sounds/weapons/magic/lightning.mp3'
  },
  // Weapons - Melee (9)
  { id: 'weapons-melee-axe', name: 'Axe', subcategory: 'weapons/melee', path: './sounds/weapons/melee/axe.mp3' },
  {
    id: 'weapons-melee-dagger',
    name: 'Dagger',
    subcategory: 'weapons/melee',
    path: './sounds/weapons/melee/dagger.mp3'
  },
  {
    id: 'weapons-melee-hammer',
    name: 'Hammer',
    subcategory: 'weapons/melee',
    path: './sounds/weapons/melee/hammer.mp3'
  },
  { id: 'weapons-melee-mace', name: 'Mace', subcategory: 'weapons/melee', path: './sounds/weapons/melee/mace.mp3' },
  {
    id: 'weapons-melee-shield-bash',
    name: 'Shield Bash',
    subcategory: 'weapons/melee',
    path: './sounds/weapons/melee/shield-bash.mp3'
  },
  { id: 'weapons-melee-spear', name: 'Spear', subcategory: 'weapons/melee', path: './sounds/weapons/melee/spear.mp3' },
  { id: 'weapons-melee-staff', name: 'Staff', subcategory: 'weapons/melee', path: './sounds/weapons/melee/staff.mp3' },
  { id: 'weapons-melee-sword', name: 'Sword', subcategory: 'weapons/melee', path: './sounds/weapons/melee/sword.mp3' },
  { id: 'weapons-melee-whip', name: 'Whip', subcategory: 'weapons/melee', path: './sounds/weapons/melee/whip.mp3' },
  // Weapons - Ranged (2)
  { id: 'weapons-ranged-bow', name: 'Bow', subcategory: 'weapons/ranged', path: './sounds/weapons/ranged/bow.mp3' },
  {
    id: 'weapons-ranged-crossbow',
    name: 'Crossbow',
    subcategory: 'weapons/ranged',
    path: './sounds/weapons/ranged/crossbow.mp3'
  }
]
