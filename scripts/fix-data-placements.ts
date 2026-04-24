import fs from 'fs';
import path from 'path';

const DATA_ROOT = path.join(process.cwd(), 'src/renderer/public/data/5e');

function walkDir(dir: string, fileList: string[] = []): string[] {
    if (!fs.existsSync(dir)) return fileList;
    for (const file of fs.readdirSync(dir)) {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            walkDir(filePath, fileList);
        } else {
            fileList.push(filePath);
        }
    }
    return fileList;
}

function ensureDir(filePath: string) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function moveFile(src: string, dest: string) {
    if (src === dest) return;
    console.log(`Moving:\n  [FROM]: ${src}\n  [TO]: ${dest}`);
    ensureDir(dest);
    fs.renameSync(src, dest);
}

// === FIX SPELLS ===
function fixSpells() {
    const spellsDir = path.join(DATA_ROOT, 'spells');
    if (!fs.existsSync(spellsDir)) return;

    const allSpells = walkDir(spellsDir).filter(f => f.endsWith('.json'));
    for (const file of allSpells) {
        const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
        const isCantrip = data.level === 0;
        const school = (data.school || 'unknown').toLowerCase().replace(/\s+/g, '-');
        const levelStr = `level-${data.level}`;
        const ritualFolder = data.ritual ? 'ritual' : 'non-ritual';

        let comps = [];
        if (data.components?.verbal) comps.push('v');
        if (data.components?.somatic) comps.push('s');
        if (data.components?.material) comps.push('m');
        const compFolder = comps.length > 0 ? comps.join('-') : 'none';

        const filename = path.basename(file);

        let newPath;
        if (isCantrip) {
            newPath = path.join(spellsDir, 'cantrips', school, ritualFolder, compFolder, filename);
        } else {
            newPath = path.join(spellsDir, 'prepared-spells', school, levelStr, ritualFolder, compFolder, filename);
        }

        moveFile(file, newPath);
    }
}

// === FIX BACKGROUNDS ===
function fixBackgrounds() {
    const charBackgrounds = path.join(DATA_ROOT, 'character', 'backgrounds');
    const originsBackgrounds = path.join(DATA_ROOT, 'origins', 'backgrounds');

    if (fs.existsSync(charBackgrounds)) {
        const files = walkDir(charBackgrounds).filter(f => f.endsWith('.json'));
        for (const file of files) {
            const filename = path.basename(file);
            moveFile(file, path.join(originsBackgrounds, filename));
        }
        // try to remove the old dir
        try { fs.rmdirSync(charBackgrounds); } catch (e) { }
    }
}

// === FIX SPECIES ===
function fixSpecies() {
    const charSpecies = path.join(DATA_ROOT, 'character', 'species');
    const originsSpecies = path.join(DATA_ROOT, 'origins', 'species');

    if (fs.existsSync(charSpecies)) {
        const files = walkDir(charSpecies).filter(f => f.endsWith('.json'));
        for (const file of files) {
            const filename = path.basename(file);
            const speciesName = filename.replace('.json', '');
            moveFile(file, path.join(originsSpecies, speciesName, filename));
        }
        try { fs.rmdirSync(charSpecies); } catch (e) { }
    }
}

// Clean up empty dirs after moving magic
function cleanEmptyDirs(dir: string) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const f of files) {
        const fullPath = path.join(dir, f);
        if (fs.statSync(fullPath).isDirectory()) {
            cleanEmptyDirs(fullPath);
        }
    }
    if (fs.readdirSync(dir).length === 0) {
        try { fs.rmdirSync(dir); } catch (e) { }
    }
}

console.log('--- Fixing Data Placements Phase ---');
fixSpells();
fixBackgrounds();
fixSpecies();
cleanEmptyDirs(path.join(DATA_ROOT, 'spells'));
cleanEmptyDirs(path.join(DATA_ROOT, 'character'));
console.log('Placements fixed.');
