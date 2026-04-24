import fs from 'fs'
import path from 'path'

const ROOT_DATA_DIR = path.join(process.cwd(), 'src/renderer/public/data/5e')

function getJsonFiles(dir: string, fileList: string[] = []): string[] {
    if (!fs.existsSync(dir)) return fileList;
    const files = fs.readdirSync(dir)
    for (const file of files) {
        const fullPath = path.join(dir, file)
        if (fs.statSync(fullPath).isDirectory()) {
            getJsonFiles(fullPath, fileList)
        } else if (file.endsWith('.json') && file !== 'index.json' && file !== '_template.json') {
            fileList.push(fullPath)
        }
    }
    return fileList
}

function resolveRelative(fullPath: string) {
    return path.relative(ROOT_DATA_DIR, fullPath).replace(/\\/g, '/')
}

function generateIndex(dir: string, outputFile: string, mapFn: (data: any, relativePath: string) => any) {
    console.log(`Generating index for ${dir}...`)
    const files = getJsonFiles(path.join(ROOT_DATA_DIR, dir))
    const index: any[] = []

    for (const file of files) {
        try {
            const content = fs.readFileSync(file, 'utf-8')
            const data = JSON.parse(content)
            const relativePath = resolveRelative(file)

            // Generate id from filename base
            const id = path.basename(file, '.json')

            const entry = mapFn(data, relativePath)
            if (entry) {
                index.push({ id, ...entry, path: relativePath })
            }
        } catch (e: any) {
            console.error(`Error parsing ${file}: ${e.message}`)
        }
    }

    const outPath = path.join(ROOT_DATA_DIR, outputFile)
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, JSON.stringify(index, null, 2))
    console.log(`✅ ${outputFile} (${index.length} entries)`)
}

// Spells - Cantrips
generateIndex('spells/cantrips', 'spells/cantrips/index.json', (data, p) => {
    return {
        name: data.name,
        school: data.school,
        classes: data.classes || [],
        components: data.components ? {
            verbal: !!data.components.verbal,
            somatic: !!data.components.somatic,
            material: !!data.components.material
        } : {}
    }
})

// Spells - Prepared
generateIndex('spells/prepared-spells', 'spells/prepared-spells/index.json', (data, p) => {
    return {
        name: data.name,
        school: data.school,
        level: data.level,
        ritual: !!data.ritual,
        classes: data.classes || [],
        components: data.components ? {
            verbal: !!data.components.verbal,
            somatic: !!data.components.somatic,
            material: !!data.components.material
        } : {}
    }
})

// Monsters
generateIndex('dm/npcs/monsters', 'dm/npcs/monsters/index.json', (data, p) => {
    return {
        name: data.name,
        type: data.type,
        cr: data.cr,
        size: data.size,
        alignment: data.alignment
    }
})

// Magic Items
generateIndex('equipment/magic-items', 'equipment/magic-items/index.json', (data, p) => {
    return {
        name: data.name,
        rarity: data.rarity,
        type: data.type || data.itemType || 'Wondrous Item',
        attunement: !!data.attunement
    }
})

// Classes
generateIndex('classes', 'classes/index.json', (data, p) => {
    if (p.includes('-subclasses')) return null
    return {
        name: data.name,
        hitDie: data.hitDie,
        primaryAbility: data.primaryAbility || data.primaryAbilityScores || []
    }
})

// Species
generateIndex('origins/species', 'origins/species/index.json', (data, p) => {
    if (p.includes('lineages')) return null
    return {
        name: data.name,
        size: data.size,
        speed: data.speed
    }
})

// Backgrounds
generateIndex('origins/backgrounds', 'origins/backgrounds/index.json', (data, p) => {
    return {
        name: data.name,
        skills: data.skillProficiencies || []
    }
})

// Feats
generateIndex('feats', 'feats/index.json', (data, p) => {
    return {
        name: data.name,
        category: data.category || (p.split('/')[1] || 'general'),
        level: data.prerequisites?.level ?? data.levelRequirement ?? data.level ?? 1,
        prerequisites: !!(data.prerequisites || data.prerequisite)
    }
})

console.log('All indexes generated!')
