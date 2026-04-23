import fs from 'fs';
import path from 'path';

// --- Configuration ---
const PROJECT_ROOT = 'c:\\Users\\evilp\\dnd';
const DATA_ROOT = path.join(PROJECT_ROOT, 'src/renderer/public/data/5e');
const REPORT_FILE = path.join(PROJECT_ROOT, 'audit-report-v3.md');
const RESEARCH_NOTES_PATH = 'C:/Users/evilp/Downloads/Research Notes';
const SRC_DIR_PHB = path.join(PROJECT_ROOT, '5.5e References/PHB2024/markdown');
const SRC_DIR_DMG = path.join(PROJECT_ROOT, '5.5e References/DMG2024/markdown');
const SRC_DIR_MM = path.join(PROJECT_ROOT, '5.5e References/MM2025/markdown');

// --- Strict Enums ---
const OFFICIAL_DAMAGE_TYPES = ['bludgeoning', 'piercing', 'slashing', 'acid', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'poison', 'psychic', 'radiant', 'thunder'];
const OFFICIAL_CONDITIONS = ['blinded', 'charmed', 'deafened', 'exhaustion', 'frightened', 'grappled', 'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious'];
const OFFICIAL_SIZES = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'];
const OFFICIAL_CREATURE_TYPES = ['aberration', 'beast', 'celestial', 'construct', 'dragon', 'elemental', 'fey', 'fiend', 'giant', 'humanoid', 'monstrosity', 'ooze', 'plant', 'undead'];

interface Issue {
    severity: 'CRITICAL' | 'WARNING' | 'INFO';
    category: string;
    file: string;
    message: string;
}

const issues: Issue[] = [];

// --- Helpers ---
function report(severity: 'CRITICAL' | 'WARNING' | 'INFO', category: string, file: string, message: string) {
    issues.push({ severity, category, file, message });
}

function walkDir(dir: string, fileList: string[] = []): string[] {
    if (!fs.existsSync(dir)) return fileList;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            walkDir(filePath, fileList);
        } else {
            fileList.push(filePath);
        }
    }
    return fileList;
}

// --- Check 1: Empty Values (Null, "", [], {}) ---
function recursivelyCheckEmptyValues(obj: any, filePath: string, keyPath: string = '') {
    if (obj === null) {
        report('CRITICAL', 'Empty Property', filePath, `Key path \`${keyPath}\` is null.`);
        return;
    }
    if (obj === undefined) {
        report('CRITICAL', 'Empty Property', filePath, `Key path \`${keyPath}\` is undefined.`);
        return;
    }
    if (typeof obj === 'string') {
        if (obj.trim() === '' || obj.toLowerCase() === 'tbd' || obj.toLowerCase() === 'error') {
            report('CRITICAL', 'Empty Property', filePath, `Key path \`${keyPath}\` appears to be intentionally empty or error: "${obj}"`);
        }
        return;
    }
    if (Array.isArray(obj)) {
        if (obj.length === 0) {
            report('WARNING', 'Empty Array', filePath, `Key path \`${keyPath}\` is an empty array.`);
        } else {
            for (let i = 0; i < obj.length; i++) {
                recursivelyCheckEmptyValues(obj[i], filePath, `${keyPath}[${i}]`);
            }
        }
        return;
    }
    if (typeof obj === 'object') {
        const keys = Object.keys(obj);
        if (keys.length === 0) {
            report('WARNING', 'Empty Object', filePath, `Key path \`${keyPath}\` is an empty object.`);
        } else {
            for (const key of keys) {
                recursivelyCheckEmptyValues(obj[key], filePath, keyPath ? `${keyPath}.${key}` : key);
            }
        }
    }
}

// --- Check 2: Extract Enums & Enforce Strictness ---
function validateEnums(obj: any, filePath: string) {
    const jsonStr = JSON.stringify(obj, null, 2);
    const regexDamage = /"damageType"\s*:\s*"([^"]+)"/g;
    let match;
    while ((match = regexDamage.exec(jsonStr)) !== null) {
        if (!OFFICIAL_DAMAGE_TYPES.includes(match[1].toLowerCase())) {
            report('CRITICAL', 'Enum Violation', filePath, `Invalid damageType '${match[1]}'.`);
        }
    }

    const regexCondition = /"condition"\s*:\s*"([^"]+)"/g;
    while ((match = regexCondition.exec(jsonStr)) !== null) {
        if (!OFFICIAL_CONDITIONS.includes(match[1].toLowerCase())) {
            report('CRITICAL', 'Enum Violation', filePath, `Invalid condition '${match[1]}'.`);
        }
    }

    // Check type and size globally
    if (obj.type && typeof obj.type === 'string' && !OFFICIAL_CREATURE_TYPES.includes(obj.type.toLowerCase())) {
        report('WARNING', 'Enum Violation', filePath, `Potentially invalid creature type '${obj.type}'.`);
    }
    if (obj.size && typeof obj.size === 'string' && !OFFICIAL_SIZES.includes(obj.size.toLowerCase())) {
        report('WARNING', 'Enum Violation', filePath, `Potentially invalid size '${obj.size}'.`);
    }
}

// --- Main Execution ---
function main() {
    console.log('--- Starting Ultimate Audit V3 ---');

    const allJsonFiles = walkDir(DATA_ROOT).filter(f => f.endsWith('.json'));
    console.log(`Auditing ${allJsonFiles.length} JSON files...`);

    let fileJsonLengths = 0;

    for (const file of allJsonFiles) {
        const relPath = path.relative(DATA_ROOT, file).replace(/\\/g, '/');
        let data;
        try {
            const content = fs.readFileSync(file, 'utf-8');
            fileJsonLengths += content.length; // primitive metric
            data = JSON.parse(content);
        } catch (e: any) {
            report('CRITICAL', 'JSON Parse Error', relPath, `Failed to parse: ${e.message}`);
            continue;
        }

        recursivelyCheckEmptyValues(data, relPath);
        validateEnums(data, relPath);

        // Deep Spec Paths (Checking for loose spells or monsters)
        if (relPath.startsWith('spells/') && relPath.split('/').length < 4) {
            report('CRITICAL', 'Path Spec Violation', relPath, `Spells must be nested strictly. Found at depth ${relPath.split('/').length}.`);
        }

        // Check subclass existence
        if (relPath.startsWith('classes/') && !relPath.includes('subclasses')) {
            // This is a base class. We should expect a subclass folder.
            const className = path.basename(relPath, '.json');
            const expectedSubclassDir = path.join(DATA_ROOT, 'classes', `${className}-subclasses`);
            if (!fs.existsSync(expectedSubclassDir)) {
                report('CRITICAL', 'Missing Integration', relPath, `Base class found, but expected subclass directory is missing: classes/${className}-subclasses/`);
            }
        }
    }

    // Truncation check
    const allSrcFiles = [
        ...walkDir(SRC_DIR_PHB).filter(f => f.endsWith('.md')),
        ...walkDir(SRC_DIR_DMG).filter(f => f.endsWith('.md')),
        ...walkDir(SRC_DIR_MM).filter(f => f.endsWith('.md'))
    ];

    let srcMdLengths = 0;
    for (const md of allSrcFiles) {
        const content = fs.readFileSync(md, 'utf-8');
        srcMdLengths += content.length;
    }

    // Not exact translation due to formatting JSON overhead, but if src > json * 2, we missed stuff.
    if (fileJsonLengths < srcMdLengths) {
        report('INFO', 'Source Truncation', 'GLOBAL', `Source length is ${srcMdLengths} chars; JSON data length is ${fileJsonLengths} chars. (JSON format bloats length, so if JSON is smaller than MD, data was massively lost/truncated!)`);
    }

    // Find Research Notes
    try {
        const notes = fs.readFileSync(RESEARCH_NOTES_PATH, 'utf-8');
        // Do path reverse lookup: does every single file map to something in research notes? (Very hard, skipping manual regex for now).
    } catch (e) { }

    // Generate Report
    const critical = issues.filter(i => i.severity === 'CRITICAL');
    const warnings = issues.filter(i => i.severity === 'WARNING');
    const infos = issues.filter(i => i.severity === 'INFO');

    let reportMd = `# D&D 5.5e Data Audit Report - V3 (Deep Inspection)\n\n`;
    reportMd += `Generated on: ${new Date().toISOString()}\n`;
    reportMd += `Total Files Audited: ${allJsonFiles.length}\n\n`;
    reportMd += `## Summary\n`;
    reportMd += `- **CRITICAL**: ${critical.length} (Empty properties, wrong enums, broken paths)\n`;
    reportMd += `- **WARNING**: ${warnings.length}\n`;
    reportMd += `- **INFO**: ${infos.length}\n\n`;

    function writeSection(title: string, list: Issue[]) {
        reportMd += `## ${title} (${list.length})\n`;
        reportMd += `| Category | File | Message |\n|---|---|---|\n`;
        list.forEach(i => {
            reportMd += `| ${i.category} | \`${i.file}\` | ${i.message} |\n`;
        });
        reportMd += `\n`;
    }

    writeSection('🔴 CRITICAL ISSUES', critical);
    writeSection('🟡 WARNINGS', warnings);
    writeSection('🔵 INFO', infos);

    fs.writeFileSync(REPORT_FILE, reportMd);
    console.log(`Report generated at ${REPORT_FILE}`);
}

main();
