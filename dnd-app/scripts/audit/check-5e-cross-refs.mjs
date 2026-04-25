#!/usr/bin/env node
/**
 * Walk every 5e JSON file, collect IDs, then collect all references-by-id
 * (heuristically: any string field that ends in `Id` or has a value matching a known ID format),
 * and report references that don't resolve.
 *
 * Heuristic-only — false positives possible. Useful for spot-finding dead links.
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = 'src/renderer/public/data/5e'

const allIds = new Set()
const refs = []

function walk(dir, fn) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(p, fn)
    else if (entry.name.endsWith('.json')) fn(p)
  }
}

function collectIdsFromValue(v) {
  if (v && typeof v === 'object') {
    if (Array.isArray(v)) for (const x of v) collectIdsFromValue(x)
    else {
      for (const [k, val] of Object.entries(v)) {
        if (k === 'id' && typeof val === 'string') allIds.add(val)
        collectIdsFromValue(val)
      }
    }
  }
}

function collectRefsFromValue(v, file, pathSoFar) {
  if (v && typeof v === 'object') {
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) collectRefsFromValue(v[i], file, `${pathSoFar}[${i}]`)
    } else {
      for (const [k, val] of Object.entries(v)) {
        if (typeof val === 'string' && /^[a-z][a-z0-9-]+$/.test(val) && val.includes('-') && val.length >= 4) {
          if (/Id$|Ref$|reference|requires|prerequisite|spell|class|origin|species|background|feat|item|monster/i.test(k)) {
            refs.push({ file: file.replace(ROOT + '/', ''), field: k, value: val })
          }
        }
        collectRefsFromValue(val, file, `${pathSoFar}.${k}`)
      }
    }
  }
}

console.log('Collecting IDs from all 5e files...')
walk(ROOT, (f) => {
  try {
    const d = JSON.parse(fs.readFileSync(f, 'utf-8'))
    collectIdsFromValue(d)
  } catch {}
})
console.log(`Found ${allIds.size} unique 'id' field values\n`)

console.log('Collecting potential references...')
walk(ROOT, (f) => {
  try {
    const d = JSON.parse(fs.readFileSync(f, 'utf-8'))
    collectRefsFromValue(d, f, '$')
  } catch {}
})
console.log(`Found ${refs.length} potential references\n`)

const dead = refs.filter((r) => !allIds.has(r.value))
console.log(`Dead references (heuristic): ${dead.length}\n`)

const groupByFile = new Map()
for (const r of dead) {
  if (!groupByFile.has(r.file)) groupByFile.set(r.file, [])
  groupByFile.get(r.file).push(r)
}

const sortedFiles = [...groupByFile.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 15)
console.log(`Top 15 files with dead refs:\n`)
for (const [f, rs] of sortedFiles) {
  console.log(`${rs.length}  ${f}`)
  for (const r of rs.slice(0, 3)) {
    console.log(`     ${r.field}: ${r.value}`)
  }
  if (rs.length > 3) console.log(`     ... +${rs.length - 3} more`)
}

console.log(`\n=== summary ===`)
console.log(`unique IDs declared: ${allIds.size}`)
console.log(`heuristic refs found: ${refs.length}`)
console.log(`heuristic dead refs:  ${dead.length}`)
console.log(`note: heuristic — false positives expected`)

if (dead.length > 0) process.exit(1)
