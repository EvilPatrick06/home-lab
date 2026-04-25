import fs from 'node:fs'
import { z } from 'zod'

import { BackgroundSchema } from '../schemas/backgrounds'
import { BestiarySchema } from '../schemas/bestiary'
import { ClassSchema } from '../schemas/classes'
import { FeatSchema } from '../schemas/feats'
import { MechanicsSchema } from '../schemas/mechanics'
import { SpeciesSchema } from '../schemas/species'
import { SpellsSchema } from '../schemas/spells'
import { WorldSchema } from '../schemas/world'

const DATA = 'src/renderer/public/data/5e'

type Pair = { schema: z.ZodTypeAny; file: string; label: string }

const pairs: Pair[] = [
  { schema: SpellsSchema, file: `${DATA}/spells/spells.json`, label: 'spells/spells.json (SpellsSchema)' },
  { schema: BestiarySchema, file: `${DATA}/dm/npcs/monsters.json`, label: 'dm/npcs/monsters.json (BestiarySchema)' },
  { schema: BestiarySchema, file: `${DATA}/dm/npcs/creatures.json`, label: 'dm/npcs/creatures.json (BestiarySchema)' },
  { schema: BestiarySchema, file: `${DATA}/dm/npcs/npcs.json`, label: 'dm/npcs/npcs.json (BestiarySchema)' },
  { schema: ClassSchema, file: `${DATA}/character/classes.json`, label: 'character/classes.json (ClassSchema)' },
  { schema: BackgroundSchema, file: `${DATA}/character/backgrounds.json`, label: 'character/backgrounds.json (BackgroundSchema)' },
  { schema: FeatSchema, file: `${DATA}/feats/feats.json`, label: 'feats/feats.json (FeatSchema)' },
  { schema: MechanicsSchema, file: `${DATA}/game/mechanics/conditions.json`, label: 'game/mechanics/conditions.json (MechanicsSchema)' },
  { schema: SpeciesSchema, file: `${DATA}/character/species.json`, label: 'character/species.json (SpeciesSchema)' },
  { schema: WorldSchema, file: `${DATA}/world/world.json`, label: 'world/world.json (WorldSchema)' },
]

let totalErrors = 0
for (const p of pairs) {
  if (!fs.existsSync(p.file)) {
    console.log(`SKIP  ${p.label} — file does not exist`)
    continue
  }
  const raw = JSON.parse(fs.readFileSync(p.file, 'utf-8'))
  const result = p.schema.safeParse(raw)
  if (result.success) {
    console.log(`PASS  ${p.label}`)
  } else {
    console.log(`FAIL  ${p.label}: ${result.error.issues.length} issues`)
    for (const issue of result.error.issues.slice(0, 5)) {
      console.log(`        ${issue.path.slice(0, 4).join('.')}: ${issue.message}`)
    }
    if (result.error.issues.length > 5) {
      console.log(`        ... +${result.error.issues.length - 5} more`)
    }
    totalErrors += result.error.issues.length
  }
}
console.log(`\n=== Total errors: ${totalErrors} ===`)
