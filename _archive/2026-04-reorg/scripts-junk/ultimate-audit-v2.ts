import * as fs from 'fs'
import * as path from 'path'

// -- CONSTANTS --
const DATA_DIR = path.join(process.cwd(), 'src/renderer/public/data/5e')
const RESEARCH_NOTES_PATH = path.join(process.cwd(), '../Downloads/Research Notes')
const PHB_DIR = path.join(process.cwd(), '5.5e References/PHB2024/markdown')
const DMG_DIR = path.join(process.cwd(), '5.5e References/DMG2024/markdown')
const MM_DIR = path.join(process.cwd(), '5.5e References/MM2025/markdown')
const REPORT_FILE = path.join(process.cwd(), 'audit-report-v2.md')

// -- STATE --
type Severity = 'CRITICAL' | 'WARNING' | 'INFO' | 'SUCCESS'
interface Issue { sev: Severity, category: string, file: string, message: string }
const issues: Issue[] = []
let totalJsonFiles = 0

const jsonCache: Record<string, any> = {}
const allJsonPaths: string[] = []
const slugToFileMap: Record<string, string[]> = {}

// -- HELPERS --
function report(sev: Severity, category: string, file: string, message: string) {
    issues.push({ sev, category, file, message })
}
function kebabCase(str: string): string {
    if (!str) return ''
    return str.replace(/['']/g, '').replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()
}
function walkSync(dir: string, filelist: string[] = []) {
    if (!fs.existsSync(dir)) return filelist
    const files = fs.readdirSync(dir)
    for (const file of files) {
        const p = path.join(dir, file)
        if (fs.statSync(p).isDirectory()) {
            walkSync(p, filelist)
        } else {
            filelist.push(p)
        }
    }
    return filelist
}
function getSlugsFromMarkdown(filePath: string): { slug: string, type: 'heading' | 'table', original: string }[] {
    if (!fs.existsSync(filePath)) return []
    const content = fs.readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')
    const results: { slug: string, type: 'heading' | 'table', original: string }[] = []

    let inTable = false
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()
        const headerMatch = line.match(/^(#{1,6})\s+(.+)/)
        if (headerMatch) {
            results.push({ slug: kebabCase(headerMatch[2]), type: 'heading', original: headerMatch[2] })
            inTable = false
            continue
        }
        if (line.startsWith('|')) {
            if (!inTable) {
                const cols = line.split('|').map(c => c.trim()).filter(c => c.length > 0)
                if (cols.length > 0) {
                    results.push({ slug: kebabCase(cols[0]), type: 'table', original: cols[0] })
                }
                inTable = true
            }
        } else {
            inTable = false
        }
    }
    return results
}

function verifyReference(sourceFile: string, refString: string, context: string) {
    const relPath = sourceFile.replace(DATA_DIR, '')
    const slug = kebabCase(refString)
    if (!slugToFileMap[slug] || slugToFileMap[slug].length === 0) {
        report('WARNING', 'Broken Reference', relPath, "Referencing missing entity '" + refString + "' [slug: " + slug + "] via " + context)
    }
}

// -------------------------------------------------------------
// EXECUTION
// -------------------------------------------------------------

console.log('--- STARTING EXHAUSTIVE DATA AUDIT V2 ---')

// 1. Initial Load & Indexing
console.log('[1/6] Indexing all JSON files into memory cache...')
const allFiles = walkSync(DATA_DIR)
for (const f of allFiles) {
    if (f.endsWith('.json')) {
        allJsonPaths.push(f)
        totalJsonFiles++
        try {
            const data = JSON.parse(fs.readFileSync(f, 'utf-8'))
            jsonCache[f] = data

            const slug = data.slug || path.basename(f, '.json')
            if (!slugToFileMap[slug]) slugToFileMap[slug] = []
            slugToFileMap[slug].push(f)

            if (data.name) {
                const nameSlug = kebabCase(data.name)
                if (nameSlug !== slug) {
                    if (!slugToFileMap[nameSlug]) slugToFileMap[nameSlug] = []
                    slugToFileMap[nameSlug].push(f)
                }
            }
        } catch (e) {
            report('CRITICAL', 'JSON Parse Error', f.replace(DATA_DIR, ''), 'File is not valid JSON.')
        }
    }
}

// 2. Strict Formatting Constraints
console.log('[2/6] Running strict formatting constraints on core properties...')
for (const f of allJsonPaths) {
    const data = jsonCache[f]
    if (!data) continue
    const relPath = f.replace(DATA_DIR, '')

    // Monster formatting checks
    if (relPath.includes('monsters') || relPath.includes('dm\\\\npcs')) {
        if (data.ac !== undefined) {
            const acStr = String(data.ac)
            const acRegex = new RegExp("^\\\\d+(?:\\\\s*\\\\(.*?\\\\))?$")
            if (!acRegex.test(acStr)) {
                report('WARNING', 'Formatting Constraint', relPath, "AC value '" + acStr + "' violates expected pattern.")
            }
        }
        if (data.hp !== undefined) {
            const hpStr = String(data.hp)
            const hpRegex = new RegExp("^\\\\d+(?:\\\\s*\\\\(\\\\d+d\\\\d+(?:\\\\s*[\\\\+-]\\\\s*\\\\d+)?\\\\))?$")
            if (!hpRegex.test(hpStr)) {
                report('WARNING', 'Formatting Constraint', relPath, "HP value '" + hpStr + "' violates expected pattern.")
            }
        }
        if (data.cr !== undefined) {
            const crStr = String(data.cr)
            const crRegex = new RegExp("^(?:0|1/8|1/4|1/2|[1-9]|[1-2][0-9]|30)(?:\\\\s*\\\\(XP.*?\\\\))?")
            if (!crRegex.test(crStr)) {
                report('WARNING', 'Formatting Constraint', relPath, "CR value '" + crStr + "' violates strict 5e enum + XP pattern.")
            }
        }
        if (data.speed !== undefined) {
            if (typeof data.speed === 'string' && !data.speed.includes('ft.')) {
                report('WARNING', 'Formatting Constraint', relPath, "Speed value '" + data.speed + "' is missing 'ft.' unit identifier.")
            }
        }
    }
}

// 3. Deep Referential Integrity
console.log('[3/6] Checking Deep Referential Integrity Connections...')
for (const f of allJsonPaths) {
    const data = jsonCache[f]
    if (!data) continue
    const relPath = f.replace(DATA_DIR, '')

    // Spell -> Classes constraint
    if (relPath.includes('spells') && Array.isArray(data.classes)) {
        for (const c of data.classes) {
            verifyReference(f, c, 'spell->class constraint')
        }
    }

    // Class -> Spell List constraint
    if (relPath.includes('classes') && Array.isArray(data.spellList)) {
        for (const s of data.spellList) {
            verifyReference(f, s.name || s, 'class->spell_list constraint')
        }
    }

    // Monsters -> Spells
    if ((relPath.includes('monsters') || relPath.includes('dm\\\\npcs')) && data.spellcasting) {
        if (Array.isArray(data.spellcasting)) {
            data.spellcasting.forEach((sc: any) => {
                if (sc.spells && Array.isArray(sc.spells)) {
                    sc.spells.forEach((s: any) => verifyReference(f, s.name || s, 'monster->spell constraint'))
                }
            })
        } else if (data.spellcasting.spells && Array.isArray(data.spellcasting.spells)) {
            data.spellcasting.spells.forEach((s: any) => verifyReference(f, s.name || s, 'monster->spell constraint'))
        }
    }

    // Equipment -> Tool constraint
    if (relPath.includes('equipment') && data.mastery) {
        verifyReference(f, data.mastery, 'weapon->mastery constraint')
    }
}

// 4. Universal Markdown Coverage Engine
console.log('[4/6] Universal Markdown Coverage Engine...')
const sourceDirs = [{ name: 'PHB', dir: PHB_DIR }, { name: 'DMG', dir: DMG_DIR }, { name: 'MM', dir: MM_DIR }]
for (const s of sourceDirs) {
    const mdFiles = walkSync(s.dir).filter(f => f.endsWith('.md'))
    for (const md of mdFiles) {
        const elems = getSlugsFromMarkdown(md)
        for (const elem of elems) {
            // Filter out known structural elements we don't map to single files
            if (elem.original.includes('Chapter') || elem.original.toLowerCase().includes('appendix') || elem.original.toLowerCase().includes('introduction')) continue;

            if (!slugToFileMap[elem.slug] || slugToFileMap[elem.slug].length === 0) {
                report('INFO', 'Source Coverage Gap', s.name + ' - ' + path.basename(md), "Unmapped " + elem.type + ": '" + elem.original + "' (slug: " + elem.slug + ") no direct JSON file match.")
            }
        }
    }
}

// 5. Research Notes Spec Adherence
console.log('[5/6] Checking specific rule mappings from Research Notes...')
if (fs.existsSync(RESEARCH_NOTES_PATH)) {
    const content = fs.readFileSync(RESEARCH_NOTES_PATH, 'utf-8')
    const pathMatches = content.match(/[a-zA-Z0-9-]+\/[a-zA-Z0-9-\/]+/g)
    if (pathMatches) {
        for (const p of pathMatches) {
            if (p.includes('.') || p.includes('http') || p.includes('..') || p.length < 5) continue
            const targetDir = path.join(DATA_DIR, p)
            if (!fs.existsSync(targetDir) && !fs.existsSync(targetDir + '.json')) {
                report('WARNING', 'Research Notes Spec', p, 'Path referenced in Research Notes does not exist in data directory.')
            }
        }
    }
}

// 6. Generate Report
console.log('[6/6] Generating Report V2...')
const cissues = issues.filter(i => i.sev === 'CRITICAL')
const wissues = issues.filter(i => i.sev === 'WARNING')
const iissues = issues.filter(i => i.sev === 'INFO')

let md = "# D&D 5.5e Exhaustive Data Audit V2\\n\\n"
md += "## Summary\\n"
md += "- **Total JSON Files Audited:** " + totalJsonFiles + "\\n"
md += "- **🔴 CRITICAL Issues:** " + cissues.length + "\\n"
md += "- **🟡 WARNING Issues:** " + wissues.length + "\\n"
md += "- **🔵 INFO Issues:** " + iissues.length + "\\n\\n"
md += "## Details\\n\\n"

const sortedIssueKeys = ['CRITICAL', 'WARNING', 'INFO'] as const
for (const k of sortedIssueKeys) {
    const filtered = issues.filter(i => i.sev === k)
    if (filtered.length > 0) {
        md += "### " + (k === 'CRITICAL' ? '🔴' : k === 'WARNING' ? '🟡' : '🔵') + " " + k + " (" + filtered.length + ")\\n\\n"
        md += "| Category | File/Context | Message |\\n"
        md += "|---|---|---|\\n"
        for (const issue of filtered) {
            md += "| " + issue.category + " | `" + issue.file + "` | " + issue.message + " |\\n"
        }
        md += "\\n"
    }
}

fs.writeFileSync(REPORT_FILE, md, 'utf-8')
console.log('--- EXHAUSTIVE AUDIT V2 COMPLETE ---')
console.log('Saved to', REPORT_FILE)
