import fs from 'fs';
import path from 'path';

// Target directory for the new 5.5e JSON data
const BASE_DIR = path.join(__dirname, '../src/renderer/public/data/5e');
const SAVES_DIR = path.join(__dirname, '../src/saves/characters/5e');

// List of all strictly mapped kebab-case directories from our architecture research
const directories = [
    // 1. Character & Origins
    'classes/subclasses',
    'origins/species/lineages',
    'origins/backgrounds',
    'character/feats/origin',
    'character/feats/general',
    'character/feats/fighting-style',
    'character/feats/epic-boon',
    'character/supernatural-gifts/tattoos',
    'character/companions/pets',
    'character/companions/mounts',
    'character/companions/hirelings',
    'character/spellbooks',

    // 2. Worldbuilding
    'world/universe/planet/continent/country/state/county/town/house/room',
    'world/planes',
    'world/environments/arctic',
    'world/environments/desert',
    'world/environments/dungeon',
    'world/environments/forest',
    'world/environments/underdark',
    'world/environments/urban',
    'world/languages',
    'world/scripts',
    'world/factions',
    'world/deities/pantheons',
    'world/calendar',
    'world/lore',

    // 3. Mechanics
    'game/mechanics/status-effects/conditions',
    'game/mechanics/status-effects/buffs',
    'game/mechanics/status-effects/madness',
    'game/mechanics/skills',
    'game/mechanics/tool-properties',
    'game/mechanics/damage-types',
    'game/mechanics/time',
    'game/mechanics/combat-rules',
    'game/mechanics/adventuring-rules',
    'game/mechanics/economy',
    'game/mechanics/character-advancement',
    'game/mechanics/afflictions/curses',
    'game/mechanics/downtime/bastions/facilities/basic',
    'game/mechanics/downtime/bastions/facilities/special',
    'game/mechanics/chases',
    'game/mechanics/crafting',
    'game/mechanics/weapon-properties',
    'game/mechanics/variant-rules',

    // 4. DM & Adventures
    'dm/adventures/campaigns',
    'dm/adventures/one-shots',
    'dm/adventures/encounters/lairs',
    'dm/loot-tables',
    'dm/shops',
    'dm/npcs/monsters/complex-traps',
    'dm/npcs/townsfolk',
    'dm/npcs/custom-monsters',
    'dm/npcs/sentient-items',
    'dm/npcs/templates',
    'dm/rewards/marks-of-prestige',

    // 5. Equipment
    'equipment/vehicles/mounts',
    'equipment/vehicles/drawn',
    'equipment/vehicles/waterborne/simple',
    'equipment/vehicles/waterborne/ships',
    'equipment/weapons/masteries',
    'equipment/weapons/firearms/renaissance',
    'equipment/weapons/firearms/modern',
    'equipment/weapons/firearms/futuristic',
    'equipment/weapons/explosives/renaissance',
    'equipment/weapons/explosives/modern',
    'equipment/weapons/explosives/futuristic',
    'equipment/weapons/siege',
    'equipment/weapons/simple-weapons/melee',
    'equipment/weapons/simple-weapons/ranged',
    'equipment/weapons/martial-weapons/melee',
    'equipment/weapons/martial-weapons/ranged',
    'equipment/armor/light',
    'equipment/armor/medium',
    'equipment/armor/heavy',
    'equipment/armor/shields',
    'equipment/bundles',
    'equipment/items/ammunition',
    'equipment/items/poisons/contact',
    'equipment/items/poisons/ingested',
    'equipment/items/poisons/inhaled',
    'equipment/items/poisons/injury',
    'equipment/items/spell-components',
    'equipment/items/spellcasting-foci',
    'equipment/items/adventuring-gear',
    'equipment/tools/artisan-tools',
    'equipment/tools/gaming-sets',
    'equipment/tools/musical-instruments',
    'equipment/recipes',
    'equipment/trinkets',
    'equipment/magic-items/artifacts',
    'equipment/magic-items/cursed-items',
    'equipment/magic-items/sentient-items',
    'equipment/magic-items/consumables/scrolls',
    'equipment/magic-items/consumables/potions',
    'equipment/magic-items/permanent/wands',
    'equipment/magic-items/permanent/rings',
    'equipment/magic-items/permanent/rods',
    'equipment/magic-items/permanent/staffs',
    'equipment/magic-items/permanent/wondrous',

    // 6. Spells
    'spells/cantrips',
    'spells/prepared-spells/level-1',
    'spells/prepared-spells/level-2',
    'spells/prepared-spells/level-3',
    'spells/prepared-spells/level-4',
    'spells/prepared-spells/level-5',
    'spells/prepared-spells/level-6',
    'spells/prepared-spells/level-7',
    'spells/prepared-spells/level-8',
    'spells/prepared-spells/level-9',
    'spells/custom-spells',

    // 7. Hazards
    'hazards/environmental',
    'hazards/diseases',
    'hazards/traps/mechanical/effects',
    'hazards/traps/magical/effects'
];

async function main() {
    console.log('🧹 Wiping legacy data directory...');
    if (fs.existsSync(BASE_DIR)) {
        fs.rmSync(BASE_DIR, { recursive: true, force: true });
        console.log(`✅ Deleted legacy ${BASE_DIR}`);
    }

    console.log('\n🏗️ Constructing 5.5e VTT Architecture...');
    for (const dir of directories) {
        const fullPath = path.join(BASE_DIR, dir);
        fs.mkdirSync(fullPath, { recursive: true });
    }
    console.log(`✅ Created ${directories.length} data directories successfully in ${BASE_DIR}`);

    console.log('\n👤 Ensuring player save directory exists...');
    if (!fs.existsSync(SAVES_DIR)) {
        fs.mkdirSync(SAVES_DIR, { recursive: true });
        console.log(`✅ Created saves directory at ${SAVES_DIR}`);
    }

    console.log('\n✨ Architecture Build Complete.');
}

main().catch(console.error);
