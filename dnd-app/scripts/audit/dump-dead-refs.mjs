#!/usr/bin/env node
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

function collectRefsFromValue(v, file) {
  if (v && typeof v === 'object') {
    if (Array.isArray(v)) for (const x of v) collectRefsFromValue(x, file)
    else {
      for (const [k, val] of Object.entries(v)) {
        if (typeof val === 'string' && /^[a-z][a-z0-9-]+$/.test(val) && val.includes('-') && val.length >= 4) {
          if (/Id$|Ref$|reference|requires|prerequisite|spell|class|origin|species|background|feat|item|monster/i.test(k)) {
            refs.push({ file: file.replace(ROOT + '/', ''), field: k, value: val })
          }
        }
        collectRefsFromValue(val, file)
      }
    }
  }
}

walk(ROOT, (f) => {
  try {
    const d = JSON.parse(fs.readFileSync(f, 'utf-8'))
    collectIdsFromValue(d)
  } catch {}
})

walk(ROOT, (f) => {
  try {
    const d = JSON.parse(fs.readFileSync(f, 'utf-8'))
    collectRefsFromValue(d, f)
  } catch {}
})

const target = process.argv[2] || ''
const dead = refs.filter((r) => !allIds.has(r.value))
const filtered = target ? dead.filter((r) => r.file.includes(target)) : dead
for (const r of filtered.sort((a, b) => a.file.localeCompare(b.file) || a.value.localeCompare(b.value))) {
  console.log(`${r.file}\t${r.field}\t${r.value}`)
}
