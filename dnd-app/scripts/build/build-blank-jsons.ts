import fs from 'fs';
import path from 'path';

const BASE_DIR = path.join(__dirname, '../src/renderer/public/data/5e');
const REF_DIR = path.join(__dirname, '../5.5e References');

const explicitJsonFiles = [
    'character/faction-status.json',
    'game/mechanics/skills/passive-skills.json',
    'game/mechanics/ability-scores.json',
    'game/mechanics/inspiration.json',
    'game/mechanics/spell-geometries.json',
    'game/mechanics/senses.json',
    'game/mechanics/movement-types.json',
    'game/mechanics/healing.json',
    'game/mechanics/adventuring-rules/object-statistics.json',
    'game/mechanics/encounter-building.json',
    'game/mechanics/harvesting.json',
    'game/mechanics/crafting/magic-item-crafting.json',
    'game/mechanics/falling.json',
    'game/mechanics/vehicle-mishaps.json',
    'game/mechanics/light-sources.json',
    'game/mechanics/combat-rules/death-saves.json',
    'game/mechanics/combat-rules/mounted-combat.json',
    'game/mechanics/combat-rules/underwater-combat.json',
    'game/mechanics/combat-rules/action-options.json',
    'game/mechanics/economy/starting-wealth.json',
    'game/mechanics/economy/starting-equipment.json',
    'game/mechanics/character-advancement/hit-points.json',
    'game/mechanics/character-advancement/multiclassing.json',
    'game/mechanics/variant-rules/attunement-limits.json',
    'game/mechanics/variant-rules/lingering-injuries.json',
    'game/mechanics/variant-rules/massive-damage.json',
    'game/mechanics/variant-rules/spell-points.json',
    'game/mechanics/variant-rules/rest-variants.json',
    'game/mechanics/variant-rules/flanking.json',
    'game/mechanics/variant-rules/facing.json',
    'game/mechanics/variant-rules/cleaving.json',
    'game/mechanics/variant-rules/encumbrance.json',
    'game/mechanics/variant-rules/initiative.json',
    'game/mechanics/variant-rules/destructible-cover.json',
    'game/mechanics/variant-rules/disarm.json',
    'game/mechanics/variant-rules/overrun.json',
    'game/mechanics/variant-rules/tumble.json',
    'world/lore/alignments.json',
    'world/environments/arctic/exploration.json',
    'world/environments/desert/exploration.json',
    'world/environments/dungeon/exploration.json',
    'world/environments/forest/exploration.json',
    'world/environments/underdark/exploration.json',
    'world/environments/urban/exploration.json',
    'dm/adventures/campaigns/ai-context-template.json',
    'dm/npcs/templates/zombie.json',
    'dm/npcs/templates/half-dragon.json',
    'equipment/weapons/simple-weapons/melee/unarmed-strike.json',
    'equipment/weapons/simple-weapons/melee/improvised-weapon.json',
    'game/mechanics/status-effects/conditions/invisible.json',
    'game/mechanics/status-effects/conditions/half-cover.json',
    'game/mechanics/status-effects/conditions/three-quarters-cover.json',
    'game/mechanics/status-effects/conditions/total-cover.json',
    'game/mechanics/status-effects/conditions/unconscious.json',
    'game/mechanics/status-effects/conditions/grappled.json',
    'game/mechanics/status-effects/conditions/restrained.json',
];

function kebabize(str: string) {
    return str.trim().toLowerCase().replace(/[\s']/g, '-').replace(/[^a-z0-9-]/g, '');
}

function ensureBlankJson(dirRel: string, name: string) {
    if (!name) return false;
    const cleanName = kebabize(name);
    if (!cleanName) return false;

    const p = path.join(BASE_DIR, dirRel, `${cleanName}.json`);
    const parentDir = path.dirname(p);

    if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
    }

    if (!fs.existsSync(p)) {
        fs.writeFileSync(p, '{\n  \n}', 'utf8');
        return true;
    }
    return false;
}

async function main() {
    console.log('📄 Creating blank standard JSON files for 2024 VTT architecture...');
    let createdCount = 0;

    for (const fileRelativePath of explicitJsonFiles) {
        const fullPath = path.join(BASE_DIR, fileRelativePath);
        const parentDir = path.dirname(fullPath);
        if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
        if (!fs.existsSync(fullPath)) {
            fs.writeFileSync(fullPath, '{\n  \n}', 'utf8');
            createdCount++;
        }
    }

    const classes = [
        'barbarian', 'bard', 'cleric', 'druid',
        'fighter', 'monk', 'paladin', 'ranger',
        'rogue', 'sorcerer', 'warlock', 'wizard'
    ];
    for (const c of classes) {
        if (ensureBlankJson('classes', c)) createdCount++;
    }

    console.log('\n📖 Scanning Markdowns for dynamic ingestion...');

    // --- PHB Spells ---
    const spellsPath = path.join(REF_DIR, 'PHB2024/markdown/07-spells.md');
    if (fs.existsSync(spellsPath)) {
        const text = fs.readFileSync(spellsPath, 'utf8');
        let matches = 0;
        for (const line of text.split('\n')) {
            const match = line.match(/^#### ([A-Z][A-Za-z\s']+)$/);
            if (match) {
                if (ensureBlankJson('spells/custom-spells', match[1])) matches++;
            }
        }
        console.log(`🪄 Extracted ${matches} Spells`);
        createdCount += matches;
    }

    // --- DMG Magic Items ---
    const dmgDir = path.join(REF_DIR, 'DMG2024/markdown');
    if (fs.existsSync(dmgDir)) {
        let matches = 0;
        const files = fs.readdirSync(dmgDir).filter(f => f.startsWith('ch7-magic-items-'));
        for (const file of files) {
            const text = fs.readFileSync(path.join(dmgDir, file), 'utf8');
            for (const line of text.split('\n')) {
                const match = line.match(/^## ([A-Z][A-Za-z\s',]+)$/);
                if (match) {
                    if (ensureBlankJson('equipment/magic-items/permanent/wondrous', match[1])) matches++;
                }
            }
        }
        console.log(`🗡️ Extracted ${matches} Magic Items`);
        createdCount += matches;
    }

    // --- MM Monsters ---
    const mmDir = path.join(REF_DIR, 'MM2025/markdown/Bestiary');
    if (fs.existsSync(mmDir)) {
        let matches = 0;
        const files = fs.readdirSync(mmDir).filter(f => f.endsWith('.md'));
        for (const file of files) {
            const text = fs.readFileSync(path.join(mmDir, file), 'utf8');
            for (const line of text.split('\n')) {
                const match = line.match(/^## ([A-Z][A-Za-z\s'-]+)$/);
                if (match) {
                    if (ensureBlankJson('dm/npcs/monsters/custom', match[1])) matches++;
                }
            }
        }
        console.log(`🐉 Extracted ${matches} Monsters`);
        createdCount += matches;
    }

    console.log(`\n✅ Successfully generated ${createdCount} blank JSON files in total.`);
}

main().catch(console.error);
