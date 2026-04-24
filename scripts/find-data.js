const fs = require('fs')
const path = require('path')

const dataDir = 'src/renderer/public/data/5e'

function findJsonFiles(dir, results) {
  if (!fs.existsSync(dir)) return results
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f)
    if (fs.statSync(p).isDirectory()) findJsonFiles(p, results)
    else if (f.endsWith('.json')) results.push(p)
  }
  return results
}

const files = findJsonFiles(dataDir, [])
console.log('Total JSON files:', files.length)

const searches = [
  'dice-colors', 'keyboard-shortcuts', 'sound-events', 'moderation',
  'species-resources', 'class-resources', 'ability-score-config', 'preset-icons',
  'ambient-tracks', 'species-spells', 'lighting-travel', 'dm-tabs'
]

for (const s of searches) {
  const matches = files.filter(f => f.includes(s))
  console.log(`${s}: ${matches.length ? matches.join(', ') : 'NOT FOUND'}`)
}
