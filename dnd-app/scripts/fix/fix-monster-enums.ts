import fs from 'fs';
import path from 'path';

const DATA_ROOT = path.join(process.cwd(), 'src/renderer/public/data/5e');
const MONSTERS_DIR = path.join(DATA_ROOT, 'dm/npcs/monsters');

function walkDir(dir: string, fileList: string[] = []): string[] {
    if (!fs.existsSync(dir)) return fileList;
    for (const file of fs.readdirSync(dir)) {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            walkDir(filePath, fileList);
        } else {
            if (filePath.endsWith('.json')) fileList.push(filePath);
        }
    }
    return fileList;
}

function formatDamageArray(arr: any[]): string[] {
    if (!arr || !Array.isArray(arr)) return [];

    const result: string[] = [];
    for (const item of arr) {
        if (typeof item === 'string') {
            result.push(item);
        } else if (typeof item === 'object') {
            let str = '';
            if (Array.isArray(item.damageTypes)) {
                if (item.damageTypes.length > 2) {
                    const last = item.damageTypes.pop();
                    str = item.damageTypes.join(', ') + ', and ' + last;
                } else if (item.damageTypes.length === 2) {
                    str = item.damageTypes.join(' and ');
                } else if (item.damageTypes.length === 1) {
                    str = item.damageTypes[0];
                }
            } else if (item.damageType) {
                str = item.damageType;
            }

            if (item.condition) {
                if (str) str += ' ';
                str += item.condition.toLowerCase();
            }
            if (str) result.push(str);
        }
    }
    return result;
}

function formatConditionArray(arr: any[]): string[] {
    if (!arr || !Array.isArray(arr)) return [];

    const result: string[] = [];
    for (const item of arr) {
        if (typeof item === 'string') {
            result.push(item);
        } else if (typeof item === 'object' && item.condition) {
            result.push(item.condition);
        }
    }
    return result;
}

function fixMonsters() {
    const files = walkDir(MONSTERS_DIR);
    let fixedCount = 0;

    for (const file of files) {
        let changed = false;
        let data;
        try {
            data = JSON.parse(fs.readFileSync(file, 'utf-8'));
        } catch (e) { continue; }

        if (data.resistances && Array.isArray(data.resistances) && typeof data.resistances[0] === 'object') {
            data.resistances = formatDamageArray(data.resistances);
            changed = true;
        }
        if (data.vulnerabilities && Array.isArray(data.vulnerabilities) && typeof data.vulnerabilities[0] === 'object') {
            data.vulnerabilities = formatDamageArray(data.vulnerabilities);
            changed = true;
        }
        if (data.damageImmunities && Array.isArray(data.damageImmunities) && typeof data.damageImmunities[0] === 'object') {
            data.damageImmunities = formatDamageArray(data.damageImmunities);
            changed = true;
        }
        if (data.conditionImmunities && Array.isArray(data.conditionImmunities) && typeof data.conditionImmunities[0] === 'object') {
            data.conditionImmunities = formatConditionArray(data.conditionImmunities);
            changed = true;
        }

        if (changed) {
            fs.writeFileSync(file, JSON.stringify(data, null, 2));
            fixedCount++;
        }
    }

    console.log(`Fixed enum arrays for ${fixedCount} monsters.`);
}

fixMonsters();
